-- 0107_story_media_likes_comments (2026-10-29): Phase 2C -- Stories viewer + creation.
--
-- New tables:
--   story_likes    -- one row per (storyId, userId); the Discover viewer's
--                     heart rail reads REAL counters from here, never a
--                     fabricated number. Relation-free like story_views
--                     (no back-relations on User), FK cascades keep the
--                     story-expiry worker's deletes consistent.
--   story_comments -- per-story comments for the Discover viewer's comment
--                     sheet; oldest-first reads, same relation-free shape.
--
-- New columns on stories:
--   placeId / placeName -- optional place tag for Send To -> location/place
--                         story rows. Display metadata only; never affects
--                         the QC-F-021 visibility gates.
--   name               -- optional story name for Memories -> Create Story
--                         batches (segments published together under one
--                         name). Display metadata only.
--
-- All additive; no existing rows touched. Follows keep using the existing
-- user_relationships table (RelationshipType.FOLLOW) -- no new table needed.

CREATE TABLE "story_likes" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_likes_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "story_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "story_likes_storyId_userId_key" ON "story_likes"("storyId", "userId");
CREATE INDEX "story_likes_storyId_idx" ON "story_likes"("storyId");
CREATE INDEX "story_likes_userId_idx" ON "story_likes"("userId");

CREATE TABLE "story_comments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "story_comments_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "story_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "story_comments_storyId_createdAt_idx" ON "story_comments"("storyId", "createdAt");
CREATE INDEX "story_comments_userId_idx" ON "story_comments"("userId");

ALTER TABLE "stories" ADD COLUMN "placeId" TEXT;
ALTER TABLE "stories" ADD COLUMN "placeName" TEXT;
ALTER TABLE "stories" ADD COLUMN "name" TEXT;
