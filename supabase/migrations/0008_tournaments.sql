-- Xadrez Arena — Migration 0008
-- Arena tournaments: jogadores inscritos jogam partidas ranqueadas curtas
-- durante uma janela de tempo. Vitória = 2 pts, empate = 1 pt, derrota = 0 pts.
-- Ranking final atribui prêmio em coins.

CREATE TABLE IF NOT EXISTS chess_tournaments (
  id                     text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                   text NOT NULL,
  description            text,
  status                 text NOT NULL DEFAULT 'SCHEDULED'
                              CHECK (status IN ('SCHEDULED','ACTIVE','FINISHED','CANCELLED')),
  starts_at              timestamptz NOT NULL,
  ends_at                timestamptz NOT NULL,
  time_control_seconds   int  NOT NULL DEFAULT 180, -- bullet/blitz padrão pra rotatividade
  time_increment_seconds int  NOT NULL DEFAULT 0,
  entry_fee              int  NOT NULL DEFAULT 0,
  prize_pool             int  NOT NULL DEFAULT 0,    -- patrocinado/seed; cresce com inscrições
  rake_bps               int  NOT NULL DEFAULT 0,
  rating_min             int,
  rating_max             int,
  created_by             text REFERENCES chess_users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chess_tournaments_status_idx ON chess_tournaments(status, starts_at);

CREATE TABLE IF NOT EXISTS chess_tournament_players (
  tournament_id text NOT NULL REFERENCES chess_tournaments(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  score         int  NOT NULL DEFAULT 0,
  wins          int  NOT NULL DEFAULT 0,
  draws         int  NOT NULL DEFAULT 0,
  losses        int  NOT NULL DEFAULT 0,
  streak        int  NOT NULL DEFAULT 0,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id)
);
CREATE INDEX IF NOT EXISTS chess_tournament_players_score_idx
  ON chess_tournament_players(tournament_id, score DESC);

-- Liga a partida ao torneio (NULL = casual)
ALTER TABLE chess_matches
  ADD COLUMN IF NOT EXISTS tournament_id text REFERENCES chess_tournaments(id) ON DELETE SET NULL;

-- ============================================================
-- RPC: inscrever-se em um torneio
-- ============================================================
CREATE OR REPLACE FUNCTION chess_join_tournament(
  p_user_id       text,
  p_tournament_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  t chess_tournaments;
  v_balance int;
  v_rating  int;
BEGIN
  SELECT * INTO t FROM chess_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF t.status NOT IN ('SCHEDULED','ACTIVE') THEN RAISE EXCEPTION 'tournament_not_open'; END IF;
  IF t.ends_at < now() THEN RAISE EXCEPTION 'tournament_ended'; END IF;

  IF EXISTS (SELECT 1 FROM chess_tournament_players WHERE tournament_id = p_tournament_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('already_joined', true);
  END IF;

  SELECT rating INTO v_rating FROM chess_users WHERE id = p_user_id;
  IF t.rating_min IS NOT NULL AND v_rating < t.rating_min THEN RAISE EXCEPTION 'rating_too_low'; END IF;
  IF t.rating_max IS NOT NULL AND v_rating > t.rating_max THEN RAISE EXCEPTION 'rating_too_high'; END IF;

  IF t.entry_fee > 0 THEN
    SELECT balance INTO v_balance FROM chess_wallets WHERE user_id = p_user_id FOR UPDATE;
    IF v_balance IS NULL OR v_balance < t.entry_fee THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
    UPDATE chess_wallets SET balance = balance - t.entry_fee, updated_at = now()
      WHERE user_id = p_user_id;
    INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
      VALUES (p_user_id, 'WAGER_LOCK', -t.entry_fee, v_balance - t.entry_fee, 'Inscrição torneio: ' || t.name);
    UPDATE chess_tournaments SET prize_pool = prize_pool + t.entry_fee WHERE id = p_tournament_id;
  END IF;

  INSERT INTO chess_tournament_players (tournament_id, user_id) VALUES (p_tournament_id, p_user_id);
  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================
-- RPC: finaliza torneio e distribui prêmios (3-1-1, top-3, ou rateio)
-- ============================================================
CREATE OR REPLACE FUNCTION chess_finalize_tournament(
  p_tournament_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  t            chess_tournaments;
  total_prize  int;
  rake         int;
  net          int;
  v_balance    int;
  ranked       record;
  rank_idx     int := 0;
BEGIN
  SELECT * INTO t FROM chess_tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF t.status = 'FINISHED' THEN RETURN jsonb_build_object('already_finished', true); END IF;

  total_prize := t.prize_pool;
  rake        := (total_prize * t.rake_bps) / 10000;
  net         := total_prize - rake;

  FOR ranked IN
    SELECT user_id, score
      FROM chess_tournament_players
     WHERE tournament_id = p_tournament_id
     ORDER BY score DESC, wins DESC, joined_at ASC
     LIMIT 3
  LOOP
    rank_idx := rank_idx + 1;
    DECLARE
      share int;
    BEGIN
      share := CASE rank_idx WHEN 1 THEN (net * 60) / 100
                             WHEN 2 THEN (net * 25) / 100
                             ELSE     (net * 15) / 100 END;
      IF share > 0 THEN
        UPDATE chess_wallets SET balance = balance + share, updated_at = now()
          WHERE user_id = ranked.user_id RETURNING balance INTO v_balance;
        INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
          VALUES (ranked.user_id, 'WAGER_WIN', share, v_balance,
                  format('Torneio %s — %s lugar', t.name, rank_idx::text));
      END IF;
    END;
  END LOOP;

  UPDATE chess_tournaments SET status = 'FINISHED' WHERE id = p_tournament_id;
  RETURN jsonb_build_object('ok', true, 'distributed', net, 'rake', rake);
END $$;

-- Seed: 1 torneio inicial gratuito pra teste
INSERT INTO chess_tournaments (name, description, status, starts_at, ends_at,
                               time_control_seconds, time_increment_seconds,
                               entry_fee, prize_pool)
SELECT 'Arena de Estreia', 'Primeira arena do Xadrez Arena — entrada grátis, prêmio simbólico.',
       'SCHEDULED', now() + interval '1 hour', now() + interval '2 hours',
       300, 3, 0, 1000
WHERE NOT EXISTS (SELECT 1 FROM chess_tournaments);
