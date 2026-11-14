-- The channel's list, edited on the site by the owner (OWNER_STEAM_IDS), on top of
-- public/data/games.json. Everyone sees these changes.
CREATE TABLE channel_games (
  -- base game id (e.g. "borderlands-2"), or "ch-…" for a game the owner added
  id TEXT PRIMARY KEY,
  -- JSON: the whole game when added = 1, or the edited fields of a base game
  data TEXT,
  -- 1 = game added by the owner (not in games.json)
  added INTEGER NOT NULL DEFAULT 0,
  -- 1 = base game removed from the list
  removed INTEGER NOT NULL DEFAULT 0,
  added_at INTEGER,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
