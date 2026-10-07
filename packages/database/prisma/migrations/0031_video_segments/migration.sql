-- CreateTable: AI/creator-defined content segments used to compute a video
-- skip-plan (play only the useful parts: skip intro/sponsor/recap/outro/filler).
CREATE TABLE "video_segments" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_segments_videoId_idx" ON "video_segments"("videoId");
