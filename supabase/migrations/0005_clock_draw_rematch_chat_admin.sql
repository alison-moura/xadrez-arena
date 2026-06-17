-- Xadrez Arena — Migration 0005
-- Relógio (time control), oferta de empate, rematch, chat na partida,
-- coluna de admin, painel de saques, RLS para realtime.
-- Rode no SQL Editor do Supabase APÓS migrations 0001..0004.

-- ============================================================
-- 1. chess_users: coluna is_admin
-- ============================================================
ALTER TABLE chess_users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. chess_matches: colunas de tempo, draw offer, rematch
-- ============================================================
ALTER TABLE chess_matches
  ADD COLUMN IF NOT EXISTS time_control_seconds   int,                  -- NULL = sem relógio
  ADD COLUMN IF NOT EXISTS time_increment_seconds int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS white_time_ms          int,                  -- NULL antes da partida começar / sem relógio
  ADD COLUMN IF NOT EXISTS black_time_ms          int,
  ADD COLUMN IF NOT EXISTS last_move_at           timestamptz,          -- quando o turno atual começou
  ADD COLUMN IF NOT EXISTS draw_offered_by        text REFERENCES chess_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draw_offered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS rematch_offered_by     text REFERENCES chess_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rematch_match_id       text REFERENCES chess_matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_match_id        text REFERENCES chess_matches(id) ON DELETE SET NULL;

-- ============================================================
-- 3. chess_match_messages: chat por partida
-- ============================================================
CREATE TABLE IF NOT EXISTS chess_match_messages (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  match_id   text NOT NULL REFERENCES chess_matches(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES chess_users(id)   ON DELETE CASCADE,
  content    text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chess_match_messages_match_idx
  ON chess_match_messages(match_id, created_at);

-- ============================================================
-- 4. RPC chess_create_match — agora aceita tempo
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_create_match' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION chess_create_match(
  p_user_id                text,
  p_wager                  int,
  p_color                  text,
  p_rating_min             integer DEFAULT NULL,
  p_rating_max             integer DEFAULT NULL,
  p_time_control_seconds   integer DEFAULT NULL,
  p_time_increment_seconds integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_color    text;
  v_balance  int;
  v_match_id text;
  v_init_ms  int;
BEGIN
  IF p_wager < 0 THEN RAISE EXCEPTION 'invalid_wager'; END IF;
  IF p_color NOT IN ('w','b','random') THEN RAISE EXCEPTION 'invalid_color'; END IF;
  IF p_time_control_seconds IS NOT NULL AND (p_time_control_seconds < 30 OR p_time_control_seconds > 7200) THEN
    RAISE EXCEPTION 'invalid_time_control';
  END IF;
  IF p_time_increment_seconds < 0 OR p_time_increment_seconds > 60 THEN
    RAISE EXCEPTION 'invalid_time_increment';
  END IF;

  v_color := CASE
    WHEN p_color = 'random' THEN (CASE WHEN random() < 0.5 THEN 'w' ELSE 'b' END)
    ELSE p_color
  END;

  SELECT balance INTO v_balance FROM chess_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_balance < p_wager THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_init_ms := CASE WHEN p_time_control_seconds IS NULL THEN NULL ELSE p_time_control_seconds * 1000 END;

  INSERT INTO chess_matches
    (wager, status, creator_id, white_user_id, black_user_id, pot,
     rating_min, rating_max,
     time_control_seconds, time_increment_seconds,
     white_time_ms, black_time_ms)
  VALUES (
    p_wager, 'WAITING', p_user_id,
    CASE WHEN v_color = 'w' THEN p_user_id ELSE NULL END,
    CASE WHEN v_color = 'b' THEN p_user_id ELSE NULL END,
    p_wager,
    p_rating_min, p_rating_max,
    p_time_control_seconds, COALESCE(p_time_increment_seconds, 0),
    v_init_ms, v_init_ms
  ) RETURNING id INTO v_match_id;

  IF p_wager > 0 THEN
    UPDATE chess_wallets
      SET balance = balance - p_wager, locked = locked + p_wager, updated_at = now()
    WHERE user_id = p_user_id;
    v_balance := v_balance - p_wager;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
    VALUES (p_user_id, 'WAGER_LOCK', -p_wager, v_balance, v_match_id, 'Aposta em escrow');
  END IF;

  RETURN jsonb_build_object('match_id', v_match_id, 'color', v_color);
END $$;

-- ============================================================
-- 5. RPC chess_join_match — inicia o relógio quando vira ACTIVE
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_join_match' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION chess_join_match(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m         chess_matches;
  v_balance int;
  v_rating  int;
BEGIN
  IF EXISTS (SELECT 1 FROM chess_users WHERE id = p_user_id AND banned_at IS NOT NULL) THEN
    RAISE EXCEPTION 'user_banned';
  END IF;

  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'WAITING' THEN RAISE EXCEPTION 'match_not_waiting'; END IF;
  IF m.white_user_id = p_user_id OR m.black_user_id = p_user_id THEN
    RAISE EXCEPTION 'already_in_match';
  END IF;

  SELECT rating INTO v_rating FROM chess_users WHERE id = p_user_id;
  IF m.rating_min IS NOT NULL AND v_rating < m.rating_min THEN
    RAISE EXCEPTION 'rating_too_low';
  END IF;
  IF m.rating_max IS NOT NULL AND v_rating > m.rating_max THEN
    RAISE EXCEPTION 'rating_too_high';
  END IF;

  SELECT balance INTO v_balance FROM chess_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < m.wager THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE chess_matches SET
    white_user_id = COALESCE(m.white_user_id, CASE WHEN m.white_user_id IS NULL THEN p_user_id END),
    black_user_id = COALESCE(m.black_user_id, CASE WHEN m.black_user_id IS NULL THEN p_user_id END),
    status        = 'ACTIVE',
    started_at    = now(),
    last_move_at  = now(),
    pot           = m.wager * 2,
    updated_at    = now()
  WHERE id = p_match_id;

  IF m.wager > 0 THEN
    UPDATE chess_wallets
      SET balance = balance - m.wager, locked = locked + m.wager, updated_at = now()
    WHERE user_id = p_user_id;
    v_balance := v_balance - m.wager;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
    VALUES (p_user_id, 'WAGER_LOCK', -m.wager, v_balance, p_match_id, 'Aposta em escrow');
  END IF;

  RETURN jsonb_build_object('match_id', p_match_id);
END $$;

-- ============================================================
-- 6. RPC chess_record_move — debita tempo + soma incremento
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
  -- ELO vars
  v_wr           int; v_lr int;
  v_wg           int; v_lg int;
  v_kw           int; v_kl int;
  v_ew           float;
  v_dw           int; v_dl int;
  -- Clock vars
  v_elapsed_ms   int;
  v_remaining    int;
  v_inc_ms       int;
  v_w_time       int;
  v_b_time       int;
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

  -- Atualiza relógio (só se há time_control_seconds)
  IF m.time_control_seconds IS NOT NULL AND m.last_move_at IS NOT NULL THEN
    v_elapsed_ms := GREATEST(0, (EXTRACT(EPOCH FROM (now() - m.last_move_at)) * 1000)::int);
    v_inc_ms     := COALESCE(m.time_increment_seconds, 0) * 1000;

    IF v_my_color = 'w' THEN
      v_remaining := COALESCE(v_w_time, m.time_control_seconds * 1000) - v_elapsed_ms;
      IF v_remaining < 0 THEN
        -- O jogador estourou o tempo durante o lance — perde por tempo
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

  -- Se o relógio estourou, finaliza ANTES de registrar o lance (move ilegal)
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
      END IF;
    END IF;

    UPDATE chess_matches SET
      fen = p_fen, pgn = p_pgn, move_count = v_new_ply, turn = p_turn,
      status = 'FINISHED', result = v_result, winner_id = v_winner_id,
      payout = v_payout, finished_at = now(),
      white_time_ms = v_w_time, black_time_ms = v_b_time,
      last_move_at  = NULL,
      draw_offered_by = NULL, draw_offered_at = NULL,
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
-- 7. RPC chess_settle_timeout — usado por chess_record_move e chess_flag_time
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

  -- ELO (apenas H-vs-H)
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
  END IF;

  UPDATE chess_matches SET
    status = 'FINISHED', result = p_result, winner_id = p_winner_id,
    payout = v_payout, finished_at = now(),
    white_time_ms = CASE WHEN p_result = 'WHITE_TIMEOUT' THEN 0 ELSE white_time_ms END,
    black_time_ms = CASE WHEN p_result = 'BLACK_TIMEOUT' THEN 0 ELSE black_time_ms END,
    last_move_at  = NULL,
    draw_offered_by = NULL, draw_offered_at = NULL,
    updated_at = now()
  WHERE id = p_match_id;
END $$;

-- ============================================================
-- 8. RPC chess_flag_time — qualquer parte pode chamar para flag por tempo
-- ============================================================
CREATE OR REPLACE FUNCTION chess_flag_time(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m            chess_matches;
  v_elapsed_ms int;
  v_remaining  int;
  v_loser_id   text;
  v_winner_id  text;
  v_result     chess_match_result;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' OR m.time_control_seconds IS NULL OR m.last_move_at IS NULL THEN
    RAISE EXCEPTION 'no_clock';
  END IF;
  -- Só jogadores da partida podem reivindicar flag
  IF m.white_user_id <> p_user_id AND m.black_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;

  v_elapsed_ms := GREATEST(0, (EXTRACT(EPOCH FROM (now() - m.last_move_at)) * 1000)::int);

  IF m.turn = 'w' THEN
    v_remaining := COALESCE(m.white_time_ms, m.time_control_seconds * 1000) - v_elapsed_ms;
    IF v_remaining > 0 THEN RAISE EXCEPTION 'still_has_time'; END IF;
    v_loser_id  := m.white_user_id;
    v_winner_id := m.black_user_id;
    v_result    := 'WHITE_TIMEOUT';
  ELSE
    v_remaining := COALESCE(m.black_time_ms, m.time_control_seconds * 1000) - v_elapsed_ms;
    IF v_remaining > 0 THEN RAISE EXCEPTION 'still_has_time'; END IF;
    v_loser_id  := m.black_user_id;
    v_winner_id := m.white_user_id;
    v_result    := 'BLACK_TIMEOUT';
  END IF;

  PERFORM chess_settle_timeout(p_match_id, v_winner_id, v_loser_id, v_result);
  RETURN jsonb_build_object('match_id', p_match_id, 'result', v_result);
END $$;

-- ============================================================
-- 9. Draw offers
-- ============================================================
CREATE OR REPLACE FUNCTION chess_offer_draw(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m chess_matches;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;
  IF m.white_user_id <> p_user_id AND m.black_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;
  IF m.bot_difficulty IS NOT NULL THEN RAISE EXCEPTION 'cannot_offer_draw_to_bot'; END IF;
  IF m.draw_offered_by = p_user_id THEN RAISE EXCEPTION 'already_offered'; END IF;

  UPDATE chess_matches
    SET draw_offered_by = p_user_id, draw_offered_at = now(), updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('match_id', p_match_id, 'offered_by', p_user_id);
END $$;

CREATE OR REPLACE FUNCTION chess_decline_draw(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m chess_matches;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;
  IF m.draw_offered_by IS NULL THEN RAISE EXCEPTION 'no_draw_offer'; END IF;
  IF m.draw_offered_by = p_user_id THEN RAISE EXCEPTION 'cannot_decline_own_offer'; END IF;

  UPDATE chess_matches
    SET draw_offered_by = NULL, draw_offered_at = NULL, updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('match_id', p_match_id);
END $$;

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
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;
  IF m.draw_offered_by IS NULL THEN RAISE EXCEPTION 'no_draw_offer'; END IF;
  IF m.draw_offered_by = p_user_id THEN RAISE EXCEPTION 'cannot_accept_own_offer'; END IF;
  IF m.white_user_id <> p_user_id AND m.black_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;

  -- Devolve apostas
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

  -- ELO empate (apenas H-vs-H)
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
  END IF;

  UPDATE chess_matches SET
    status = 'FINISHED', result = 'DRAW', payout = 0,
    finished_at = now(),
    draw_offered_by = NULL, draw_offered_at = NULL,
    last_move_at = NULL,
    updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('match_id', p_match_id, 'result', 'DRAW');
END $$;

-- ============================================================
-- 10. Rematch — cria nova partida com cores invertidas e mesmas regras
-- ============================================================
CREATE OR REPLACE FUNCTION chess_request_rematch(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m            chess_matches;
  v_opponent   text;
  v_balance    int;
  v_new_match  text;
  v_my_color   text;
  v_init_ms    int;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'FINISHED' THEN RAISE EXCEPTION 'match_not_finished'; END IF;
  IF m.bot_difficulty IS NOT NULL THEN RAISE EXCEPTION 'rematch_not_supported_vs_bot'; END IF;
  IF m.white_user_id <> p_user_id AND m.black_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;

  IF m.white_user_id = p_user_id THEN
    v_my_color := 'w';
    v_opponent := m.black_user_id;
  ELSE
    v_my_color := 'b';
    v_opponent := m.white_user_id;
  END IF;

  IF v_opponent IS NULL THEN RAISE EXCEPTION 'no_opponent'; END IF;

  -- Se o oponente já solicitou rematch, criamos a partida em ACTIVE direto.
  IF m.rematch_offered_by = v_opponent THEN
    -- Sanity: saldo de ambos
    SELECT balance INTO v_balance FROM chess_wallets WHERE user_id = p_user_id FOR UPDATE;
    IF v_balance IS NULL OR v_balance < m.wager THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

    SELECT balance INTO v_balance FROM chess_wallets WHERE user_id = v_opponent FOR UPDATE;
    IF v_balance IS NULL OR v_balance < m.wager THEN RAISE EXCEPTION 'opponent_no_balance'; END IF;

    v_init_ms := CASE WHEN m.time_control_seconds IS NULL THEN NULL ELSE m.time_control_seconds * 1000 END;

    -- Cores invertidas em relação à partida anterior
    INSERT INTO chess_matches
      (wager, status, creator_id, white_user_id, black_user_id, pot,
       rating_min, rating_max,
       time_control_seconds, time_increment_seconds,
       white_time_ms, black_time_ms,
       started_at, last_move_at,
       parent_match_id)
    VALUES (
      m.wager, 'ACTIVE', p_user_id,
      m.black_user_id, m.white_user_id,
      m.wager * 2,
      m.rating_min, m.rating_max,
      m.time_control_seconds, m.time_increment_seconds,
      v_init_ms, v_init_ms,
      now(), now(),
      p_match_id
    ) RETURNING id INTO v_new_match;

    IF m.wager > 0 THEN
      UPDATE chess_wallets SET balance = balance - m.wager, locked = locked + m.wager, updated_at = now()
        WHERE user_id = p_user_id RETURNING balance INTO v_balance;
      INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
        VALUES (p_user_id, 'WAGER_LOCK', -m.wager, v_balance, v_new_match, 'Rematch: aposta em escrow');

      UPDATE chess_wallets SET balance = balance - m.wager, locked = locked + m.wager, updated_at = now()
        WHERE user_id = v_opponent RETURNING balance INTO v_balance;
      INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
        VALUES (v_opponent, 'WAGER_LOCK', -m.wager, v_balance, v_new_match, 'Rematch: aposta em escrow');
    END IF;

    UPDATE chess_matches
      SET rematch_offered_by = NULL, rematch_match_id = v_new_match, updated_at = now()
    WHERE id = p_match_id;

    RETURN jsonb_build_object('match_id', v_new_match, 'auto_started', true);
  END IF;

  -- Caso contrário, registra oferta e espera o oponente clicar
  UPDATE chess_matches
    SET rematch_offered_by = p_user_id, updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('match_id', p_match_id, 'pending', true);
END $$;

-- ============================================================
-- 11. Chat: post + list
-- ============================================================
CREATE OR REPLACE FUNCTION chess_post_message(
  p_user_id  text,
  p_match_id text,
  p_content  text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m            chess_matches;
  v_recent_cnt int;
  v_msg_id     text;
BEGIN
  IF length(trim(p_content)) = 0 THEN RAISE EXCEPTION 'empty_message'; END IF;
  IF EXISTS (SELECT 1 FROM chess_users WHERE id = p_user_id AND banned_at IS NOT NULL) THEN
    RAISE EXCEPTION 'user_banned';
  END IF;

  SELECT * INTO m FROM chess_matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.white_user_id <> p_user_id AND m.black_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;
  IF m.status NOT IN ('ACTIVE','FINISHED') THEN RAISE EXCEPTION 'cannot_chat_now'; END IF;

  -- Anti-flood simples: máx 5 mensagens nos últimos 10s
  SELECT COUNT(*) INTO v_recent_cnt
    FROM chess_match_messages
   WHERE match_id = p_match_id AND user_id = p_user_id
     AND created_at > now() - interval '10 seconds';
  IF v_recent_cnt >= 5 THEN RAISE EXCEPTION 'rate_limited'; END IF;

  INSERT INTO chess_match_messages (match_id, user_id, content)
  VALUES (p_match_id, p_user_id, trim(p_content))
  RETURNING id INTO v_msg_id;

  RETURN jsonb_build_object('message_id', v_msg_id);
END $$;

-- ============================================================
-- 12. Admin: saques
-- ============================================================
CREATE OR REPLACE FUNCTION chess_approve_withdrawal(
  p_admin_id      text,
  p_withdrawal_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM chess_users WHERE id = p_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE chess_withdrawal_requests
     SET status = 'APPROVED', updated_at = now()
   WHERE id = p_withdrawal_id AND status = 'PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_pending'; END IF;

  RETURN jsonb_build_object('withdrawal_id', p_withdrawal_id, 'status', 'APPROVED');
END $$;

CREATE OR REPLACE FUNCTION chess_reject_withdrawal(
  p_admin_id      text,
  p_withdrawal_id text,
  p_note          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_is_admin boolean;
  w          chess_withdrawal_requests;
  v_balance  int;
BEGIN
  SELECT is_admin INTO v_is_admin FROM chess_users WHERE id = p_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO w FROM chess_withdrawal_requests WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF w.status <> 'PENDING' THEN RAISE EXCEPTION 'not_pending'; END IF;

  -- Devolve coins
  UPDATE chess_wallets SET balance = balance + w.amount, updated_at = now()
    WHERE user_id = w.user_id RETURNING balance INTO v_balance;
  INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
    VALUES (w.user_id, 'DEPOSIT', w.amount, v_balance, COALESCE('Saque rejeitado: ' || p_note, 'Saque rejeitado'));

  UPDATE chess_withdrawal_requests
     SET status = 'REJECTED', note = p_note, updated_at = now()
   WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('withdrawal_id', p_withdrawal_id, 'status', 'REJECTED');
END $$;

CREATE OR REPLACE FUNCTION chess_mark_withdrawal_paid(
  p_admin_id      text,
  p_withdrawal_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM chess_users WHERE id = p_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE chess_withdrawal_requests
     SET status = 'PAID', updated_at = now()
   WHERE id = p_withdrawal_id AND status = 'APPROVED';
  IF NOT FOUND THEN RAISE EXCEPTION 'not_approved'; END IF;

  RETURN jsonb_build_object('withdrawal_id', p_withdrawal_id, 'status', 'PAID');
END $$;

-- ============================================================
-- 13. RLS para realtime (anon pode SELECT em matches/moves/messages)
--     Nada de INSERT/UPDATE/DELETE pelo cliente — escritas continuam
--     server-side via service_role.
-- ============================================================
ALTER TABLE chess_matches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chess_moves           ENABLE ROW LEVEL SECURITY;
ALTER TABLE chess_match_messages  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chess_matches_anon_read        ON chess_matches;
DROP POLICY IF EXISTS chess_moves_anon_read          ON chess_moves;
DROP POLICY IF EXISTS chess_match_messages_anon_read ON chess_match_messages;

CREATE POLICY chess_matches_anon_read
  ON chess_matches FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY chess_moves_anon_read
  ON chess_moves FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY chess_match_messages_anon_read
  ON chess_match_messages FOR SELECT TO anon, authenticated USING (true);

-- Habilita publication para Realtime (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'chess_matches'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE chess_matches';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'chess_moves'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE chess_moves';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'chess_match_messages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE chess_match_messages';
  END IF;
EXCEPTION WHEN undefined_object THEN
  -- publication não existe; ignora
  NULL;
END $$;
