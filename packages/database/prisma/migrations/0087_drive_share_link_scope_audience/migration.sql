-- QM-M39-006: link sharing (M39 screen 22) — `drive_share_links` table.
--
-- REPAIR NOTE (2026-10-09): this migration originally contained ONLY two
-- ALTER TABLE statements adding `scope`/`audience`. No migration in the repo
-- ever created the table (only `drive_shares` exists, from 0022), so on
-- staging the first ALTER failed ("table does not exist"), the migration was
-- recorded FAILED in _prisma_migrations, and every later `migrate deploy`
-- dies with P3009 — blocking ALL staging deploys.
--
-- Rewritten to be self-sufficient and idempotent: a single
-- CREATE TABLE IF NOT EXISTS declaring EVERY column the Prisma `DriveShare`
-- model maps to `drive_share_links` (scope/audience included, matching the
-- model defaults), plus the model's unique + index definitions. Applies
-- cleanly on staging (table missing) and on fresh databases alike. The old
-- FAILED row is cleared by `migrate resolve --rolled-back` in the deploy
-- workflow before this runs; IF NOT EXISTS keeps re-runs harmless.
CREATE TABLE IF NOT EXISTS "drive_share_links" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "password" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT NOT NULL DEFAULT 'anyone',
    "audience" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "drive_share_links_token_key" ON "drive_share_links"("token");
CREATE INDEX IF NOT EXISTS "drive_share_links_token_idx" ON "drive_share_links"("token");
CREATE INDEX IF NOT EXISTS "drive_share_links_fileId_idx" ON "drive_share_links"("fileId");
CREATE INDEX IF NOT EXISTS "drive_share_links_createdById_idx" ON "drive_share_links"("createdById");
