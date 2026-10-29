-- QuantCooks C-3B (2026-10-29): PhotoCraft companion photo-edit jobs.
--
-- backend/services/photo-edit.service.ts persists PHOTO_EDIT jobs (the CP-1
-- job-model pattern of migration 0108) against this table. It is a dedicated
-- sibling in the EditCraftRenderJob conventions (migration 0108) — NOT the
-- generalised EditJob table: CP-1 §5.1 J1 + §12 step 1 assign EditJob +
-- JobService to the CP-1 unit. The columns mirror the CP-1 job subset
-- (provider, params, creditCost, output asset reference, attempts) so the
-- fold-in is mechanical. The job's operations list (each entry validated
-- against the adapter's verified allowlist before any spawn) rides in
-- `params` as { operations: [...] }.
-- Hand-authored in the repo's generated-migration style (no live database
-- was available when it was written); verify with `prisma migrate deploy`
-- against staging before first use.
--
-- All additive; no existing rows touched.

-- CreateTable
CREATE TABLE "edit_photo_edit_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'photocraft',
    "sourceAssetId" TEXT NOT NULL,
    "outputFormat" TEXT NOT NULL DEFAULT 'png',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "params" JSONB NOT NULL DEFAULT '{}',
    "creditCost" INTEGER NOT NULL DEFAULT 0,
    "outputAssetId" TEXT,
    "externalRef" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "edit_photo_edit_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edit_photo_edit_jobs_projectId_idx" ON "edit_photo_edit_jobs"("projectId");

-- CreateIndex
CREATE INDEX "edit_photo_edit_jobs_status_idx" ON "edit_photo_edit_jobs"("status");

-- CreateIndex
CREATE INDEX "edit_photo_edit_jobs_userId_status_idx" ON "edit_photo_edit_jobs"("userId", "status");

-- CreateIndex
CREATE INDEX "edit_photo_edit_jobs_sourceAssetId_idx" ON "edit_photo_edit_jobs"("sourceAssetId");
