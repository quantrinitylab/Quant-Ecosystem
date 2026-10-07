-- ============================================================================
-- 0010_overage_settings
-- ----------------------------------------------------------------------------
-- Per-owner OVERAGE opt-in policy (default OFF). See the OverageSetting model
-- in schema.prisma. Purely additive.
-- ============================================================================

-- CreateTable
CREATE TABLE "overage_settings" (
    "id" TEXT NOT NULL,
    "ownerRef" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'user',
    "tenantId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "monthlyLimitCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overage_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "overage_settings_ownerRef_key" ON "overage_settings"("ownerRef");
CREATE INDEX "overage_settings_ownerRef_idx" ON "overage_settings"("ownerRef");
CREATE INDEX "overage_settings_tenantId_idx" ON "overage_settings"("tenantId");
