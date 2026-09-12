-- ============================================================================
-- 0061_quantapp_rebrand_backfill
-- ----------------------------------------------------------------------------
-- Wave E rebrand backfill: Updates persisted QuantApp values across tables
-- (notifications, etc.) from legacy names to authoritative unified app names:
--   quantsync  -> quantwave
--   quantneon  -> quantgram
--   quantedits -> quantcooks
--   quantmeet  -> quantchat
--   quantdocs, quantdrive, quantcalendar -> quantmail
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'sourceApp'
  ) THEN
    UPDATE "notifications" SET "sourceApp" = 'quantwave' WHERE "sourceApp" = 'quantsync';
    UPDATE "notifications" SET "sourceApp" = 'quantgram' WHERE "sourceApp" = 'quantneon';
    UPDATE "notifications" SET "sourceApp" = 'quantcooks' WHERE "sourceApp" = 'quantedits';
    UPDATE "notifications" SET "sourceApp" = 'quantchat' WHERE "sourceApp" = 'quantmeet';
    UPDATE "notifications" SET "sourceApp" = 'quantmail' WHERE "sourceApp" IN ('quantdrive', 'quantdocs', 'quantcalendar');
  END IF;
END $$;
