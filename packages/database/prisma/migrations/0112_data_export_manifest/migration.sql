-- Durable data-export manifests: completed exports keep the inventory manifest
-- they were built with, so the settings page can re-show it in any later
-- session instead of only in the session that ran the build. NULL for exports
-- completed before this column existed (their manifests were never stored).
ALTER TABLE "data_export_requests" ADD COLUMN "manifest" JSONB;
