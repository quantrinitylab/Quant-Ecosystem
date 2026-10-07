-- CreateTable: durable per-click record for QuantAds click-fraud accounting.
-- Only clicks with billable = true charge the advertiser / count toward
-- publisher payouts. ipHash is a salted hash, never a raw IP.
CREATE TABLE "ad_click_events" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "campaignId" TEXT,
    "userId" TEXT NOT NULL,
    "ipHash" TEXT,
    "deviceFp" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "fraudFlag" BOOLEAN NOT NULL DEFAULT false,
    "fraudReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_click_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_click_events_adId_idx" ON "ad_click_events"("adId");
CREATE INDEX "ad_click_events_userId_createdAt_idx" ON "ad_click_events"("userId", "createdAt");
CREATE INDEX "ad_click_events_ipHash_createdAt_idx" ON "ad_click_events"("ipHash", "createdAt");
