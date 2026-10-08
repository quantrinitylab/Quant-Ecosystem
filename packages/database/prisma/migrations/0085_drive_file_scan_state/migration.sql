-- QM-M39-009: per-file security scan state surface (M39 screen 29).
-- Adds scanStatus / scanReason / scannedAt to drive_files so every file
-- carries a scan-job state: pending | scanning | clean | quarantined | unknown.
--
-- No real malware scanner is wired into the ecosystem yet. The honest state
-- for every existing row is therefore 'unknown' — never claim clean. When a
-- scanner is built, it plugs in through
-- apps/quantmail/backend/services/file-scan.service.ts and moves rows through
-- pending -> scanning -> clean/quarantined.
ALTER TABLE "drive_files" ADD COLUMN "scanStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "drive_files" ADD COLUMN "scanReason" TEXT;
ALTER TABLE "drive_files" ADD COLUMN "scannedAt" TIMESTAMP(3);
