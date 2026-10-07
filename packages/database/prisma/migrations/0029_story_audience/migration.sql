-- Story audience: 'ALL' (default, visible to followers) or 'CLOSE_FRIENDS'
-- (visible only to viewers the author has added as a close friend).
ALTER TABLE "stories" ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'ALL';
