-- Migration 0071: QuantMax short-video comments (TikTok-style comment threads).
-- Relation-less join table matching short_video_likes (scalar userId + shortVideoId,
-- no FK), soft-deletable, indexed for per-video chronological listing.

CREATE TABLE IF NOT EXISTS "short_video_comments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shortVideoId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "short_video_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "short_video_comments_shortVideoId_createdAt_idx"
    ON "short_video_comments" ("shortVideoId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "short_video_comments_userId_idx"
    ON "short_video_comments" ("userId");
