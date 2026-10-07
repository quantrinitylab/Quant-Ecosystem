-- CreateTable: durable buyer ownership record for a creator-marketplace
-- purchase. Written idempotently (unique purchaseId matches the ledger
-- purchaseId) after the money settles, so retries reconcile to one entitlement.
CREATE TABLE "creator_purchases" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "priceCredits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creator_purchases_purchaseId_key" ON "creator_purchases"("purchaseId");
CREATE INDEX "creator_purchases_buyerId_idx" ON "creator_purchases"("buyerId");
CREATE INDEX "creator_purchases_listingId_idx" ON "creator_purchases"("listingId");
