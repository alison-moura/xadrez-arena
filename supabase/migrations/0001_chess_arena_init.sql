-- Xadrez Arena — schema inicial
-- Todas as tabelas/tipos com prefixo chess_ pra não colidir com outros projetos no mesmo banco.
-- Rode UMA VEZ no SQL Editor do Supabase.

-- ============================================================
-- ENUM TYPES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE chess_transaction_type AS ENUM (
    'DEPOSIT','WITHDRAWAL','WAGER_LOCK','WAGER_REFUND','WAGER_WIN','WAGER_LOSS','ADJUSTMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE chess_match_status AS ENUM ('WAITING','ACTIVE','FINISHED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE chess_match_result AS ENUM (
    'WHITE_WIN','BLACK_WIN','DRAW','WHITE_RESIGN','BLACK_RESIGN',
    'WHITE_TIMEOUT','BLACK_TIMEOUT','ABORTED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE chess_withdrawal_status AS ENUM ('PENDING','APPROVED','REJECTED','PAID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLES
-- ============================================================
CREATE TABLE IF NOT EXISTS chess_users (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username      text UNIQUE NOT NULL,
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  rating        int  NOT NULL DEFAULT 1200,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chess_wallets (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    text UNIQUE NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  balance    int  NOT NULL DEFAULT 1000,
  locked     int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chess_transactions (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  type          chess_transaction_type NOT NULL,
  amount        int  NOT NULL,
  balance_after int  NOT NULL,
  match_id      text,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chess_transactions_user_idx ON chess_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chess_matches (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  wager           int  NOT NULL,
  status          chess_match_status NOT NULL DEFAULT 'WAITING',
  result          chess_match_result,
  white_user_id   text REFERENCES chess_users(id) ON DELETE SET NULL,
  black_user_id   text REFERENCES chess_users(id) ON DELETE SET NULL,
  creator_id      text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  winner_id       text REFERENCES chess_users(id) ON DELETE SET NULL,
  fen             text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn             text NOT NULL DEFAULT '',
  move_count      int  NOT NULL DEFAULT 0,
  turn            text NOT NULL DEFAULT 'w',
  pot             int  NOT NULL DEFAULT 0,
  rake_bps        int  NOT NULL DEFAULT 500,
  payout          int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chess_matches_status_idx ON chess_matches(status, created_at DESC);

CREATE TABLE IF NOT EXISTS chess_moves (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  match_id   text NOT NULL REFERENCES chess_matches(id) ON DELETE CASCADE,
  ply        int  NOT NULL,
  san        text NOT NULL,
  uci        text NOT NULL,
  fen_after  text NOT NULL,
  by_user_id text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chess_moves_match_idx ON chess_moves(match_id, ply);

CREATE TABLE IF NOT EXISTS chess_withdrawal_requests (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  amount      int  NOT NULL,
  method      text NOT NULL,
  destination text NOT NULL,
  status      chess_withdrawal_status NOT NULL DEFAULT 'PENDING',
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chess_withdrawal_requests_user_idx ON chess_withdrawal_requests(user_id, created_at DESC);

-- ============================================================
-- RPC FUNCTIONS (chamadas via supabase.rpc('nome', { args }))
-- ============================================================

-- Cadastra usuário + carteira + bônus inicial. Atômico.
CREATE OR REPLACE FUNCTION chess_register_user(
  p_username text,
  p_email text,
  p_password_hash text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_user_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM chess_users WHERE email = p_email OR username = p_username) THEN
    RAISE EXCEPTION 'duplicate_username_or_email';
  END IF;
  INSERT INTO chess_users (username, email, password_hash)
  VALUES (p_username, p_email, p_password_hash)
  RETURNING id INTO v_user_id;

  INSERT INTO chess_wallets (user_id, balance, locked) VALUES (v_user_id, 1000, 0);

  INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
  VALUES (v_user_id, 'DEPOSIT', 1000, 1000, 'Bônus de boas-vindas');

  RETURN jsonb_build_object('user_id', v_user_id);
END $$;

-- Depósito (sandbox)
CREATE OR REPLACE FUNCTION chess_deposit(
  p_user_id text,
  p_amount int
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_balance int;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  UPDATE chess_wallets SET balance = balance + p_amount, updated_at = now()
   WHERE user_id = p_user_id
   RETURNING balance INTO v_balance;
  IF v_balance IS NULL THEN
    INSERT INTO chess_wallets (user_id, balance) VALUES (p_user_id, p_amount) RETURNING balance INTO v_balance;
  END IF;
  INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
  VALUES (p_user_id, 'DEPOSIT', p_amount, v_balance, 'Depósito simulado');
  RETURN jsonb_build_object('balance', v_balance);
END $$;

-- Solicita saque (cria withdrawal_request + debita saldo)
CREATE OR REPLACE FUNCTION chess_request_withdrawal(
  p_user_id text,
  p_amount int,
  p_method text,
  p_destination text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_balance int;
  v_wd_id text;
BEGIN
  IF p_amount < 100 THEN RAISE EXCEPTION 'min_withdrawal_100'; END IF;
  SELECT balance INTO v_balance FROM chess_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  UPDATE chess_wallets SET balance = balance - p_amount, updated_at = now() WHERE user_id = p_user_id;
  v_balance := v_balance - p_amount;
  INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
  VALUES (p_user_id, 'WITHDRAWAL', -p_amount, v_balance, 'Saque via ' || p_method);
  INSERT INTO chess_withdrawal_requests (user_id, amount, method, destination)
  VALUES (p_user_id, p_amount, p_method, p_destination)
  RETURNING id INTO v_wd_id;
  RETURN jsonb_build_object('balance', v_balance, 'withdrawal_id', v_wd_id);
END $$;

-- Cria partida + bloqueia aposta do criador
CREATE OR REPLACE FUNCTION chess_create_match(
  p_user_id text,
  p_wager int,
  p_color text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_color text;
  v_balance int;
  v_match_id text;
BEGIN
  IF p_wager < 0 THEN RAISE EXCEPTION 'invalid_wager'; END IF;
  IF p_color NOT IN ('w','b','random') THEN RAISE EXCEPTION 'invalid_color'; END IF;
  v_color := CASE
    WHEN p_color = 'random' THEN (CASE WHEN random() < 0.5 THEN 'w' ELSE 'b' END)
    ELSE p_color
  END;

  SELECT balance INTO v_balance FROM chess_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_balance < p_wager THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  INSERT INTO chess_matches (wager, status, creator_id, white_user_id, black_user_id, pot)
  VALUES (
    p_wager, 'WAITING', p_user_id,
    CASE WHEN v_color = 'w' THEN p_user_id ELSE NULL END,
    CASE WHEN v_color = 'b' THEN p_user_id ELSE NULL END,
    p_wager
  ) RETURNING id INTO v_match_id;

  IF p_wager > 0 THEN
    UPDATE chess_wallets SET balance = balance - p_wager, locked = locked + p_wager, updated_at = now()
     WHERE user_id = p_user_id;
    v_balance := v_balance - p_wager;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
    VALUES (p_user_id, 'WAGER_LOCK', -p_wager, v_balance, v_match_id, 'Aposta em escrow');
  END IF;

  RETURN jsonb_build_object('match_id', v_match_id, 'color', v_color);
END $$;

-- Entra numa partida WAITING + bloqueia aposta
CREATE OR REPLACE FUNCTION chess_join_match(
  p_user_id text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m chess_matches;
  v_balance int;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'WAITING' THEN RAISE EXCEPTION 'match_not_waiting'; END IF;
  IF m.white_user_id = p_user_id OR m.black_user_id = p_user_id THEN
    RAISE EXCEPTION 'already_in_match';
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
    UPDATE chess_wallets SET balance = balance - m.wager, locked = locked + m.wager, updated_at = now()
     WHERE user_id = p_user_id;
    v_balance := v_balance - m.wager;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
    VALUES (p_user_id, 'WAGER_LOCK', -m.wager, v_balance, p_match_id, 'Aposta em escrow');
  END IF;

  RETURN jsonb_build_object('match_id', p_match_id);
END $$;

-- Registra um lance já validado no Node. Se finalizou, faz o settlement.
CREATE OR REPLACE FUNCTION chess_record_move(
  p_user_id text,
  p_match_id text,
  p_fen text,
  p_pgn text,
  p_san text,
  p_uci text,
  p_turn text,
  p_is_checkmate boolean,
  p_is_draw boolean,
  p_is_game_over boolean
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m chess_matches;
  v_new_ply int;
  v_my_color text;
  v_winner_id text;
  v_loser_id text;
  v_result chess_match_result;
  v_pot int;
  v_rake int;
  v_payout int;
  v_balance int;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;

  IF m.white_user_id = p_user_id THEN v_my_color := 'w';
  ELSIF m.black_user_id = p_user_id THEN v_my_color := 'b';
  ELSE RAISE EXCEPTION 'not_a_player'; END IF;

  IF m.turn <> v_my_color THEN RAISE EXCEPTION 'not_your_turn'; END IF;

  v_new_ply := m.move_count + 1;
  INSERT INTO chess_moves (match_id, ply, san, uci, fen_after, by_user_id)
  VALUES (p_match_id, v_new_ply, p_san, p_uci, p_fen, p_user_id);

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
      UPDATE chess_users SET rating = rating + 15 WHERE id = v_winner_id;
      UPDATE chess_users SET rating = GREATEST(800, rating - 15) WHERE id = v_loser_id;
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

  RETURN jsonb_build_object('match_id', p_match_id, 'ply', v_new_ply);
END $$;

-- Desistência: o outro jogador vence
CREATE OR REPLACE FUNCTION chess_resign_match(
  p_user_id text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m chess_matches;
  v_my_color text;
  v_winner_id text;
  v_result chess_match_result;
  v_pot int;
  v_rake int;
  v_payout int;
  v_balance int;
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

  UPDATE chess_users SET rating = rating + 15 WHERE id = v_winner_id;
  UPDATE chess_users SET rating = GREATEST(800, rating - 15) WHERE id = p_user_id;

  UPDATE chess_matches SET
    status = 'FINISHED', result = v_result, winner_id = v_winner_id,
    payout = v_payout, finished_at = now(), updated_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object('match_id', p_match_id);
END $$;

-- Cancela partida WAITING (só criador)
CREATE OR REPLACE FUNCTION chess_cancel_match(
  p_user_id text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m chess_matches;
  v_balance int;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'WAITING' THEN RAISE EXCEPTION 'match_not_waiting'; END IF;
  IF m.creator_id <> p_user_id THEN RAISE EXCEPTION 'not_creator'; END IF;

  IF m.wager > 0 THEN
    UPDATE chess_wallets SET balance = balance + m.wager, locked = locked - m.wager, updated_at = now()
      WHERE user_id = m.creator_id RETURNING balance INTO v_balance;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
      VALUES (m.creator_id, 'WAGER_REFUND', m.wager, v_balance, p_match_id, 'Partida cancelada');
  END IF;

  UPDATE chess_matches SET status = 'CANCELLED', updated_at = now() WHERE id = p_match_id;
  RETURN jsonb_build_object('match_id', p_match_id);
END $$;
