-- "Quero jogar": games each person wants to play on the stream (limited per person in src/votes.js).
-- game_key is the same key as ownership ("steam:<appid>" or "name:<normalized name>").
CREATE TABLE play_votes (
  steam_id TEXT NOT NULL REFERENCES users (steam_id) ON DELETE CASCADE,
  game_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (steam_id, game_key)
);

CREATE INDEX play_votes_game ON play_votes (game_key);

-- Steam friends (JSON array of Steam IDs), read on sign-in and sync when the friends list is public.
ALTER TABLE users ADD COLUMN friend_ids TEXT NOT NULL DEFAULT '[]';
