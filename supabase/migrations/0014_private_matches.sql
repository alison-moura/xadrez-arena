-- Xadrez Arena — Migration 0014
-- Partidas privadas: criadas por convite (link). Não aparecem no lobby público.

ALTER TABLE chess_matches
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- Aceita p_is_private em chess_create_match.
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
  p_is_private             boolean DEFAULT false
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
     white_time_ms, black_time_ms,
     is_private)
  VALUES (
    p_wager, 'WAITING', p_user_id,
    CASE WHEN v_color = 'w' THEN p_user_id ELSE NULL END,
    CASE WHEN v_color = 'b' THEN p_user_id ELSE NULL END,
    p_wager,
    p_rating_min, p_rating_max,
    p_time_control_seconds, COALESCE(p_time_increment_seconds, 0),
    v_init_ms, v_init_ms,
    COALESCE(p_is_private, false)
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
