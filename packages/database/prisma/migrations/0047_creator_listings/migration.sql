-- CreateTable: durable creator-marketplace listings (replaces the prior
-- in-memory, per-process listing store so listings survive restarts).
CREATE TABLE "creator_listings" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priceCredits" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_listings_creatorId_idx" ON "creator_listings"("creatorId");
CREATE INDEX "creator_listings_status_idx" ON "creator_listings"("status");
