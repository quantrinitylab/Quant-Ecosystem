-- QuantCooks CP-1 (2026-10-29): the ONE unified async job model (spec §5).
--
-- backend/tools/jobs.ts (JobService) is the writer for registry-created jobs;
-- the pre-CP-1 job services (ExportService over EditExportJob, C-2's
-- CraftRenderService over EditCraftRenderJob, C-3B's PhotoEditService over
-- EditPhotoEditJob) keep their public shapes and tests, and their persistence
-- folds onto this table through per-kind delegate adapters
-- (backend/services/job-delegate-adapters.ts) that activate in the route /
-- server wiring when this delegate exists. The three legacy tables receive
-- no new writes once the adapters are active and remain readable for
-- history (CP-1 §5.1 J1).
--
-- Conventions mirror EditExportJob (0107) / EditCraftRenderJob (0108):
-- cuid id, plain indexed String refs, no Prisma relations, status as String
-- with an enumerated comment, Json defaults. `outputs` holds asset
-- REFERENCES, never URLs (signed URLs are minted per read, P0-3's rule
-- generalised); `result` holds non-asset outcomes.
-- Hand-authored in the repo's generated-migration style (no live database
-- was available when it was written); verify with `prisma migrate deploy`
-- against staging before first use.
--
-- All additive; no existing rows touched.

-- CreateTable
CREATE TABLE "edit_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "provider" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "params" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT NOT NULL,
    "quoteId" TEXT,
    "creditCost" INTEGER NOT NULL DEFAULT 0,
    "reservationKey" TEXT,
    "outputs" JSONB NOT NULL DEFAULT '[]',
    "result" JSONB,
    "error" TEXT,
    "parentJobId" TEXT,
    "externalRef" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "edit_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edit_jobs_userId_status_idx" ON "edit_jobs"("userId", "status");

-- CreateIndex
CREATE INDEX "edit_jobs_status_createdAt_idx" ON "edit_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "edit_jobs_projectId_idx" ON "edit_jobs"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "edit_jobs_userId_idempotencyKey_key" ON "edit_jobs"("userId", "idempotencyKey");
