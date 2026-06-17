-- Xadrez Arena — Migration 0012
-- Sistema simples de "seguir" (one-way follow, sem aceite mútuo) e
-- last_seen_at pra status online.

ALTER TABLE chess_users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE TABLE IF NOT EXISTS chess_user_follows (
  follower_id text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  followed_id text NOT NULL REFERENCES chess_users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS chess_user_follows_followed_idx
  ON chess_user_follows(followed_id);
CREATE INDEX IF NOT EXISTS chess_user_follows_follower_idx
  ON chess_user_follows(follower_id);
