-- CreateEnum
CREATE TYPE "LiveStreamType" AS ENUM ('SOLO', 'DATING_EVENT', 'SPEED_DATING', 'GROUP_VIDEO', 'PARTY');

-- CreateTable
CREATE TABLE "live_streams" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "LiveStreamType" NOT NULL DEFAULT 'SOLO',
    "thumbnailUrl" TEXT,
    "viewerCount" INTEGER NOT NULL DEFAULT 0,
    "maxParticipants" INTEGER NOT NULL DEFAULT 0,
    "isLive" BOOLEAN NOT NULL DEFAULT true,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "live_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_stream_viewers" (
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_stream_viewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_streams_isLive_idx" ON "live_streams"("isLive");

-- CreateIndex
CREATE INDEX "live_streams_hostId_idx" ON "live_streams"("hostId");

-- CreateIndex
CREATE INDEX "live_stream_viewers_streamId_idx" ON "live_stream_viewers"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "live_stream_viewers_streamId_userId_key" ON "live_stream_viewers"("streamId", "userId");
