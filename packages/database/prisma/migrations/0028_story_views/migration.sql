-- CreateTable: distinct per-viewer story-view records. One row per
-- (storyId, viewerId) so a re-view never inflates the count; a story's
-- viewCount is the count of these rows (excluding the owner's own views).
CREATE TABLE "story_views" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "story_views_storyId_viewerId_key" ON "story_views"("storyId", "viewerId");

-- CreateIndex
CREATE INDEX "story_views_storyId_idx" ON "story_views"("storyId");
