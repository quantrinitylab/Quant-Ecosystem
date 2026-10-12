-- QM-ADMIN-PROVIDERS: admin-controlled AI provider priority/failover order.
-- One row per scope ("global" default). providerOrder is an ordered JSON array
-- of provider ids (validated by the backend against @quant/ai's known ids).
-- Nothing is backfilled: when no row exists the backend falls back to the
-- compiled default order (Meta-first).
CREATE TABLE "ai_provider_settings" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "providerOrder" JSONB NOT NULL DEFAULT '[]',
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_provider_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ai_provider_settings_scope_key" ON "ai_provider_settings"("scope");
