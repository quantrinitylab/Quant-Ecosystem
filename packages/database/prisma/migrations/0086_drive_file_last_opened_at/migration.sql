-- QM-M39-002: honest "opened at" tracking for the Drive Recent view (M39 screen 6).
-- Adds a nullable `lastOpenedAt` to drive_files. Existing rows stay NULL (=
-- never opened) and the Recent view falls back to `updatedAt` ordering for them.
-- The column is written only by explicit open/preview/download actions through
-- a raw UPDATE that never touches `updatedAt`, so "modified" stays honest.
ALTER TABLE "drive_files" ADD COLUMN "lastOpenedAt" TIMESTAMP(3);
CREATE INDEX "drive_files_userId_lastOpenedAt_idx" ON "drive_files"("userId", "lastOpenedAt");
