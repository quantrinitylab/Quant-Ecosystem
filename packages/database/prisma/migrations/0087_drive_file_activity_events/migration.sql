-- QM-M39-008: per-file activity/history event log (M39 screen 25).
-- The drive backend appends one row per REAL file action only: upload,
-- rename, move, share change, version restore. Nothing is backfilled — files
-- uploaded before this migration have no fabricated events; the activity view
-- renders an honest empty state for them.
CREATE TABLE "drive_file_activity_events" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "drive_file_activity_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "drive_file_activity_events_fileId_createdAt_idx" ON "drive_file_activity_events"("fileId", "createdAt");
