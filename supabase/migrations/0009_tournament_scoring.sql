-- Xadrez Arena — Migration 0009
-- Atualiza score do torneio automaticamente ao finalizar partidas vinculadas
-- a um torneio. Também ajusta chess_join_match para vincular automaticamente.

-- ============================================================
-- Trigger: ao finalizar uma partida com tournament_id, atualiza scores.
-- Vitória=2 pts, empate=1 pt, derrota=0 pts.
-- ============================================================
CREATE OR REPLACE FUNCTION chess_tournament_match_finished()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t_id text;
  is_draw boolean;
BEGIN
  IF NEW.tournament_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status <> 'FINISHED' THEN RETURN NEW; END IF;
  IF OLD.status = 'FINISHED' THEN RETURN NEW; END IF;  -- já processado

  t_id    := NEW.tournament_id;
  is_draw := NEW.result = 'DRAW';

  IF is_draw THEN
    -- 1 pt pra cada lado inscrito
    UPDATE chess_tournament_players
      SET score = score + 1, draws = draws + 1, streak = 0
      WHERE tournament_id = t_id AND user_id IN (NEW.white_user_id, NEW.black_user_id);
  ELSIF NEW.winner_id IS NOT NULL THEN
    -- Vencedor: +2 pts e +1 streak
    UPDATE chess_tournament_players
      SET score = score + 2, wins = wins + 1, streak = streak + 1
      WHERE tournament_id = t_id AND user_id = NEW.winner_id;
    -- Perdedor: 0 pts, streak zera
    UPDATE chess_tournament_players
      SET losses = losses + 1, streak = 0
      WHERE tournament_id = t_id
        AND user_id IN (NEW.white_user_id, NEW.black_user_id)
        AND user_id <> NEW.winner_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chess_tournament_match_finished_trg ON chess_matches;
CREATE TRIGGER chess_tournament_match_finished_trg
  AFTER UPDATE ON chess_matches
  FOR EACH ROW
  EXECUTE FUNCTION chess_tournament_match_finished();

-- ============================================================
-- chess_join_match: se ambos jogadores estão no mesmo torneio ACTIVE com
-- mesmo time control, vincula tournament_id automaticamente.
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

  SELECT rating INTO v_rating FROM chess_users WHERE id = p_user_id;
  IF m.rating_min IS NOT NULL AND v_rating < m.rating_min THEN RAISE EXCEPTION 'rating_too_low'; END IF;
  IF m.rating_max IS NOT NULL AND v_rating > m.rating_max THEN RAISE EXCEPTION 'rating_too_high'; END IF;

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
-- Promove torneios SCHEDULED → ACTIVE quando chega a hora.
-- Idempotente — pode ser chamada periodicamente.
-- ============================================================
CREATE OR REPLACE FUNCTION chess_tick_tournaments()
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_activated int := 0;
  v_finished  int := 0;
  rec record;
BEGIN
  UPDATE chess_tournaments
    SET status = 'ACTIVE'
  WHERE status = 'SCHEDULED' AND starts_at <= now() AND ends_at > now();
  GET DIAGNOSTICS v_activated = ROW_COUNT;

  FOR rec IN
    SELECT id FROM chess_tournaments
     WHERE status IN ('SCHEDULED','ACTIVE') AND ends_at <= now()
  LOOP
    PERFORM chess_finalize_tournament(rec.id);
    v_finished := v_finished + 1;
  END LOOP;

  RETURN jsonb_build_object('activated', v_activated, 'finished', v_finished);
END $$;
