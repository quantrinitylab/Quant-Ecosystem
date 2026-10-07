-- CreateTable: per-owner standing auto-withdraw instruction (default OFF).
CREATE TABLE "auto_withdraw_settings" (
    "id" TEXT NOT NULL,
    "ownerRef" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'user',
    "tenantId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "method" TEXT NOT NULL DEFAULT 'upi',
    "destination" TEXT,
    "minThresholdCredits" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_withdraw_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: durable daily auto-withdraw batch record (one run per UTC day).
CREATE TABLE "withdraw_scheduler_runs" (
    "id" TEXT NOT NULL,
    "utcDay" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "ownersConsidered" INTEGER NOT NULL DEFAULT 0,
    "withdrawn" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "withdraw_scheduler_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_withdraw_settings_ownerRef_key" ON "auto_withdraw_settings"("ownerRef");
CREATE INDEX "auto_withdraw_settings_enabled_idx" ON "auto_withdraw_settings"("enabled");
CREATE INDEX "auto_withdraw_settings_tenantId_idx" ON "auto_withdraw_settings"("tenantId");
CREATE UNIQUE INDEX "withdraw_scheduler_runs_utcDay_key" ON "withdraw_scheduler_runs"("utcDay");
