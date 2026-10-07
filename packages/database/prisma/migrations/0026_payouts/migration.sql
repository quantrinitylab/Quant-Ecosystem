-- CreateTable: creator/owner withdrawals of EARNED credits to an external rail
-- (UPI / crypto / bank). Withdrawals never overdraw — the request debits the
-- credit ledger (actionKey "payout:{id}") in the same transaction that inserts
-- the pending row; a terminal rail failure appends a compensating credit.
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "ownerRef" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'user',
    "tenantId" TEXT,
    "amountCredits" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "destination" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providerRef" TEXT,
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payouts_ownerRef_status_idx" ON "payouts"("ownerRef", "status");
CREATE INDEX "payouts_tenantId_idx" ON "payouts"("tenantId");
