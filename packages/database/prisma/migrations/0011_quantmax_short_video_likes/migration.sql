-- QuantMax short-video likes: an idempotent like join (one row per user/video)
-- so likes can be toggled and counted without double-counting. ShortVideo.likeCount
-- is kept in sync by the application.

-- CreateTable
CREATE TABLE "short_video_likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shortVideoId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "short_video_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "short_video_likes_userId_shortVideoId_key" ON "short_video_likes"("userId", "shortVideoId");

-- CreateIndex
CREATE INDEX "short_video_likes_shortVideoId_idx" ON "short_video_likes"("shortVideoId");
