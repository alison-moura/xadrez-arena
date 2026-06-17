-- Xadrez Arena — Migration 0013
-- Bônus diário de login (com streak).

ALTER TABLE chess_users
  ADD COLUMN IF NOT EXISTS last_daily_bonus_at timestamptz,
  ADD COLUMN IF NOT EXISTS daily_streak        int NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION chess_claim_daily_bonus(
  p_user_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_last     timestamptz;
  v_streak   int;
  v_today    date := (now() AT TIME ZONE 'UTC')::date;
  v_lastDay  date;
  v_amount   int;
  v_balance  int;
BEGIN
  SELECT last_daily_bonus_at, daily_streak INTO v_last, v_streak
    FROM chess_users WHERE id = p_user_id;

  IF v_last IS NOT NULL THEN
    v_lastDay := (v_last AT TIME ZONE 'UTC')::date;
    IF v_lastDay = v_today THEN
      RETURN jsonb_build_object('already_claimed', true, 'streak', v_streak);
    END IF;
    -- Manteve streak (ontem) ou reseta?
    IF v_lastDay = (v_today - 1) THEN v_streak := v_streak + 1;
    ELSE v_streak := 1;
    END IF;
  ELSE
    v_streak := 1;
  END IF;

  -- 20 base + 10 por dia de streak, máx 200
  v_amount := LEAST(200, 20 + (v_streak - 1) * 10);

  UPDATE chess_wallets
    SET balance = balance + v_amount, updated_at = now()
   WHERE user_id = p_user_id
   RETURNING balance INTO v_balance;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'wallet_not_found'; END IF;

  INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
  VALUES (p_user_id, 'ACHIEVEMENT', v_amount, v_balance,
          format('Bônus diário (streak %s)', v_streak));

  UPDATE chess_users
    SET last_daily_bonus_at = now(), daily_streak = v_streak, updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object('claimed', true, 'amount', v_amount, 'streak', v_streak, 'balance', v_balance);
END $$;
