-- Steam users who signed in
CREATE TABLE users (
  steam_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar TEXT,
  profile_url TEXT,
  -- JSON array of owned Steam appids (filled only when the Steam library is public)
  steam_appids TEXT NOT NULL DEFAULT '[]',
  library_visible INTEGER NOT NULL DEFAULT 0,
  library_synced_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Login sessions; id is the SHA-256 of the cookie token
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  steam_id TEXT NOT NULL REFERENCES users (steam_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE INDEX sessions_user ON sessions (steam_id);

-- "Eu tenho" marks. game_key is "steam:<appid>" or "name:<normalized name>"
CREATE TABLE ownership (
  steam_id TEXT NOT NULL REFERENCES users (steam_id) ON DELETE CASCADE,
  game_key TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('steam', 'epic', 'outra')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (steam_id, game_key, platform)
);

CREATE INDEX ownership_game ON ownership (game_key);
