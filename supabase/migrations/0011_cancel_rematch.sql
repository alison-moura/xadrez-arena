-- Xadrez Arena — Migration 0011
-- Permite cancelar pedido de rematch.

CREATE OR REPLACE FUNCTION chess_cancel_rematch(
  p_user_id  text,
  p_match_id text
) RETURNS jsonb
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE chess_matches
    SET rematch_offered_by = NULL, updated_at = now()
  WHERE id = p_match_id
    AND rematch_offered_by = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_rematch_pending'; END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
