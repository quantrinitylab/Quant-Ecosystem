-- CreateEnum
CREATE TYPE "VideoChatSessionStatus" AS ENUM ('CONNECTED', 'ENDED', 'SKIPPED');

-- CreateTable
CREATE TABLE "video_chat_sessions" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "status" "VideoChatSessionStatus" NOT NULL DEFAULT 'CONNECTED',
    "matchedInterests" JSONB NOT NULL DEFAULT '[]',
    "hasTextFallback" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "video_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_chat_sessions_user1Id_idx" ON "video_chat_sessions"("user1Id");

-- CreateIndex
CREATE INDEX "video_chat_sessions_user2Id_idx" ON "video_chat_sessions"("user2Id");
