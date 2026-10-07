-- Mail-and-thread in one conversation: record how each message was written, and
-- give every sent message a position on the inbox timeline.
--
-- Two changes, both required for a message you send to show up in your own inbox
-- next to the conversation it belongs to:
--
--   1. `messageKind` distinguishes a full letter from a line typed into the
--      thread. It has to be stored, not inferred: the only inferable signals are
--      body length and the presence of an HTML part, and a one-line letter and a
--      long chat message both defeat those.
--
--   2. `receivedAt` was left NULL on every message the sender sent, because the
--      send path set `sentAt` only. The inbox list is `ORDER BY "receivedAt" DESC
--      LIMIT 50`, so those rows had no timeline position at all and were either
--      jammed ahead of real mail or pushed past the first page. The backfill
--      gives historical sent mail the timestamp it should always have had, and
--      `EmailService.send` now sets it going forward.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmailMessageKind') THEN
    CREATE TYPE "EmailMessageKind" AS ENUM ('MAIL', 'CHAT');
  END IF;
END
$$;

-- AlterTable: existing rows are all letters, which is what the default records.
ALTER TABLE "emails"
  ADD COLUMN IF NOT EXISTS "messageKind" "EmailMessageKind" NOT NULL DEFAULT 'MAIL';

-- Backfill the missing timeline positions. A draft has not entered any timeline,
-- so it keeps its NULL; everything else falls back to when it was sent and then
-- to when the row was created.
UPDATE "emails"
   SET "receivedAt" = COALESCE("sentAt", "createdAt")
 WHERE "receivedAt" IS NULL
   AND "isDraft" = false;

-- The list query pages with `ORDER BY "receivedAt" DESC, "createdAt" DESC`; the
-- composite index keeps that ordering an index scan rather than a sort, and makes
-- the page window deterministic when two messages share a timestamp.
CREATE INDEX IF NOT EXISTS "emails_receivedAt_createdAt_idx"
  ON "emails" ("receivedAt" DESC, "createdAt" DESC);
