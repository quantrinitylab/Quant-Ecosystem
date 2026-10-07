-- QuantChat Mega Upgrade Migration
-- Adds all models required for the QuantChat super-app transformation

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ACTIVE', 'ENDED', 'MISSED', 'DECLINED');

-- CreateEnum
CREATE TYPE "QuantMediaType" AS ENUM ('PHOTO', 'VIDEO', 'AUDIO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AlienStyle" AS ENUM ('CRYSTALLINE', 'BIOLUMINESCENT', 'CYBERNETIC');

-- CreateEnum
CREATE TYPE "QuantScheduleStatus" AS ENUM ('PENDING', 'SENT', 'CANCELLED');

-- AlterTable: Add QuantChat fields to users
ALTER TABLE "users" ADD COLUMN "xpPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "level" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "users" ADD COLUMN "ghostMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add QuantChat fields to conversations
ALTER TABLE "conversations" ADD COLUMN "themeId" TEXT;
ALTER TABLE "conversations" ADD COLUMN "disappearTimer" INTEGER;

-- AlterTable: Add isAIGenerated to messages
ALTER TABLE "messages" ADD COLUMN "isAIGenerated" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: Add expiresAt index on messages
CREATE INDEX "messages_expiresAt_idx" ON "messages"("expiresAt");

-- CreateIndex: Add updatedAt index on conversations
CREATE INDEX "conversations_updatedAt_idx" ON "conversations"("updatedAt");

-- CreateTable: reels
CREATE TABLE "reels" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "watchThroughRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable: reel_likes
CREATE TABLE "reel_likes" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reel_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: reel_comments
CREATE TABLE "reel_comments" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reel_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: calls
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "type" "CallType" NOT NULL DEFAULT 'VIDEO',
    "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "participants" JSONB NOT NULL DEFAULT '[]',
    "roomId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable: quantchat_media
CREATE TABLE "quantchat_media" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "QuantMediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "fileName" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quantchat_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable: avatars
CREATE TABLE "avatars" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "style" "AlienStyle" NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "reactions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avatars_pkey" PRIMARY KEY ("id")
);

-- CreateTable: streaks
CREATE TABLE "streaks" (
    "id" TEXT NOT NULL,
    "userAId" TEXT NOT NULL,
    "userBId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: friend_locations
CREATE TABLE "friend_locations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "friend_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: game_badges
CREATE TABLE "game_badges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeType" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable: memories
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "mediaType" "QuantMediaType" NOT NULL,
    "caption" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: scheduled_messages
CREATE TABLE "scheduled_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "QuantScheduleStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable: chat_themes
CREATE TABLE "chat_themes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "backgroundGradient" TEXT NOT NULL,
    "bubbleColor" TEXT NOT NULL,
    "fontStyle" TEXT NOT NULL,
    "isAlienTheme" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "chat_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: push_subscriptions
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: reels
CREATE INDEX "reels_creatorId_idx" ON "reels"("creatorId");
CREATE INDEX "reels_createdAt_idx" ON "reels"("createdAt");
CREATE INDEX "reels_likeCount_shareCount_watchThroughRate_idx" ON "reels"("likeCount", "shareCount", "watchThroughRate");

-- CreateIndex: reel_likes
CREATE UNIQUE INDEX "reel_likes_reelId_userId_key" ON "reel_likes"("reelId", "userId");
CREATE INDEX "reel_likes_reelId_idx" ON "reel_likes"("reelId");
CREATE INDEX "reel_likes_userId_idx" ON "reel_likes"("userId");

-- CreateIndex: reel_comments
CREATE INDEX "reel_comments_reelId_idx" ON "reel_comments"("reelId");
CREATE INDEX "reel_comments_userId_idx" ON "reel_comments"("userId");
CREATE INDEX "reel_comments_createdAt_idx" ON "reel_comments"("createdAt");

-- CreateIndex: calls
CREATE INDEX "calls_conversationId_idx" ON "calls"("conversationId");
CREATE INDEX "calls_initiatorId_idx" ON "calls"("initiatorId");
CREATE INDEX "calls_createdAt_idx" ON "calls"("createdAt");

-- CreateIndex: quantchat_media
CREATE INDEX "quantchat_media_userId_idx" ON "quantchat_media"("userId");
CREATE INDEX "quantchat_media_type_idx" ON "quantchat_media"("type");
CREATE INDEX "quantchat_media_createdAt_idx" ON "quantchat_media"("createdAt");

-- CreateIndex: avatars
CREATE UNIQUE INDEX "avatars_userId_key" ON "avatars"("userId");
CREATE INDEX "avatars_userId_idx" ON "avatars"("userId");

-- CreateIndex: streaks
CREATE UNIQUE INDEX "streaks_userAId_userBId_key" ON "streaks"("userAId", "userBId");
CREATE INDEX "streaks_userAId_idx" ON "streaks"("userAId");
CREATE INDEX "streaks_userBId_idx" ON "streaks"("userBId");
CREATE INDEX "streaks_expiresAt_idx" ON "streaks"("expiresAt");

-- CreateIndex: friend_locations
CREATE UNIQUE INDEX "friend_locations_userId_key" ON "friend_locations"("userId");
CREATE INDEX "friend_locations_userId_idx" ON "friend_locations"("userId");

-- CreateIndex: game_badges
CREATE INDEX "game_badges_userId_idx" ON "game_badges"("userId");
CREATE INDEX "game_badges_badgeType_idx" ON "game_badges"("badgeType");

-- CreateIndex: memories
CREATE INDEX "memories_userId_createdAt_idx" ON "memories"("userId", "createdAt");
CREATE INDEX "memories_userId_deletedAt_idx" ON "memories"("userId", "deletedAt");

-- CreateIndex: scheduled_messages
CREATE INDEX "scheduled_messages_userId_idx" ON "scheduled_messages"("userId");
CREATE INDEX "scheduled_messages_conversationId_idx" ON "scheduled_messages"("conversationId");
CREATE INDEX "scheduled_messages_scheduledFor_status_idx" ON "scheduled_messages"("scheduledFor", "status");

-- CreateIndex: push_subscriptions
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");
CREATE INDEX "push_subscriptions_expiresAt_idx" ON "push_subscriptions"("expiresAt");

-- AddForeignKey: reels
ALTER TABLE "reels" ADD CONSTRAINT "reels_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: reel_likes
ALTER TABLE "reel_likes" ADD CONSTRAINT "reel_likes_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: reel_comments
ALTER TABLE "reel_comments" ADD CONSTRAINT "reel_comments_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: avatars
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: streaks
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: game_badges
ALTER TABLE "game_badges" ADD CONSTRAINT "game_badges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: memories
ALTER TABLE "memories" ADD CONSTRAINT "memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: scheduled_messages
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: push_subscriptions
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
