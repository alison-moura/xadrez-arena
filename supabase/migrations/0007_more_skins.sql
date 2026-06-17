-- Xadrez Arena — Migration 0007
-- Mais 6 skins na loja.

INSERT INTO chess_skin_packs (id, name, description, rarity, price_coins, drop_weight, sort_order) VALUES
  ('ocean',    'Profundezas',     'O azul calmo das águas profundas.',          'common',    400,  70, 8),
  ('sakura',   'Sakura',          'A primavera japonesa no tabuleiro.',         'rare',      900,  35, 9),
  ('arctic',   'Ártico',          'Gelo eterno e auroras boreais.',             'rare',      1100, 25, 10),
  ('emerald',  'Esmeralda Real',  'Verde profundo cravado em pedra.',           'epic',      2200, 12, 11),
  ('amethyst', 'Ametista',        'Cristal violeta de poder ancestral.',        'epic',      2600, 8,  12),
  ('inferno',  'Inferno',         'Para quem joga com fogo nas veias.',         'legendary', 5000, 2,  13)
ON CONFLICT (id) DO NOTHING;
