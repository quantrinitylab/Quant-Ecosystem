-- CreateTable
CREATE TABLE "video_channel_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_channel_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_channel_subscriptions_userId_idx" ON "video_channel_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "video_channel_subscriptions_channelId_idx" ON "video_channel_subscriptions"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "video_channel_subscriptions_userId_channelId_key" ON "video_channel_subscriptions"("userId", "channelId");
