-- Xadrez Arena — Migration 0003
-- ELO K-factor, move timing, Stockfish analysis columns,
-- Reports, Overwatch (community review), Player ban system.
-- Rode no SQL Editor do Supabase APÓS migrations 0001 e 0002.

-- ============================================================
-- 1. chess_users: novos campos
-- ============================================================
ALTER TABLE chess_users
  ADD COLUMN IF NOT EXISTS games_played    int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspicion_score int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS banned_at       timestamptz,
  ADD COLUMN IF NOT EXISTS ban_reason      text;

-- Novo padrão de rating para novos usuários
ALTER TABLE chess_users ALTER COLUMN rating SET DEFAULT 1500;

-- Popula games_played retroativamente a partir de partidas existentes
UPDATE chess_users cu
SET games_played = (
  SELECT COUNT(*)
  FROM chess_matches cm
  WHERE (cm.white_user_id = cu.id OR cm.black_user_id = cu.id)
    AND cm.status = 'FINISHED'
    AND cm.bot_difficulty IS NULL
)
WHERE cu.is_bot = false;

-- ============================================================
-- 2. chess_moves: tempo de lance
-- ============================================================
ALTER TABLE chess_moves
  ADD COLUMN IF NOT EXISTS move_time_ms int;

-- ============================================================
-- 3. chess_matches: colunas de análise Stockfish
-- ============================================================
ALTER TABLE chess_matches
  ADD COLUMN IF NOT EXISTS white_avg_cpl  float,
  ADD COLUMN IF NOT EXISTS black_avg_cpl  float,
  ADD COLUMN IF NOT EXISTS white_accuracy float,
  ADD COLUMN IF NOT EXISTS black_accuracy float,
  ADD COLUMN IF NOT EXISTS analyzed_at    timestamptz;

-- ============================================================
-- 4. Tabela de denúncias
-- ============================================================
CREATE TABLE IF NOT EXISTS chess_reports (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reporter_id text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  accused_id  text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  match_id    text NOT NULL REFERENCES chess_matches(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  details     text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reporter_id, match_id)
);
CREATE INDEX IF NOT EXISTS chess_reports_accused_idx ON chess_reports(accused_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chess_reports_match_idx   ON chess_reports(match_id);

-- ============================================================
-- 5. Casos Overwatch
-- ============================================================
CREATE TABLE IF NOT EXISTS chess_overwatch_cases (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  accused_id   text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  match_id     text NOT NULL REFERENCES chess_matches(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'OPEN'    CHECK (status  IN ('OPEN','RESOLVED')),
  verdict      text                             CHECK (verdict IN ('CLEAN','CHEATER')),
  votes_needed int  NOT NULL DEFAULT 5,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  UNIQUE(match_id, accused_id)
);
CREATE INDEX IF NOT EXISTS chess_overwatch_cases_status_idx ON chess_overwatch_cases(status, created_at DESC);

-- ============================================================
-- 6. Votos Overwatch
-- ============================================================
CREATE TABLE IF NOT EXISTS chess_overwatch_votes (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  case_id    text NOT NULL REFERENCES chess_overwatch_cases(id) ON DELETE CASCADE,
  voter_id   text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  vote       text NOT NULL CHECK (vote IN ('CLEAN','CHEATER')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(case_id, voter_id)
);
CREATE INDEX IF NOT EXISTS chess_overwatch_votes_case_idx ON chess_overwatch_votes(case_id);

-- ============================================================
-- 7. Nova conquista: Árbitro
-- ============================================================
ALTER TABLE chess_achievement_types
  DROP CONSTRAINT IF EXISTS chess_achievement_types_category_check;
ALTER TABLE chess_achievement_types
  ADD CONSTRAINT chess_achievement_types_category_check
  CHECK (category IN ('partidas','xadrez','bot','rating','apostas','overwatch'));

INSERT INTO chess_achievement_types (id, name, description, icon, category, reward_coins, sort_order)
VALUES ('arbitro', 'Árbitro', 'Vote corretamente em 10 análises de Overwatch.', '⚖️', 'overwatch', 200, 16)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. RPC: banir usuário
-- ============================================================
CREATE OR REPLACE FUNCTION chess_ban_user(
  p_accused_id text,
  p_reason     text
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_balance  int;
  v_opponent text;
  v_mid      text;
  v_wag      int;
BEGIN
  UPDATE chess_users
    SET banned_at = now(), ban_reason = p_reason, updated_at = now()
  WHERE id = p_accused_id;

  -- Cancelar partidas ACTIVE e devolver escrow a ambos
  FOR v_mid, v_wag, v_opponent IN
    SELECT id, wager,
      CASE WHEN white_user_id = p_accused_id THEN black_user_id ELSE white_user_id END
    FROM chess_matches
    WHERE status = 'ACTIVE'
      AND (white_user_id = p_accused_id OR black_user_id = p_accused_id)
  LOOP
    IF v_wag > 0 THEN
      UPDATE chess_wallets
        SET balance = balance + v_wag, locked = locked - v_wag, updated_at = now()
      WHERE user_id = p_accused_id RETURNING balance INTO v_balance;
      INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
        VALUES (p_accused_id, 'WAGER_REFUND', v_wag, v_balance, v_mid, 'Ban: escrow devolvido');

      IF v_opponent IS NOT NULL THEN
        UPDATE chess_wallets
          SET balance = balance + v_wag, locked = locked - v_wag, updated_at = now()
        WHERE user_id = v_opponent RETURNING balance INTO v_balance;
        INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
          VALUES (v_opponent, 'WAGER_REFUND', v_wag, v_balance, v_mid, 'Oponente banido: escrow devolvido');
      END IF;
    END IF;
    UPDATE chess_matches SET status = 'CANCELLED', updated_at = now() WHERE id = v_mid;
  END LOOP;

  -- Cancelar partidas WAITING criadas pelo banido
  FOR v_mid, v_wag IN
    SELECT id, wager FROM chess_matches WHERE status = 'WAITING' AND creator_id = p_accused_id
  LOOP
    IF v_wag > 0 THEN
      UPDATE chess_wallets
        SET balance = balance + v_wag, locked = locked - v_wag, updated_at = now()
      WHERE user_id = p_accused_id RETURNING balance INTO v_balance;
      INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
        VALUES (p_accused_id, 'WAGER_REFUND', v_wag, v_balance, v_mid, 'Ban: aposta devolvida');
    END IF;
    UPDATE chess_matches SET status = 'CANCELLED', updated_at = now() WHERE id = v_mid;
  END LOOP;
END $$;

-- ============================================================
-- 9. RPC: resolver caso Overwatch
-- ============================================================
CREATE OR REPLACE FUNCTION chess_resolve_overwatch_case(
  p_case_id text,
  p_verdict text  -- 'CLEAN' | 'CHEATER'
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_accused_id text;
  v_voter_id   text;
  v_voter_vote text;
  v_balance    int;
BEGIN
  SELECT accused_id INTO v_accused_id
    FROM chess_overwatch_cases
   WHERE id = p_case_id AND status = 'OPEN'
   FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE chess_overwatch_cases
    SET status = 'RESOLVED', verdict = p_verdict, resolved_at = now()
  WHERE id = p_case_id;

  IF p_verdict = 'CHEATER' THEN
    PERFORM chess_ban_user(v_accused_id, 'Overwatch: maioria votou CHEATER');
  ELSE
    -- Limpa levemente a pontuação de suspeita em caso CLEAN
    UPDATE chess_users
      SET suspicion_score = GREATEST(0, suspicion_score - 10), updated_at = now()
    WHERE id = v_accused_id;
  END IF;

  -- Recompensar votantes que acertaram (50 coins cada)
  FOR v_voter_id, v_voter_vote IN
    SELECT voter_id, vote FROM chess_overwatch_votes WHERE case_id = p_case_id
  LOOP
    IF v_voter_vote = p_verdict THEN
      UPDATE chess_wallets
        SET balance = balance + 50, updated_at = now()
      WHERE user_id = v_voter_id RETURNING balance INTO v_balance;
      INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
        VALUES (v_voter_id, 'ACHIEVEMENT', 50, v_balance, 'Overwatch: voto correto');
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 10. RPC chess_record_move — ELO K-factor + move_time_ms + ban check
-- ============================================================
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
  v_wr           int;  -- winner rating
  v_lr           int;  -- loser rating
  v_wg           int;  -- winner games_played
  v_lg           int;  -- loser games_played
  v_kw           int;  -- K-factor winner
  v_kl           int;  -- K-factor loser
  v_ew           float; -- expected score for winner
  v_dw           int;  -- delta rating winner
  v_dl           int;  -- delta rating loser
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;

  -- Verificar ban
  IF EXISTS (SELECT 1 FROM chess_users WHERE id = p_user_id AND banned_at IS NOT NULL) THEN
    RAISE EXCEPTION 'user_banned';
  END IF;

  IF m.white_user_id = p_user_id THEN v_my_color := 'w';
  ELSIF m.black_user_id = p_user_id THEN v_my_color := 'b';
  ELSE RAISE EXCEPTION 'not_a_player'; END IF;

  IF m.turn <> v_my_color THEN RAISE EXCEPTION 'not_your_turn'; END IF;

  v_is_bot_match := m.bot_difficulty IS NOT NULL;
  v_new_ply      := m.move_count + 1;

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

    -- ---- DRAW ----
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

      -- ELO para empate (partidas humano-vs-humano)
      IF NOT v_is_bot_match AND m.white_user_id IS NOT NULL AND m.black_user_id IS NOT NULL THEN
        SELECT rating, games_played INTO v_wr, v_wg FROM chess_users WHERE id = m.white_user_id;
        SELECT rating, games_played INTO v_lr, v_lg FROM chess_users WHERE id = m.black_user_id;

        v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
        v_kl := CASE WHEN v_lg < 10 THEN 40 WHEN v_lg < 30 THEN 20 ELSE 10 END;
        v_ew := 1.0 / (1.0 + POWER(10.0, (v_lr - v_wr)::float / 400.0));

        -- score = 0.5 para ambos
        v_dw := ROUND(v_kw * (0.5 - v_ew))::int;
        v_dl := ROUND(v_kl * (0.5 - (1.0 - v_ew)))::int;

        UPDATE chess_users SET
          rating       = GREATEST(100, rating + v_dw),
          games_played = games_played + 1,
          updated_at   = now()
        WHERE id = m.white_user_id;

        UPDATE chess_users SET
          rating       = GREATEST(100, rating + v_dl),
          games_played = games_played + 1,
          updated_at   = now()
        WHERE id = m.black_user_id;
      END IF;

      v_payout := 0;

    -- ---- WIN / LOSS ----
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

      -- ELO K-factor (apenas partidas humano-vs-humano)
      IF NOT v_is_bot_match AND v_winner_id IS NOT NULL AND v_loser_id IS NOT NULL THEN
        SELECT rating, games_played INTO v_wr, v_wg FROM chess_users WHERE id = v_winner_id;
        SELECT rating, games_played INTO v_lr, v_lg FROM chess_users WHERE id = v_loser_id;

        v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
        v_kl := CASE WHEN v_lg < 10 THEN 40 WHEN v_lg < 30 THEN 20 ELSE 10 END;
        v_ew := 1.0 / (1.0 + POWER(10.0, (v_lr - v_wr)::float / 400.0));

        v_dw := ROUND(v_kw * (1.0 - v_ew))::int;
        v_dl := ROUND(v_kl * (0.0 - v_ew))::int;

        UPDATE chess_users SET
          rating       = GREATEST(100, rating + v_dw),
          games_played = games_played + 1,
          updated_at   = now()
        WHERE id = v_winner_id;

        UPDATE chess_users SET
          rating       = GREATEST(100, rating + v_dl),
          games_played = games_played + 1,
          updated_at   = now()
        WHERE id = v_loser_id;
      END IF;
    END IF;

    UPDATE chess_matches SET
      fen = p_fen, pgn = p_pgn, move_count = v_new_ply, turn = p_turn,
      status = 'FINISHED', result = v_result, winner_id = v_winner_id,
      payout = v_payout, finished_at = now(), updated_at = now()
    WHERE id = p_match_id;
  ELSE
    UPDATE chess_matches SET
      fen = p_fen, pgn = p_pgn, move_count = v_new_ply, turn = p_turn, updated_at = now()
    WHERE id = p_match_id;
  END IF;

  RETURN jsonb_build_object('match_id', p_match_id, 'ply', v_new_ply, 'is_bot_match', v_is_bot_match);
END $$;

-- ============================================================
-- 11. RPC chess_resign_match — ELO K-factor + ban check
-- ============================================================
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
  -- ELO vars
  v_wr  int; v_lr  int;
  v_wg  int; v_lg  int;
  v_kw  int; v_kl  int;
  v_ew  float;
  v_dw  int;  v_dl  int;
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

  -- ELO K-factor (apenas partidas humano-vs-humano)
  IF m.bot_difficulty IS NULL AND v_winner_id IS NOT NULL THEN
    SELECT rating, games_played INTO v_wr, v_wg FROM chess_users WHERE id = v_winner_id;
    SELECT rating, games_played INTO v_lr, v_lg FROM chess_users WHERE id = p_user_id;

    v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
    v_kl := CASE WHEN v_lg < 10 THEN 40 WHEN v_lg < 30 THEN 20 ELSE 10 END;
    v_ew := 1.0 / (1.0 + POWER(10.0, (v_lr - v_wr)::float / 400.0));

    v_dw := ROUND(v_kw * (1.0 - v_ew))::int;
    v_dl := ROUND(v_kl * (0.0 - v_ew))::int;

    UPDATE chess_users SET
      rating       = GREATEST(100, rating + v_dw),
      games_played = games_played + 1,
      updated_at   = now()
    WHERE id = v_winner_id;

    UPDATE chess_users SET
      rating       = GREATEST(100, rating + v_dl),
      games_played = games_played + 1,
      updated_at   = now()
    WHERE id = p_user_id;
  END IF;

  UPDATE chess_matches SET
    status = 'FINISHED', result = v_result, winner_id = v_winner_id,
    payout = v_payout, finished_at = now(), updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('match_id', p_match_id);
END $$;

-- ============================================================
-- 12. chess_join_match: também verifica ban do entrante
-- ============================================================
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
  -- Verificar ban
  IF EXISTS (SELECT 1 FROM chess_users WHERE id = p_user_id AND banned_at IS NOT NULL) THEN
    RAISE EXCEPTION 'user_banned';
  END IF;

  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'WAITING' THEN RAISE EXCEPTION 'match_not_waiting'; END IF;
  IF m.white_user_id = p_user_id OR m.black_user_id = p_user_id THEN
    RAISE EXCEPTION 'already_in_match';
  END IF;

  -- Valida faixa de rating
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
