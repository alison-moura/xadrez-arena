-- Cria usuário admin 'alison'. Idempotente: se já existir, só promove.
DO $$
DECLARE
  v_user_id text;
  v_existing text;
BEGIN
  SELECT id INTO v_existing FROM chess_users WHERE username = 'alison';
  IF v_existing IS NULL THEN
    -- Cria via RPC pra garantir wallet + bônus + transação inicial
    SELECT (chess_register_user(
      'alison',
      'alison@xadrez.local',
      '$2a$10$cUPCem8RCW.cDO3xLKdiUuMnuvlj6H430WugijjnaSn66riXT.VXK'
    )->>'user_id') INTO v_user_id;
  ELSE
    v_user_id := v_existing;
  END IF;

  UPDATE chess_users
     SET is_admin = true,
         password_hash = '$2a$10$cUPCem8RCW.cDO3xLKdiUuMnuvlj6H430WugijjnaSn66riXT.VXK',
         updated_at = now()
   WHERE id = v_user_id;
END $$;

SELECT id, username, email, is_admin, rating, games_played, created_at
  FROM chess_users WHERE username = 'alison';
