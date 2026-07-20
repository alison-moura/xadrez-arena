-- Xadrez Arena — Migration 0016
-- Desafios diretos: partida privada endereçada a um usuário específico.
-- O desafiado vê o convite no lobby (inbox) e pode aceitar (join) ou recusar.

ALTER TABLE chess_matches
  ADD COLUMN IF NOT EXISTS challenged_user_id text REFERENCES chess_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chess_matches_challenged_idx
  ON chess_matches(challenged_user_id) WHERE status = 'WAITING';

-- ============================================================
-- chess_create_match: aceita p_challenged_user_id.
-- Desafio direto é sempre privado (não aparece no lobby público).
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
  p_time_increment_seconds integer DEFAULT 0,
  p_is_private             boolean DEFAULT false,
  p_challenged_user_id     text    DEFAULT NULL
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

  IF p_challenged_user_id IS NOT NULL THEN
    IF p_challenged_user_id = p_user_id THEN RAISE EXCEPTION 'cannot_challenge_self'; END IF;
    IF NOT EXISTS (SELECT 1 FROM chess_users WHERE id = p_challenged_user_id AND banned_at IS NULL) THEN
      RAISE EXCEPTION 'challenged_not_found';
    END IF;
    -- Evita spam: no máximo 3 desafios pendentes do mesmo criador pro mesmo alvo
    IF (SELECT count(*) FROM chess_matches
         WHERE creator_id = p_user_id
           AND challenged_user_id = p_challenged_user_id
           AND status = 'WAITING') >= 3 THEN
      RAISE EXCEPTION 'too_many_pending_challenges';
    END IF;
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
     white_time_ms, black_time_ms,
     is_private, challenged_user_id)
  VALUES (
    p_wager, 'WAITING', p_user_id,
    CASE WHEN v_color = 'w' THEN p_user_id ELSE NULL END,
    CASE WHEN v_color = 'b' THEN p_user_id ELSE NULL END,
    p_wager,
    p_rating_min, p_rating_max,
    p_time_control_seconds, COALESCE(p_time_increment_seconds, 0),
    v_init_ms, v_init_ms,
    COALESCE(p_is_private, false) OR p_challenged_user_id IS NOT NULL,
    p_challenged_user_id
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
-- chess_join_match: desafio direto só pode ser aceito pelo desafiado.
-- O desafiado ignora a faixa de rating (o criador escolheu o oponente).
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
  m            chess_matches;
  v_balance    int;
  v_rating     int;
  v_creator    text;
  v_tournament text;
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

  IF m.challenged_user_id IS NOT NULL AND m.challenged_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_challenged_user';
  END IF;

  IF m.challenged_user_id IS NULL THEN
    SELECT rating INTO v_rating FROM chess_users WHERE id = p_user_id;
    IF m.rating_min IS NOT NULL AND v_rating < m.rating_min THEN RAISE EXCEPTION 'rating_too_low'; END IF;
    IF m.rating_max IS NOT NULL AND v_rating > m.rating_max THEN RAISE EXCEPTION 'rating_too_high'; END IF;
  END IF;

  SELECT balance INTO v_balance FROM chess_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < m.wager THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  v_creator := m.creator_id;

  -- Procura torneio ACTIVE em que ambos estejam inscritos, com TC compatível
  SELECT t.id INTO v_tournament
    FROM chess_tournaments t
   WHERE t.status = 'ACTIVE'
     AND t.time_control_seconds   = m.time_control_seconds
     AND t.time_increment_seconds = COALESCE(m.time_increment_seconds, 0)
     AND t.starts_at <= now()
     AND t.ends_at   >= now()
     AND EXISTS (SELECT 1 FROM chess_tournament_players WHERE tournament_id = t.id AND user_id = p_user_id)
     AND EXISTS (SELECT 1 FROM chess_tournament_players WHERE tournament_id = t.id AND user_id = v_creator)
   ORDER BY t.starts_at DESC
   LIMIT 1;

  UPDATE chess_matches SET
    white_user_id = COALESCE(m.white_user_id, CASE WHEN m.white_user_id IS NULL THEN p_user_id END),
    black_user_id = COALESCE(m.black_user_id, CASE WHEN m.black_user_id IS NULL THEN p_user_id END),
    status        = 'ACTIVE',
    started_at    = now(),
    last_move_at  = now(),
    pot           = m.wager * 2,
    tournament_id = v_tournament,
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

  RETURN jsonb_build_object('match_id', p_match_id, 'tournament_id', v_tournament);
END $$;

-- ============================================================
-- chess_decline_challenge: o desafiado recusa; reembolsa o criador.
-- ============================================================
CREATE OR REPLACE FUNCTION chess_decline_challenge(
  p_user_id  text,
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
  IF m.challenged_user_id IS NULL OR m.challenged_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_challenged_user';
  END IF;

  IF m.wager > 0 THEN
    UPDATE chess_wallets SET balance = balance + m.wager, locked = locked - m.wager, updated_at = now()
      WHERE user_id = m.creator_id RETURNING balance INTO v_balance;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, match_id, note)
      VALUES (m.creator_id, 'WAGER_REFUND', m.wager, v_balance, p_match_id, 'Desafio recusado');
  END IF;

  UPDATE chess_matches SET status = 'CANCELLED', updated_at = now() WHERE id = p_match_id;
  RETURN jsonb_build_object('match_id', p_match_id);
END $$;
