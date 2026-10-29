-- QuantCooks C-2 (2026-10-29): EffectCraft companion render jobs.
--
-- backend/services/craft-render.service.ts persists CRAFT_RENDER jobs (CP-1
-- §5.8) against this table. It is a dedicated sibling in the EditExportJob
-- conventions (migration 0107) — NOT the generalised EditJob table: CP-1
-- §5.1 J1 + §12 step 1 assign EditJob + JobService to the CP-1 unit, the same
-- pattern by which P0-4 landed EditExportJob first and CP-1 generalises
-- later. The columns mirror EditJob's CRAFT_RENDER subset (provider, params,
-- creditCost, output asset reference, attempts) so the fold-in is mechanical.
-- Hand-authored in the repo's generated-migration style (no live database
-- was available when it was written); verify with `prisma migrate deploy`
-- against staging before first use.
--
-- All additive; no existing rows touched.

-- CreateTable
CREATE TABLE "edit_craft_render_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'effectcraft',
    "comp" TEXT,
    "format" TEXT NOT NULL DEFAULT 'h264',
    "resolution" TEXT,
    "quality" TEXT,
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

    CONSTRAINT "edit_craft_render_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edit_craft_render_jobs_projectId_idx" ON "edit_craft_render_jobs"("projectId");

-- CreateIndex
CREATE INDEX "edit_craft_render_jobs_status_idx" ON "edit_craft_render_jobs"("status");

-- CreateIndex
CREATE INDEX "edit_craft_render_jobs_userId_status_idx" ON "edit_craft_render_jobs"("userId", "status");
