-- Xadrez Arena — Migration 0002
-- Conquistas, faixa de rating no matchmaking, limite de aposta para novatos
-- Rode no SQL Editor do Supabase APÓS a migration 0001.

-- ============================================================
-- 1. TRANSACTION TYPE: adiciona ACHIEVEMENT ao enum
-- ============================================================
DO $$ BEGIN
  ALTER TYPE chess_transaction_type ADD VALUE IF NOT EXISTS 'ACHIEVEMENT';
EXCEPTION WHEN others THEN NULL; END $$;

-- ============================================================
-- 2. MATCHMAKING: faixa de rating em chess_matches
-- ============================================================
ALTER TABLE chess_matches
  ADD COLUMN IF NOT EXISTS rating_min integer,
  ADD COLUMN IF NOT EXISTS rating_max integer;

-- ============================================================
-- 3. CONQUISTAS: tabelas
-- ============================================================
CREATE TABLE IF NOT EXISTS chess_achievement_types (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  description  text NOT NULL,
  icon         text NOT NULL,
  category     text NOT NULL CHECK (category IN ('partidas','xadrez','bot','rating','apostas')),
  reward_coins integer NOT NULL DEFAULT 0,
  sort_order   integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chess_user_achievements (
  user_id        text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES chess_achievement_types(id),
  earned_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS chess_user_achievements_user_idx
  ON chess_user_achievements(user_id, earned_at DESC);

-- ============================================================
-- 4. SEED: tipos de conquistas
-- ============================================================
INSERT INTO chess_achievement_types (id, name, description, icon, category, reward_coins, sort_order)
VALUES
  -- Partidas
  ('primeira_vitoria',  'Primeira Vitória',  'Vença sua primeira partida.',           '🏆', 'partidas', 50,  1),
  ('veterano',          'Veterano',           'Jogue 10 partidas.',                    '🎖️', 'partidas', 100, 2),
  ('centuriao',         'Centurião',          'Jogue 100 partidas.',                   '⚔️', 'partidas', 250, 3),
  ('sequencia_3',       'Em Chamas',          'Vença 3 partidas seguidas.',            '🔥', 'partidas', 100, 4),
  ('sequencia_5',       'Imparável',          'Vença 5 partidas seguidas.',            '⚡', 'partidas', 250, 5),
  ('sequencia_10',      'Lenda',              'Vença 10 partidas seguidas.',           '👑', 'partidas', 500, 6),
  -- Xadrez
  ('xeque_rapido',      'Relâmpago',          'Dê xeque-mate em 15 lances ou menos.', '⚡', 'xadrez',  100, 7),
  ('longa_batalha',     'Longa Batalha',      'Jogue uma partida com 60+ lances.',     '⏳', 'xadrez',  100, 8),
  ('cinco_amistosos',   'Diplomata',          'Jogue 5 partidas sem aposta.',          '🤝', 'xadrez',   50, 9),
  -- Bot
  ('primeira_bot',      'Dominador',          'Vença o bot em qualquer dificuldade.',  '🤖', 'bot',      50, 10),
  ('vence_dificil',     'Exterminador',       'Vença o bot no modo Difícil.',          '💀', 'bot',     250, 11),
  -- Rating
  ('rating_1200',       'Promissor',          'Alcance 1200 de rating.',               '⭐', 'rating',  100, 12),
  ('rating_1500',       'Expert',             'Alcance 1500 de rating.',               '🌟', 'rating',  250, 13),
  ('rating_1800',       'Mestre',             'Alcance 1800 de rating.',               '💫', 'rating',  500, 14),
  -- Apostas
  ('grande_aposta',     'Grande Apostador',   'Faça uma aposta de 500+ coins.',        '💰', 'apostas', 100, 15)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. RPC: concede uma conquista (idempotente) + recompensa
-- ============================================================
CREATE OR REPLACE FUNCTION chess_grant_achievement(
  p_user_id      text,
  p_achievement_id text
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_reward  integer;
  v_balance integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM chess_user_achievements
    WHERE user_id = p_user_id AND achievement_id = p_achievement_id
  ) THEN
    RETURN false;
  END IF;

  SELECT reward_coins INTO v_reward
    FROM chess_achievement_types WHERE id = p_achievement_id;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO chess_user_achievements (user_id, achievement_id)
  VALUES (p_user_id, p_achievement_id);

  IF v_reward > 0 THEN
    UPDATE chess_wallets
      SET balance = balance + v_reward, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;

    INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
    VALUES (p_user_id, 'ACHIEVEMENT', v_reward, v_balance,
            'Conquista: ' || p_achievement_id);
  END IF;

  RETURN true;
END $$;

-- ============================================================
-- 6. RPC atualizada: chess_create_match aceita rating_min/max
-- ============================================================
CREATE OR REPLACE FUNCTION chess_create_match(
  p_user_id   text,
  p_wager     int,
  p_color     text,
  p_rating_min integer DEFAULT NULL,
  p_rating_max integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_color    text;
  v_balance  int;
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

  INSERT INTO chess_matches
    (wager, status, creator_id, white_user_id, black_user_id, pot, rating_min, rating_max)
  VALUES (
    p_wager, 'WAITING', p_user_id,
    CASE WHEN v_color = 'w' THEN p_user_id ELSE NULL END,
    CASE WHEN v_color = 'b' THEN p_user_id ELSE NULL END,
    p_wager,
    p_rating_min,
    p_rating_max
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
-- 7. RPC atualizada: chess_join_match valida faixa de rating
-- ============================================================
CREATE OR REPLACE FUNCTION chess_join_match(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  m          chess_matches;
  v_balance  int;
  v_rating   int;
BEGIN
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
