-- Xadrez Arena — Migration 0004
-- Sistema de skins (inventário, loja, mercado)

-- Add transaction types
DO $$ BEGIN ALTER TYPE chess_transaction_type ADD VALUE IF NOT EXISTS 'SKIN_PURCHASE'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE chess_transaction_type ADD VALUE IF NOT EXISTS 'SKIN_DROP'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE chess_transaction_type ADD VALUE IF NOT EXISTS 'MARKET_BUY'; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE chess_transaction_type ADD VALUE IF NOT EXISTS 'MARKET_SELL'; EXCEPTION WHEN others THEN NULL; END $$;

-- Skin packs catalog
CREATE TABLE IF NOT EXISTS chess_skin_packs (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  description  text NOT NULL,
  rarity       text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common','rare','epic','legendary')),
  price_coins  integer NOT NULL DEFAULT 0,
  drop_weight  integer NOT NULL DEFAULT 0,
  sort_order   integer NOT NULL DEFAULT 0
);

INSERT INTO chess_skin_packs (id, name, description, rarity, price_coins, drop_weight, sort_order) VALUES
  ('classic',   'Clássico',         'O estilo padrão atemporal.',              'common',    0,    0,  1),
  ('midnight',  'Meia-Noite',       'Tons escuros e misteriosos.',             'common',    300,  80, 2),
  ('neon',      'Neon Pulse',       'Energia pulsante em verde neon.',         'rare',      750,  40, 3),
  ('crimson',   'Blood Moon',       'A lua vermelha domina o tabuleiro.',      'rare',      1000, 30, 4),
  ('gold',      'Ouro Puro',        'Luxo em estado bruto.',                   'epic',      2000, 15, 5),
  ('cyber',     'Cyber Matrix',     'O futuro digital do xadrez.',             'epic',      2500, 10, 6),
  ('platinum',  'Platina Lendária', 'Para os verdadeiros campeões.',           'legendary', 0,    3,  7)
ON CONFLICT (id) DO NOTHING;

-- User skin inventory (tradeable instances)
CREATE TABLE IF NOT EXISTS chess_user_skins (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  skin_pack_id  text NOT NULL REFERENCES chess_skin_packs(id),
  acquired_at   timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL DEFAULT 'purchased' CHECK (source IN ('purchased','dropped','traded')),
  is_listed     boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS chess_user_skins_user_idx ON chess_user_skins(user_id, acquired_at DESC);

-- Marketplace listings
CREATE TABLE IF NOT EXISTS chess_skin_listings (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_skin_id  uuid NOT NULL REFERENCES chess_user_skins(id) ON DELETE CASCADE,
  seller_id     text NOT NULL REFERENCES chess_users(id),
  skin_pack_id  text NOT NULL REFERENCES chess_skin_packs(id),
  price_coins   integer NOT NULL CHECK (price_coins > 0),
  listed_at     timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled'))
);
CREATE INDEX IF NOT EXISTS chess_skin_listings_active_idx ON chess_skin_listings(status, listed_at DESC);
CREATE INDEX IF NOT EXISTS chess_skin_listings_seller_idx ON chess_skin_listings(seller_id);

-- Equipped skin on user
ALTER TABLE chess_users ADD COLUMN IF NOT EXISTS equipped_skin_id text REFERENCES chess_skin_packs(id) DEFAULT 'classic';

-- ============================================================
-- RPC: buy skin from shop
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_buy_skin' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION chess_buy_skin(p_user_id text, p_skin_pack_id text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_pack    chess_skin_packs;
  v_balance integer;
BEGIN
  SELECT * INTO v_pack FROM chess_skin_packs WHERE id = p_skin_pack_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'skin_not_found'; END IF;
  IF v_pack.price_coins <= 0 THEN RAISE EXCEPTION 'skin_not_for_sale'; END IF;

  SELECT balance INTO v_balance FROM chess_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF v_balance < v_pack.price_coins THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE chess_wallets SET balance = balance - v_pack.price_coins, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
  VALUES (p_user_id, 'SKIN_PURCHASE', -v_pack.price_coins, v_balance - v_pack.price_coins,
          'Compra de skin: ' || v_pack.name);

  INSERT INTO chess_user_skins (user_id, skin_pack_id, source) VALUES (p_user_id, p_skin_pack_id, 'purchased');
  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================
-- RPC: equip skin
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_equip_skin' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION chess_equip_skin(p_user_id text, p_skin_pack_id text)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  IF p_skin_pack_id <> 'classic' THEN
    IF NOT EXISTS (
      SELECT 1 FROM chess_user_skins
      WHERE user_id = p_user_id AND skin_pack_id = p_skin_pack_id AND is_listed = false
    ) THEN
      RAISE EXCEPTION 'skin_not_owned';
    END IF;
  END IF;
  UPDATE chess_users SET equipped_skin_id = p_skin_pack_id WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================
-- RPC: drop skin after game (20% chance, weighted random)
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_drop_skin' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION chess_drop_skin(p_user_id text, p_match_id text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_skin_id   text;
  v_skin_name text;
  v_rarity    text;
BEGIN
  IF random() > 0.20 THEN
    RETURN jsonb_build_object('dropped', false);
  END IF;

  -- Weighted random: higher drop_weight = more likely (Gumbel-max trick)
  SELECT id, name, rarity INTO v_skin_id, v_skin_name, v_rarity
  FROM chess_skin_packs
  WHERE drop_weight > 0
  ORDER BY -log(random()) / drop_weight
  LIMIT 1;

  IF v_skin_id IS NULL THEN RETURN jsonb_build_object('dropped', false); END IF;

  INSERT INTO chess_user_skins (user_id, skin_pack_id, source)
  VALUES (p_user_id, v_skin_id, 'dropped');

  INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
  SELECT p_user_id, 'SKIN_DROP', 0, balance, 'Drop de skin: ' || v_skin_name
  FROM chess_wallets WHERE user_id = p_user_id;

  RETURN jsonb_build_object('dropped', true, 'skin_id', v_skin_id, 'skin_name', v_skin_name, 'rarity', v_rarity);
END $$;

-- ============================================================
-- RPC: list skin on marketplace
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_list_skin' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION chess_list_skin(p_user_id text, p_user_skin_id uuid, p_price integer)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_skin chess_user_skins;
BEGIN
  SELECT * INTO v_skin FROM chess_user_skins WHERE id = p_user_skin_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'skin_not_owned'; END IF;
  IF v_skin.is_listed THEN RAISE EXCEPTION 'already_listed'; END IF;
  IF p_price < 1 THEN RAISE EXCEPTION 'invalid_price'; END IF;

  UPDATE chess_user_skins SET is_listed = true WHERE id = p_user_skin_id;
  INSERT INTO chess_skin_listings (user_skin_id, seller_id, skin_pack_id, price_coins)
  VALUES (p_user_skin_id, p_user_id, v_skin.skin_pack_id, p_price);
  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================
-- RPC: cancel marketplace listing
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_cancel_listing' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION chess_cancel_listing(p_user_id text, p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_listing chess_skin_listings;
BEGIN
  SELECT * INTO v_listing FROM chess_skin_listings WHERE id = p_listing_id AND seller_id = p_user_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing_not_found'; END IF;
  UPDATE chess_skin_listings SET status = 'cancelled' WHERE id = p_listing_id;
  UPDATE chess_user_skins SET is_listed = false WHERE id = v_listing.user_skin_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ============================================================
-- RPC: buy from marketplace (10% fee)
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE proname = 'chess_buy_market_skin' LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION chess_buy_market_skin(p_buyer_id text, p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_listing    chess_skin_listings;
  v_buyer_bal  integer;
  v_seller_bal integer;
  v_fee        integer;
  v_seller_net integer;
BEGIN
  SELECT * INTO v_listing FROM chess_skin_listings WHERE id = p_listing_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'listing_not_found'; END IF;
  IF v_listing.seller_id = p_buyer_id THEN RAISE EXCEPTION 'cant_buy_own'; END IF;

  SELECT balance INTO v_buyer_bal FROM chess_wallets WHERE user_id = p_buyer_id FOR UPDATE;
  IF v_buyer_bal IS NULL OR v_buyer_bal < v_listing.price_coins THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  SELECT balance INTO v_seller_bal FROM chess_wallets WHERE user_id = v_listing.seller_id FOR UPDATE;

  v_fee        := GREATEST(1, v_listing.price_coins / 10);
  v_seller_net := v_listing.price_coins - v_fee;

  UPDATE chess_wallets SET balance = balance - v_listing.price_coins, updated_at = now() WHERE user_id = p_buyer_id;
  INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
  VALUES (p_buyer_id, 'MARKET_BUY', -v_listing.price_coins, v_buyer_bal - v_listing.price_coins,
          'Compra no mercado: ' || v_listing.skin_pack_id);

  UPDATE chess_wallets SET balance = balance + v_seller_net, updated_at = now() WHERE user_id = v_listing.seller_id;
  INSERT INTO chess_transactions (user_id, type, amount, balance_after, note)
  VALUES (v_listing.seller_id, 'MARKET_SELL', v_seller_net, v_seller_bal + v_seller_net,
          'Venda no mercado: ' || v_listing.skin_pack_id);

  UPDATE chess_user_skins SET user_id = p_buyer_id, is_listed = false, source = 'traded' WHERE id = v_listing.user_skin_id;
  UPDATE chess_skin_listings SET status = 'sold' WHERE id = p_listing_id;

  RETURN jsonb_build_object('ok', true, 'skin_pack_id', v_listing.skin_pack_id);
END $$;
