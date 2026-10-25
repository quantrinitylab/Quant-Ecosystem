-- fix/qm-drive-shared-drives-6 (2026-10-24): team-owned Shared Drives, slice 1.
--
-- QuantMail Drive was personal-only: every Folder has one ownerUserId, so no
-- folder could belong to a team. Google Drive's Shared Drives are team-owned
-- with five permission levels and survive member departure. This migration
-- adds only the container + membership tables; no existing rows are touched.
-- The drive itself carries NO owner column — membership rows are the
-- ownership — and createdById is audit-only. The backend enforces the
-- last-manager invariant (a sole manager cannot be demoted or removed
-- before appointing a successor), so a drive can never be orphaned.
--
-- All additive; no existing rows touched.

CREATE TABLE "drive_shared_drives" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "drive_shared_drives_createdById_idx" ON "drive_shared_drives"("createdById");

CREATE TABLE "drive_shared_drive_members" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sharedDriveId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'viewer',
  "addedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "drive_shared_drive_members_sharedDriveId_userId_key" UNIQUE ("sharedDriveId", "userId")
);

CREATE INDEX "drive_shared_drive_members_sharedDriveId_idx" ON "drive_shared_drive_members"("sharedDriveId");
CREATE INDEX "drive_shared_drive_members_userId_idx" ON "drive_shared_drive_members"("userId");
