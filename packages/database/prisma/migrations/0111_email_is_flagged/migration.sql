-- S1 Flag: per-message, Outlook-style flag. Independent of isStarred, isPinned, isImportant.
-- Expand-only and safe to re-run. IF NOT EXISTS makes a second run a no-op. NOT NULL DEFAULT false
-- is a constant default: on PostgreSQL 11+ a catalog-only change, no rewrite, no scan, no backfill.
-- No index and no flaggedAt: the Flagged filter is client-side and nothing reads either.
-- Lock: ADD COLUMN takes ACCESS EXCLUSIVE on "emails" for the instant of the catalog change.
-- lock_timeout bounds how long it may queue behind a long transaction.
-- If the ALTER cannot get its lock within 3s it fails and rolls back; nothing is applied.
-- Prisma then records 0111_email_is_flagged as failed and every later `migrate deploy` stops with P3009 until:
--   prisma migrate resolve --rolled-back 0111_email_is_flagged --schema=packages/database/prisma/schema.prisma
-- is run against the same DATABASE_URL (OCI: on vm-app, in the backend image; staging: an in-cluster Job). Then redeploy.
-- Rollback: leave the column. The previous app version ignores it. Dropping it is a separate,
-- deliberate contract-phase migration.
SET LOCAL lock_timeout = '3s';
ALTER TABLE "emails" ADD COLUMN IF NOT EXISTS "isFlagged" BOOLEAN NOT NULL DEFAULT false;
