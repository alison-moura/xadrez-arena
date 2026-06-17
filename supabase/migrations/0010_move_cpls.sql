-- Xadrez Arena — Migration 0010
-- Adiciona vetor de CPL por lance pra exibir anotações na página de análise.
ALTER TABLE chess_matches
  ADD COLUMN IF NOT EXISTS move_cpls jsonb;
