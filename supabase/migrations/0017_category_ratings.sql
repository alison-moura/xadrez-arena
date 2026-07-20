-- Xadrez Arena — Migration 0017
-- Ratings separados por categoria de tempo (estilo chess.com):
--   bullet ≤ 120s · blitz ≤ 300s · rapid > 300s (inclui clássico).
-- Partidas sem relógio NÃO afetam rating de categoria (só o rating geral).
--
-- Implementado como TRIGGER aditivo em chess_matches (mesmo padrão do trigger
-- de torneios): não altera nenhuma RPC existente — o rating geral continua
-- sendo atualizado inline pelas RPCs como antes.

ALTER TABLE chess_users
  ADD COLUMN IF NOT EXISTS rating_bullet int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS rating_blitz  int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS rating_rapid  int NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS games_bullet  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS games_blitz   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS games_rapid   int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS chess_users_rating_bullet_idx ON chess_users(rating_bullet DESC);
CREATE INDEX IF NOT EXISTS chess_users_rating_blitz_idx  ON chess_users(rating_blitz DESC);
CREATE INDEX IF NOT EXISTS chess_users_rating_rapid_idx  ON chess_users(rating_rapid DESC);

CREATE OR REPLACE FUNCTION chess_time_category(p_tc_seconds int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_tc_seconds IS NULL  THEN NULL
    WHEN p_tc_seconds <= 120   THEN 'bullet'
    WHEN p_tc_seconds <= 300   THEN 'blitz'
    ELSE 'rapid'
  END;
$$;

CREATE OR REPLACE FUNCTION chess_category_rating_update()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_cat    text;
  v_wid    text;  -- white
  v_bid    text;  -- black
  v_wr     int;   v_br  int;   -- ratings da categoria
  v_wg     int;   v_bg  int;   -- jogos na categoria
  v_kw     int;   v_kb  int;
  v_ew     float;
  v_sw     float; v_sb  float; -- score real (1 / 0.5 / 0)
  v_dw     int;   v_db  int;
BEGIN
  IF NEW.status <> 'FINISHED' THEN RETURN NEW; END IF;
  IF OLD.status = 'FINISHED' THEN RETURN NEW; END IF;   -- já processado
  IF NEW.bot_difficulty IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.white_user_id IS NULL OR NEW.black_user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.result = 'ABORTED' THEN RETURN NEW; END IF;

  v_cat := chess_time_category(NEW.time_control_seconds);
  IF v_cat IS NULL THEN RETURN NEW; END IF;

  v_wid := NEW.white_user_id;
  v_bid := NEW.black_user_id;

  IF NEW.result = 'DRAW' THEN
    v_sw := 0.5; v_sb := 0.5;
  ELSIF NEW.winner_id = v_wid THEN
    v_sw := 1.0; v_sb := 0.0;
  ELSIF NEW.winner_id = v_bid THEN
    v_sw := 0.0; v_sb := 1.0;
  ELSE
    RETURN NEW;  -- sem vencedor definido
  END IF;

  EXECUTE format('SELECT rating_%I, games_%I FROM chess_users WHERE id = $1', v_cat, v_cat)
    INTO v_wr, v_wg USING v_wid;
  EXECUTE format('SELECT rating_%I, games_%I FROM chess_users WHERE id = $1', v_cat, v_cat)
    INTO v_br, v_bg USING v_bid;

  v_kw := CASE WHEN v_wg < 10 THEN 40 WHEN v_wg < 30 THEN 20 ELSE 10 END;
  v_kb := CASE WHEN v_bg < 10 THEN 40 WHEN v_bg < 30 THEN 20 ELSE 10 END;
  v_ew := 1.0 / (1.0 + POWER(10.0, (v_br - v_wr)::float / 400.0));
  v_dw := ROUND(v_kw * (v_sw - v_ew))::int;
  v_db := ROUND(v_kb * (v_sb - (1.0 - v_ew)))::int;

  EXECUTE format(
    'UPDATE chess_users SET rating_%I = GREATEST(100, rating_%I + $1), games_%I = games_%I + 1, updated_at = now() WHERE id = $2',
    v_cat, v_cat, v_cat, v_cat
  ) USING v_dw, v_wid;
  EXECUTE format(
    'UPDATE chess_users SET rating_%I = GREATEST(100, rating_%I + $1), games_%I = games_%I + 1, updated_at = now() WHERE id = $2',
    v_cat, v_cat, v_cat, v_cat
  ) USING v_db, v_bid;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chess_category_rating_trg ON chess_matches;
CREATE TRIGGER chess_category_rating_trg
  AFTER UPDATE ON chess_matches
  FOR EACH ROW
  EXECUTE FUNCTION chess_category_rating_update();
