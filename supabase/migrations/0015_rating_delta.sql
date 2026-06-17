-- Xadrez Arena — Migration 0015
-- Persiste a variação de rating ELO por partida pra exibição no modal de fim.
-- Atualiza todas as RPCs que computam delta de rating (record_move, resign,
-- accept_draw, claim_draw, settle_timeout).

ALTER TABLE chess_matches
  ADD COLUMN IF NOT EXISTS white_rating_delta int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS black_rating_delta int NOT NULL DEFAULT 0;

-- ============================================================
-- chess_record_move
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_record_move' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION chess_record_move(
  p_user_id      text,
  p_match_id     text,
  p_fen          text,
  p_pgn          text,
  p_san          text,
  p_uci          text,
  p_turn         text,
  p_is_checkmate boolean,
  p_is_draw      boolean,
  p_is_game_over boolean,
  p_move_time_ms int DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m              chess_matches;
  v_new_ply      int;
  v_my_color     text;
  v_winner_id    text;
  v_loser_id     text;
  v_result       chess_match_result;
  v_pot          int;
  v_rake         int;
  v_payout       int;
  v_balance      int;
  v_is_bot_match boolean;
  v_wr  int; v_lr  int;
  v_wg  int; v_lg  int;
  v_kw  int; v_kl  int;
  v_ew  float;
  v_dw  int; v_dl  int;
  v_white_delta int := 0;
  v_black_delta int := 0;
  v_elapsed_ms  int;
  v_remaining   int;
  v_inc_ms      int;
  v_w_time      int;
  v_b_time      int;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;

  IF EXISTS (SELECT 1 FROM chess_users WHERE id = p_user_id AND banned_at IS NOT NULL) THEN
    RAISE EXCEPTION 'user_banned';
  END IF;

  IF m.white_user_id = p_user_id THEN v_my_color := 'w';
  ELSIF m.black_user_id = p_user_id THEN v_my_color := 'b';
  ELSE RAISE EXCEPTION 'not_a_player'; END IF;

  IF m.turn <> v_my_color THEN RAISE EXCEPTION 'not_your_turn'; END IF;

  v_is_bot_match := m.bot_difficulty IS NOT NULL;
  v_new_ply      := m.move_count + 1;
  v_w_time       := m.white_time_ms;
  v_b_time       := m.black_time_ms;

  IF m.time_control_seconds IS NOT NULL AND m.last_move_at IS NOT NULL THEN
    v_elapsed_ms := GREATEST(0, (EXTRACT(EPOCH FROM (now() - m.last_move_at)) * 1000)::int);
    v_inc_ms     := COALESCE(m.time_increment_seconds, 0) * 1000;
    IF v_my_color = 'w' THEN
      v_remaining := COALESCE(v_w_time, m.time_control_seconds * 1000) - v_elapsed_ms;
      IF v_remaining < 0 THEN
        v_winner_id := m.black_user_id;
        v_loser_id  := m.white_user_id;
        v_result    := 'WHITE_TIMEOUT';
        v_w_time    := 0;
      ELSE
        v_w_time := v_remaining + v_inc_ms;
      END IF;
    ELSE
      v_remaining := COALESCE(v_b_time, m.time_control_seconds * 1000) - v_elapsed_ms;
      IF v_remaining < 0 THEN
        v_winner_id := m.white_user_id;
        v_loser_id  := m.black_user_id;
        v_result    := 'BLACK_TIMEOUT';
        v_b_time    := 0;
      ELSE
        v_b_time := v_remaining + v_inc_ms;
      END IF;
    END IF;
  END IF;

  IF v_result IN ('WHITE_TIMEOUT','BLACK_TIMEOUT') THEN
    PERFORM chess_settle_timeout(p_match_id, v_winner_id, v_loser_id, v_result);
    RETURN jsonb_build_object('match_id', p_match_id, 'flagged', true);
  END IF;

  INSERT INTO chess_moves (match_id, ply, san, uci, fen_after, by_user_id, move_time_ms)
  VALUES (p_match_id, v_new_ply, p_san, p_uci, p_fen, p_user_id, p_move_time_ms);

  IF p_is_game_over THEN
    IF p_is_checkmate THEN
      v_winner_id := p_user_id;
      v_loser_id  := CASE WHEN v_winner_id = m.white_user_id THEN m.black_user_id ELSE m.white_user_id END;
      v_result    := CASE WHEN v_my_color = 'w' THEN 'WHITE_WIN'::chess_match_result ELSE 'BLACK_WIN'::chess_match_result END;
    ELSE
      v_result := 'DRAW'::chess_match_result;
    END IF;

    IF v_result = 'DRAW' THEN
      IF m.wager > 0 AND m.white_user_id IS NOT NULL THEN
        UPDATE chess_wallets SET balance = balance + m.wager, locked = locked - m.wager, updated_at = now()
          WHERE user_id = m.white_user_id RETURNING balance INTO v_balance;
        INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
          VALUES (m.white_user_id, 'WAGER_REFUND', m.wager, v_balance, p_match_id, 'Empate - aposta devolvida');
      END IF;
      IF m.wager > 0 AND m.black_user_id IS NOT NULL THEN
        UPDATE chess_wallets SET balance = balance + m.wager, locked = locked - m.wager, updated_at = now()
          WHERE user_id = m.black_user_id RETURNING balance INTO v_balance;
        INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
          VALUES (m.black_user_id, 'WAGER_REFUND', m.wager, v_balance, p_match_id, 'Empate - aposta devolvida');
      END IF;

      IF NOT v_is_bot_match AND m.white_user_id IS NOT NULL AND m.black_user_id IS NOT NULL THEN
        SELECT rating, games_played INTO v_wr, v_wg FROM chess_users WHERE id = m.white_user_id;
        SELECT rating, games_played INTO v_lr, v_lg FROM chess_users WHERE id = m.black_user_id;
        v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
        v_kl := CASE WHEN v_lg < 10 THEN 40 WHEN v_lg < 30 THEN 20 ELSE 10 END;
        v_ew := 1.0 / (1.0 + POWER(10.0, (v_lr - v_wr)::float / 400.0));
        v_dw := ROUND(v_kw * (0.5 - v_ew))::int;
        v_dl := ROUND(v_kl * (0.5 - (1.0 - v_ew)))::int;
        UPDATE chess_users SET rating = GREATEST(100, rating + v_dw), games_played = games_played + 1, updated_at = now()
          WHERE id = m.white_user_id;
        UPDATE chess_users SET rating = GREATEST(100, rating + v_dl), games_played = games_played + 1, updated_at = now()
          WHERE id = m.black_user_id;
        v_white_delta := v_dw;
        v_black_delta := v_dl;
      END IF;
      v_payout := 0;
    ELSE
      v_pot    := m.wager * 2;
      v_rake   := (v_pot * m.rake_bps) / 10000;
      v_payout := v_pot - v_rake;

      IF m.wager > 0 AND v_loser_id IS NOT NULL THEN
        UPDATE chess_wallets SET locked = locked - m.wager, updated_at = now()
          WHERE user_id = v_loser_id RETURNING balance INTO v_balance;
        INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
          VALUES (v_loser_id, 'WAGER_LOSS', -m.wager, v_balance, p_match_id, 'Aposta perdida');
      END IF;
      IF m.wager > 0 AND v_winner_id IS NOT NULL THEN
        UPDATE chess_wallets SET locked = locked - m.wager, updated_at = now() WHERE user_id = v_winner_id;
        UPDATE chess_wallets SET balance = balance + v_payout, updated_at = now()
          WHERE user_id = v_winner_id RETURNING balance INTO v_balance;
        INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
          VALUES (v_winner_id, 'WAGER_WIN', v_payout, v_balance, p_match_id, 'Prêmio recebido');
      END IF;

      IF NOT v_is_bot_match AND v_winner_id IS NOT NULL AND v_loser_id IS NOT NULL THEN
        SELECT rating, games_played INTO v_wr, v_wg FROM chess_users WHERE id = v_winner_id;
        SELECT rating, games_played INTO v_lr, v_lg FROM chess_users WHERE id = v_loser_id;
        v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
        v_kl := CASE WHEN v_lg < 10 THEN 40 WHEN v_lg < 30 THEN 20 ELSE 10 END;
        v_ew := 1.0 / (1.0 + POWER(10.0, (v_lr - v_wr)::float / 400.0));
        v_dw := ROUND(v_kw * (1.0 - v_ew))::int;
        v_dl := ROUND(v_kl * (0.0 - v_ew))::int;
        UPDATE chess_users SET rating = GREATEST(100, rating + v_dw), games_played = games_played + 1, updated_at = now()
          WHERE id = v_winner_id;
        UPDATE chess_users SET rating = GREATEST(100, rating + v_dl), games_played = games_played + 1, updated_at = now()
          WHERE id = v_loser_id;
        IF v_winner_id = m.white_user_id THEN
          v_white_delta := v_dw; v_black_delta := v_dl;
        ELSE
          v_white_delta := v_dl; v_black_delta := v_dw;
        END IF;
      END IF;
    END IF;

    UPDATE chess_matches SET
      fen = p_fen, pgn = p_pgn, move_count = v_new_ply, turn = p_turn,
      status = 'FINISHED', result = v_result, winner_id = v_winner_id,
      payout = v_payout, finished_at = now(),
      white_time_ms = v_w_time, black_time_ms = v_b_time,
      last_move_at  = NULL,
      draw_offered_by = NULL, draw_offered_at = NULL,
      white_rating_delta = v_white_delta,
      black_rating_delta = v_black_delta,
      updated_at = now()
    WHERE id = p_match_id;
  ELSE
    UPDATE chess_matches SET
      fen = p_fen, pgn = p_pgn, move_count = v_new_ply, turn = p_turn,
      white_time_ms = v_w_time, black_time_ms = v_b_time,
      last_move_at  = CASE WHEN m.time_control_seconds IS NULL THEN m.last_move_at ELSE now() END,
      draw_offered_by = NULL, draw_offered_at = NULL,
      updated_at = now()
    WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object('match_id', p_match_id, 'ply', v_new_ply, 'is_bot_match', v_is_bot_match);
END $$;

-- ============================================================
-- chess_resign_match
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_resign_match' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION chess_resign_match(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m           chess_matches;
  v_my_color  text;
  v_winner_id text;
  v_result    chess_match_result;
  v_pot       int;
  v_rake      int;
  v_payout    int;
  v_balance   int;
  v_wr  int; v_lr  int;
  v_wg  int; v_lg  int;
  v_kw  int; v_kl  int;
  v_ew  float;
  v_dw  int; v_dl  int;
  v_white_delta int := 0;
  v_black_delta int := 0;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;

  IF m.white_user_id = p_user_id THEN v_my_color := 'w';
  ELSIF m.black_user_id = p_user_id THEN v_my_color := 'b';
  ELSE RAISE EXCEPTION 'not_a_player'; END IF;

  v_winner_id := CASE WHEN v_my_color = 'w' THEN m.black_user_id ELSE m.white_user_id END;
  v_result    := CASE WHEN v_my_color = 'w' THEN 'WHITE_RESIGN'::chess_match_result ELSE 'BLACK_RESIGN'::chess_match_result END;
  v_pot       := m.wager * 2;
  v_rake      := (v_pot * m.rake_bps) / 10000;
  v_payout    := v_pot - v_rake;

  IF m.wager > 0 THEN
    UPDATE chess_wallets SET locked = locked - m.wager, updated_at = now()
      WHERE user_id = p_user_id RETURNING balance INTO v_balance;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
      VALUES (p_user_id, 'WAGER_LOSS', -m.wager, v_balance, p_match_id, 'Desistência');
    IF v_winner_id IS NOT NULL THEN
      UPDATE chess_wallets SET locked = locked - m.wager, updated_at = now() WHERE user_id = v_winner_id;
      UPDATE chess_wallets SET balance = balance + v_payout, updated_at = now()
        WHERE user_id = v_winner_id RETURNING balance INTO v_balance;
      INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
        VALUES (v_winner_id, 'WAGER_WIN', v_payout, v_balance, p_match_id, 'Vitória por desistência');
    END IF;
  END IF;

  IF m.bot_difficulty IS NULL AND v_winner_id IS NOT NULL THEN
    SELECT rating, games_played INTO v_wr, v_wg FROM chess_users WHERE id = v_winner_id;
    SELECT rating, games_played INTO v_lr, v_lg FROM chess_users WHERE id = p_user_id;
    v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
    v_kl := CASE WHEN v_lg < 10 THEN 40 WHEN v_lg < 30 THEN 20 ELSE 10 END;
    v_ew := 1.0 / (1.0 + POWER(10.0, (v_lr - v_wr)::float / 400.0));
    v_dw := ROUND(v_kw * (1.0 - v_ew))::int;
    v_dl := ROUND(v_kl * (0.0 - v_ew))::int;
    UPDATE chess_users SET rating = GREATEST(100, rating + v_dw), games_played = games_played + 1, updated_at = now()
      WHERE id = v_winner_id;
    UPDATE chess_users SET rating = GREATEST(100, rating + v_dl), games_played = games_played + 1, updated_at = now()
      WHERE id = p_user_id;
    IF v_winner_id = m.white_user_id THEN
      v_white_delta := v_dw; v_black_delta := v_dl;
    ELSE
      v_white_delta := v_dl; v_black_delta := v_dw;
    END IF;
  END IF;

  UPDATE chess_matches SET
    status = 'FINISHED', result = v_result, winner_id = v_winner_id,
    payout = v_payout, finished_at = now(),
    white_rating_delta = v_white_delta,
    black_rating_delta = v_black_delta,
    updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('match_id', p_match_id);
END $$;

-- ============================================================
-- chess_settle_timeout (idem)
-- ============================================================
CREATE OR REPLACE FUNCTION chess_settle_timeout(
  p_match_id  text,
  p_winner_id text,
  p_loser_id  text,
  p_result    chess_match_result
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  m         chess_matches;
  v_pot     int;
  v_rake    int;
  v_payout  int;
  v_balance int;
  v_wr      int; v_lr int;
  v_wg      int; v_lg int;
  v_kw      int; v_kl int;
  v_ew      float;
  v_dw      int; v_dl int;
  v_white_delta int := 0;
  v_black_delta int := 0;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id;
  IF NOT FOUND OR m.status <> 'ACTIVE' THEN RETURN; END IF;

  v_pot    := m.wager * 2;
  v_rake   := (v_pot * m.rake_bps) / 10000;
  v_payout := v_pot - v_rake;

  IF m.wager > 0 AND p_loser_id IS NOT NULL THEN
    UPDATE chess_wallets SET locked = locked - m.wager, updated_at = now()
      WHERE user_id = p_loser_id RETURNING balance INTO v_balance;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
      VALUES (p_loser_id, 'WAGER_LOSS', -m.wager, v_balance, p_match_id, 'Tempo esgotado');
  END IF;
  IF m.wager > 0 AND p_winner_id IS NOT NULL THEN
    UPDATE chess_wallets SET locked = locked - m.wager, updated_at = now() WHERE user_id = p_winner_id;
    UPDATE chess_wallets SET balance = balance + v_payout, updated_at = now()
      WHERE user_id = p_winner_id RETURNING balance INTO v_balance;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
      VALUES (p_winner_id, 'WAGER_WIN', v_payout, v_balance, p_match_id, 'Vitória por tempo');
  END IF;

  IF m.bot_difficulty IS NULL AND p_winner_id IS NOT NULL AND p_loser_id IS NOT NULL THEN
    SELECT rating, games_played INTO v_wr, v_wg FROM chess_users WHERE id = p_winner_id;
    SELECT rating, games_played INTO v_lr, v_lg FROM chess_users WHERE id = p_loser_id;
    v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
    v_kl := CASE WHEN v_lg < 10 THEN 40 WHEN v_lg < 30 THEN 20 ELSE 10 END;
    v_ew := 1.0 / (1.0 + POWER(10.0, (v_lr - v_wr)::float / 400.0));
    v_dw := ROUND(v_kw * (1.0 - v_ew))::int;
    v_dl := ROUND(v_kl * (0.0 - v_ew))::int;
    UPDATE chess_users SET rating = GREATEST(100, rating + v_dw), games_played = games_played + 1, updated_at = now()
      WHERE id = p_winner_id;
    UPDATE chess_users SET rating = GREATEST(100, rating + v_dl), games_played = games_played + 1, updated_at = now()
      WHERE id = p_loser_id;
    IF p_winner_id = m.white_user_id THEN
      v_white_delta := v_dw; v_black_delta := v_dl;
    ELSE
      v_white_delta := v_dl; v_black_delta := v_dw;
    END IF;
  END IF;

  UPDATE chess_matches SET
    status = 'FINISHED', result = p_result, winner_id = p_winner_id,
    payout = v_payout, finished_at = now(),
    white_time_ms = CASE WHEN p_result = 'WHITE_TIMEOUT' THEN 0 ELSE white_time_ms END,
    black_time_ms = CASE WHEN p_result = 'BLACK_TIMEOUT' THEN 0 ELSE black_time_ms END,
    last_move_at  = NULL,
    draw_offered_by = NULL, draw_offered_at = NULL,
    white_rating_delta = v_white_delta,
    black_rating_delta = v_black_delta,
    updated_at = now()
  WHERE id = p_match_id;
END $$;

-- ============================================================
-- chess_accept_draw e chess_claim_draw — também escrevem deltas
-- ============================================================
CREATE OR REPLACE FUNCTION chess_accept_draw(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m         chess_matches;
  v_balance int;
  v_wr int; v_lr int;
  v_wg int; v_lg int;
  v_kw int; v_kl int;
  v_ew float;
  v_dw int; v_dl int;
  v_white_delta int := 0;
  v_black_delta int := 0;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;
  IF m.draw_offered_by IS NULL THEN RAISE EXCEPTION 'no_draw_offer'; END IF;
  IF m.draw_offered_by = p_user_id THEN RAISE EXCEPTION 'cannot_accept_own_offer'; END IF;
  IF m.white_user_id <> p_user_id AND m.black_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;

  IF m.wager > 0 AND m.white_user_id IS NOT NULL THEN
    UPDATE chess_wallets SET balance = balance + m.wager, locked = locked - m.wager, updated_at = now()
      WHERE user_id = m.white_user_id RETURNING balance INTO v_balance;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
      VALUES (m.white_user_id, 'WAGER_REFUND', m.wager, v_balance, p_match_id, 'Empate aceito');
  END IF;
  IF m.wager > 0 AND m.black_user_id IS NOT NULL THEN
    UPDATE chess_wallets SET balance = balance + m.wager, locked = locked - m.wager, updated_at = now()
      WHERE user_id = m.black_user_id RETURNING balance INTO v_balance;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
      VALUES (m.black_user_id, 'WAGER_REFUND', m.wager, v_balance, p_match_id, 'Empate aceito');
  END IF;

  IF m.bot_difficulty IS NULL AND m.white_user_id IS NOT NULL AND m.black_user_id IS NOT NULL THEN
    SELECT rating, games_played INTO v_wr, v_wg FROM chess_users WHERE id = m.white_user_id;
    SELECT rating, games_played INTO v_lr, v_lg FROM chess_users WHERE id = m.black_user_id;
    v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
    v_kl := CASE WHEN v_lg < 10 THEN 40 WHEN v_lg < 30 THEN 20 ELSE 10 END;
    v_ew := 1.0 / (1.0 + POWER(10.0, (v_lr - v_wr)::float / 400.0));
    v_dw := ROUND(v_kw * (0.5 - v_ew))::int;
    v_dl := ROUND(v_kl * (0.5 - (1.0 - v_ew)))::int;
    UPDATE chess_users SET rating = GREATEST(100, rating + v_dw), games_played = games_played + 1, updated_at = now()
      WHERE id = m.white_user_id;
    UPDATE chess_users SET rating = GREATEST(100, rating + v_dl), games_played = games_played + 1, updated_at = now()
      WHERE id = m.black_user_id;
    v_white_delta := v_dw;
    v_black_delta := v_dl;
  END IF;

  UPDATE chess_matches SET
    status = 'FINISHED', result = 'DRAW', payout = 0,
    finished_at = now(),
    draw_offered_by = NULL, draw_offered_at = NULL,
    last_move_at = NULL,
    white_rating_delta = v_white_delta,
    black_rating_delta = v_black_delta,
    updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('match_id', p_match_id, 'result', 'DRAW');
END $$;

CREATE OR REPLACE FUNCTION chess_claim_draw(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m         chess_matches;
  v_balance int;
  v_wr int; v_lr int;
  v_wg int; v_lg int;
  v_kw int; v_kl int;
  v_ew float;
  v_dw int; v_dl int;
  v_white_delta int := 0;
  v_black_delta int := 0;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;
  IF m.white_user_id <> p_user_id AND m.black_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;

  IF m.wager > 0 AND m.white_user_id IS NOT NULL THEN
    UPDATE chess_wallets SET balance = balance + m.wager, locked = locked - m.wager, updated_at = now()
      WHERE user_id = m.white_user_id RETURNING balance INTO v_balance;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
      VALUES (m.white_user_id, 'WAGER_REFUND', m.wager, v_balance, p_match_id, 'Empate reivindicado');
  END IF;
  IF m.wager > 0 AND m.black_user_id IS NOT NULL THEN
    UPDATE chess_wallets SET balance = balance + m.wager, locked = locked - m.wager, updated_at = now()
      WHERE user_id = m.black_user_id RETURNING balance INTO v_balance;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
      VALUES (m.black_user_id, 'WAGER_REFUND', m.wager, v_balance, p_match_id, 'Empate reivindicado');
  END IF;

  IF m.bot_difficulty IS NULL AND m.white_user_id IS NOT NULL AND m.black_user_id IS NOT NULL THEN
    SELECT rating, games_played INTO v_wr, v_wg FROM chess_users WHERE id = m.white_user_id;
    SELECT rating, games_played INTO v_lr, v_lg FROM chess_users WHERE id = m.black_user_id;
    v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
    v_kl := CASE WHEN v_lg < 10 THEN 40 WHEN v_lg < 30 THEN 20 ELSE 10 END;
    v_ew := 1.0 / (1.0 + POWER(10.0, (v_lr - v_wr)::float / 400.0));
    v_dw := ROUND(v_kw * (0.5 - v_ew))::int;
    v_dl := ROUND(v_kl * (0.5 - (1.0 - v_ew)))::int;
    UPDATE chess_users SET rating = GREATEST(100, rating + v_dw), games_played = games_played + 1, updated_at = now()
      WHERE id = m.white_user_id;
    UPDATE chess_users SET rating = GREATEST(100, rating + v_dl), games_played = games_played + 1, updated_at = now()
      WHERE id = m.black_user_id;
    v_white_delta := v_dw;
    v_black_delta := v_dl;
  END IF;

  UPDATE chess_matches SET
    status = 'FINISHED', result = 'DRAW', payout = 0,
    finished_at = now(),
    draw_offered_by = NULL, draw_offered_at = NULL,
    last_move_at = NULL,
    white_rating_delta = v_white_delta,
    black_rating_delta = v_black_delta,
    updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('match_id', p_match_id, 'result', 'DRAW');
END $$;
