-- QuantCooks P0-1 (2026-10-29): real project persistence for QuantEdits.
--
-- backend/routes/projects.ts called `prisma.editProject` but no EditProject
-- model existed in the schema, so every project call threw; the tested
-- ProjectService was in-memory dead code. This migration creates the four
-- tables the route + services persist against: edit_projects (the central
-- entity, soft-deleted via "deletedAt"), edit_layers, edit_assets and
-- edit_export_jobs. Hand-authored in the repo's generated-migration style
-- (no live database was available when it was written); verify with
-- `prisma migrate deploy` against staging before first use.
--
-- All additive; no existing rows touched.

-- CreateTable
CREATE TABLE "edit_projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'video',
    "width" INTEGER NOT NULL DEFAULT 1920,
    "height" INTEGER NOT NULL DEFAULT 1080,
    "fps" INTEGER NOT NULL DEFAULT 30,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timeline" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "edit_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edit_layers" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "opacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "blendMode" TEXT NOT NULL DEFAULT 'normal',
    "startTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "endTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL DEFAULT '{}',
    "transform" JSONB NOT NULL DEFAULT '{}',
    "effects" JSONB NOT NULL DEFAULT '[]',
    "keyframes" JSONB NOT NULL DEFAULT '[]',
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edit_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edit_assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "filename" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edit_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edit_export_jobs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "format" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "outputUrl" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "edit_export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edit_projects_userId_idx" ON "edit_projects"("userId");

-- CreateIndex
CREATE INDEX "edit_projects_userId_deletedAt_idx" ON "edit_projects"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "edit_layers_projectId_idx" ON "edit_layers"("projectId");

-- CreateIndex
CREATE INDEX "edit_layers_projectId_order_idx" ON "edit_layers"("projectId", "order");

-- CreateIndex
CREATE INDEX "edit_assets_projectId_idx" ON "edit_assets"("projectId");

-- CreateIndex
CREATE INDEX "edit_export_jobs_projectId_idx" ON "edit_export_jobs"("projectId");

-- CreateIndex
CREATE INDEX "edit_export_jobs_status_idx" ON "edit_export_jobs"("status");
