-- Xadrez Arena — Migration 0006
-- RPC chess_claim_draw: finaliza partida como empate (repetição/50-lances/material insuficiente).
-- Diferente de chess_accept_draw: não exige oferta pendente — usado pelo client após
-- chess.js detectar condição de draw automático/reivindicável.

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
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;
  IF m.white_user_id <> p_user_id AND m.black_user_id <> p_user_id THEN
    RAISE EXCEPTION 'not_a_player';
  END IF;

  -- Devolve apostas
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
