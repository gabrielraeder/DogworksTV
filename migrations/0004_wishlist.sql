-- Steam wishlist of each user (JSON array of appids), read like the library on sign-in and sync.
-- Only readable when the profile's game details are public; otherwise it stays '[]'.
ALTER TABLE users ADD COLUMN wishlist_appids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN wishlist_synced_at INTEGER;
