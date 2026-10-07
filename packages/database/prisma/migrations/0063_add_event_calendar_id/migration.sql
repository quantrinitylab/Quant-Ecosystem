-- AlterTable: Add calendarId to calendar_events
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "calendarId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "calendar_events_calendarId_idx" ON "calendar_events"("calendarId");

-- Backfill Step (Task C03):
-- 1. Ensure any user with calendar_events has at least one primary calendar in "calendars"
INSERT INTO "calendars" ("id", "userId", "name", "color", "isPrimary", "createdAt", "updatedAt")
SELECT
    'cal_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16),
    u."userId",
    'Primary',
    '#3B82F6',
    true,
    NOW(),
    NOW()
FROM (
    SELECT DISTINCT ce."userId"
    FROM "calendar_events" ce
    LEFT JOIN "calendars" c ON c."userId" = ce."userId" AND c."isPrimary" = true
    WHERE c."id" IS NULL
) u;

-- 2. Backfill existing orphaned calendar_events to the user's primary calendar
UPDATE "calendar_events" ce
SET "calendarId" = c."id"
FROM "calendars" c
WHERE ce."calendarId" IS NULL
  AND c."userId" = ce."userId"
  AND c."isPrimary" = true;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'calendar_events_calendarId_fkey'
  ) THEN
    ALTER TABLE "calendar_events"
    ADD CONSTRAINT "calendar_events_calendarId_fkey"
    FOREIGN KEY ("calendarId") REFERENCES "calendars"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
