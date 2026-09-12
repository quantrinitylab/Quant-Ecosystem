-- ============================================================================
-- 0061_quantapp_rebrand_backfill
-- ----------------------------------------------------------------------------
-- Wave E rebrand backfill: Updates persisted QuantApp values across tables
-- (notifications, ai_sessions, user_presences, app_grants, memory_items, etc.)
-- from legacy names to authoritative unified app names:
--   quantsync  -> quantwave
--   quantneon  -> quantgram
--   quantedits -> quantcooks
--   quantmeet  -> quantchat
--   quantdocs, quantdrive, quantcalendar -> quantmail
-- ============================================================================

DO $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- 1. notifications.sourceApp
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notifications' AND column_name = 'sourceApp'
  ) THEN
    UPDATE "notifications" SET "sourceApp" = 'quantwave' WHERE "sourceApp" = 'quantsync';
    UPDATE "notifications" SET "sourceApp" = 'quantgram' WHERE "sourceApp" = 'quantneon';
    UPDATE "notifications" SET "sourceApp" = 'quantcooks' WHERE "sourceApp" = 'quantedits';
    UPDATE "notifications" SET "sourceApp" = 'quantchat' WHERE "sourceApp" = 'quantmeet';
    UPDATE "notifications" SET "sourceApp" = 'quantmail' WHERE "sourceApp" IN ('quantdrive', 'quantdocs', 'quantcalendar');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled notifications.sourceApp (rows updated: %)', v_count;
  ELSE
    RAISE NOTICE 'Table notifications or column sourceApp not found, skipping notifications backfill';
  END IF;

  -- 2. ai_sessions.sourceApp
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_sessions' AND column_name = 'sourceApp'
  ) THEN
    UPDATE "ai_sessions" SET "sourceApp" = 'quantwave' WHERE "sourceApp" = 'quantsync';
    UPDATE "ai_sessions" SET "sourceApp" = 'quantgram' WHERE "sourceApp" = 'quantneon';
    UPDATE "ai_sessions" SET "sourceApp" = 'quantcooks' WHERE "sourceApp" = 'quantedits';
    UPDATE "ai_sessions" SET "sourceApp" = 'quantchat' WHERE "sourceApp" = 'quantmeet';
    UPDATE "ai_sessions" SET "sourceApp" = 'quantmail' WHERE "sourceApp" IN ('quantdrive', 'quantdocs', 'quantcalendar');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled ai_sessions.sourceApp (rows updated: %)', v_count;
  ELSE
    RAISE NOTICE 'Table ai_sessions or column sourceApp not found, skipping ai_sessions backfill';
  END IF;

  -- 3. user_presences.activeApp
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_presences' AND column_name = 'activeApp'
  ) THEN
    UPDATE "user_presences" SET "activeApp" = 'quantwave' WHERE "activeApp" = 'quantsync';
    UPDATE "user_presences" SET "activeApp" = 'quantgram' WHERE "activeApp" = 'quantneon';
    UPDATE "user_presences" SET "activeApp" = 'quantcooks' WHERE "activeApp" = 'quantedits';
    UPDATE "user_presences" SET "activeApp" = 'quantchat' WHERE "activeApp" = 'quantmeet';
    UPDATE "user_presences" SET "activeApp" = 'quantmail' WHERE "activeApp" IN ('quantdrive', 'quantdocs', 'quantcalendar');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled user_presences.activeApp (rows updated: %)', v_count;
  END IF;

  -- 4. app_grants.appId
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'app_grants' AND column_name = 'appId'
  ) THEN
    UPDATE "app_grants" SET "appId" = 'quantwave' WHERE "appId" = 'quantsync';
    UPDATE "app_grants" SET "appId" = 'quantgram' WHERE "appId" = 'quantneon';
    UPDATE "app_grants" SET "appId" = 'quantcooks' WHERE "appId" = 'quantedits';
    UPDATE "app_grants" SET "appId" = 'quantchat' WHERE "appId" = 'quantmeet';
    UPDATE "app_grants" SET "appId" = 'quantmail' WHERE "appId" IN ('quantdrive', 'quantdocs', 'quantcalendar');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled app_grants.appId (rows updated: %)', v_count;
  END IF;

  -- 5. memory_items.appSource
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memory_items' AND column_name = 'appSource'
  ) THEN
    UPDATE "memory_items" SET "appSource" = 'quantwave' WHERE "appSource" = 'quantsync';
    UPDATE "memory_items" SET "appSource" = 'quantgram' WHERE "appSource" = 'quantneon';
    UPDATE "memory_items" SET "appSource" = 'quantcooks' WHERE "appSource" = 'quantedits';
    UPDATE "memory_items" SET "appSource" = 'quantchat' WHERE "appSource" = 'quantmeet';
    UPDATE "memory_items" SET "appSource" = 'quantmail' WHERE "appSource" IN ('quantdrive', 'quantdocs', 'quantcalendar');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled memory_items.appSource (rows updated: %)', v_count;
  END IF;
END $$;
