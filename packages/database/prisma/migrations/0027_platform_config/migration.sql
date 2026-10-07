-- CreateTable: owner-controlled, persisted credit/economy configuration.
-- One row per scope ("global" by default). QuantTrinity is the single writer;
-- PricingEngine / PlanService / OverageService read these durable values.
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "usdPerCredit" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "dailyFreeCredits" INTEGER NOT NULL DEFAULT 100,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "overageEnabledDefault" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_config_scope_key" ON "platform_config"("scope");
