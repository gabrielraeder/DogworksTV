-- Per-account list data that used to live only in the browser (localStorage).
-- One row per user × game id (base ids like "borderlands-2", or "c-…" for games the user added).
CREATE TABLE user_games (
  steam_id TEXT NOT NULL REFERENCES users (steam_id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  -- 1 = game added by this user; data then holds the whole game
  custom INTEGER NOT NULL DEFAULT 0,
  -- JSON: the whole game when custom = 1, or the edited fields of a base game
  data TEXT,
  added_at INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (steam_id, game_id)
);
