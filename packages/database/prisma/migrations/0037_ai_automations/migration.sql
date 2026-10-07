-- CreateTable: QuantAI automations. The `/automations` API previously had no
-- backend persistence; this durable table stores each user's automation
-- (trigger + ordered actions + conditions) as JSON documents matching the
-- frontend Automation contract.
CREATE TABLE "ai_automations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "trigger" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "executionCount" INTEGER NOT NULL DEFAULT 0,
    "lastExecutedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: durable execution records for automation runs. Each run keeps
-- per-step checkpoints so an interrupted run can be inspected/resumed.
CREATE TABLE "ai_automation_runs" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "checkpoints" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ai_automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_automations_userId_idx" ON "ai_automations"("userId");
CREATE INDEX "ai_automations_userId_isActive_idx" ON "ai_automations"("userId", "isActive");
CREATE INDEX "ai_automation_runs_automationId_idx" ON "ai_automation_runs"("automationId");
CREATE INDEX "ai_automation_runs_userId_idx" ON "ai_automation_runs"("userId");
