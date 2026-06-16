-- Xadrez Arena — bot support
-- Adiciona um usuário-bot, coluna de dificuldade e RPC pra criar partida vs bot.

ALTER TABLE chess_users    ADD COLUMN IF NOT EXISTS is_bot          boolean NOT NULL DEFAULT false;
ALTER TABLE chess_matches  ADD COLUMN IF NOT EXISTS bot_difficulty  text;

-- usuário bot (id fixo, fácil de referenciar)
INSERT INTO chess_users (id, username, email, password_hash, rating, is_bot)
VALUES (
  '00000000-0000-0000-0000-0000000000b0',
  'XadrezBot',
  'bot@xadrez-arena.local',
  'no-login-disabled',
  1400,
  true
)
ON CONFLICT (id) DO UPDATE SET is_bot = true;

INSERT INTO chess_wallets (user_id, balance, locked)
VALUES ('00000000-0000-0000-0000-0000000000b0', 0, 0)
ON CONFLICT (user_id) DO NOTHING;

-- RPC: cria partida amistosa entre user e bot
CREATE OR REPLACE FUNCTION chess_create_bot_match(
  p_user_id    text,
  p_difficulty text,
  p_color      text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_color    text;
  v_match_id text;
  v_bot      text := '00000000-0000-0000-0000-0000000000b0';
BEGIN
  IF p_difficulty NOT IN ('easy','medium','hard') THEN RAISE EXCEPTION 'invalid_difficulty'; END IF;
  IF p_color      NOT IN ('w','b','random')     THEN RAISE EXCEPTION 'invalid_color'; END IF;

  v_color := CASE
    WHEN p_color = 'random' THEN (CASE WHEN random() < 0.5 THEN 'w' ELSE 'b' END)
    ELSE p_color
  END;

  INSERT INTO chess_matches (
    wager, status, creator_id,
    white_user_id, black_user_id,
    pot, started_at, bot_difficulty
  ) VALUES (
    0, 'ACTIVE', p_user_id,
    CASE WHEN v_color = 'w' THEN p_user_id ELSE v_bot END,
    CASE WHEN v_color = 'b' THEN p_user_id ELSE v_bot END,
    0, now(), p_difficulty
  ) RETURNING id INTO v_match_id;

  RETURN jsonb_build_object(
    'match_id',   v_match_id,
    'color',      v_color,
    'bot_id',     v_bot,
    'bot_starts', CASE WHEN v_color = 'b' THEN true ELSE false END
  );
END $$;

-- Bot não afeta rating em partidas amistosas — sobrescreve record_move pra pular update
-- quando é match vs bot. Mantém escrow/payout (irrelevante já que wager=0).
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
  p_is_game_over boolean
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m chess_matches;
  v_new_ply   int;
  v_my_color  text;
  v_winner_id text;
  v_loser_id  text;
  v_result    chess_match_result;
  v_pot       int;
  v_rake      int;
  v_payout    int;
  v_balance   int;
  v_is_bot_match boolean;
BEGIN
  SELECT * INTO m FROM chess_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status <> 'ACTIVE' THEN RAISE EXCEPTION 'match_not_active'; END IF;

  IF m.white_user_id = p_user_id THEN v_my_color := 'w';
  ELSIF m.black_user_id = p_user_id THEN v_my_color := 'b';
  ELSE RAISE EXCEPTION 'not_a_player'; END IF;

  IF m.turn <> v_my_color THEN RAISE EXCEPTION 'not_your_turn'; END IF;

  v_is_bot_match := m.bot_difficulty IS NOT NULL;
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

      -- rating só conta em partidas humano-vs-humano
      IF NOT v_is_bot_match THEN
        UPDATE chess_users SET rating = rating + 15 WHERE id = v_winner_id;
        UPDATE chess_users SET rating = GREATEST(800, rating - 15) WHERE id = v_loser_id;
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
