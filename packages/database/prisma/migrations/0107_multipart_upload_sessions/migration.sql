-- CODEX PR #1558 corrective (2026-10-25): durable S3 multipart upload sessions.
--
-- The old multipart flow trusted client-supplied uploadId/key/totalSize at
-- completion and kept quota reservations in a process-local Map, so a
-- restart or a second replica lost ownership and quota state, any caller
-- could complete/abort another user's upload, and a failed inline hash left
-- a permanent empty contentHash. This table is the durable authority for
-- every multipart step: owner + key binding + expiry + status are checked
-- against it before any S3 call, completion is claimed atomically, replays
-- resolve to the same fileId, and the background SHA-256 digest's state
-- (pending | hashing | ready | failed) lives here.
--
-- All additive; no existing rows touched.

CREATE TABLE "drive_multipart_upload_sessions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "uploadId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "totalSize" INTEGER NOT NULL,
  "folderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "hashStatus" TEXT NOT NULL DEFAULT 'pending',
  "contentHash" TEXT,
  "fileId" TEXT,
  "expiresAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "drive_multipart_upload_sessions_uploadId_key" ON "drive_multipart_upload_sessions"("uploadId");
CREATE INDEX "drive_multipart_upload_sessions_userId_status_idx" ON "drive_multipart_upload_sessions"("userId", "status");
CREATE INDEX "drive_multipart_upload_sessions_status_hashStatus_idx" ON "drive_multipart_upload_sessions"("status", "hashStatus");
