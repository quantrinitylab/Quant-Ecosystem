-- QM-BACK-002: optimistic concurrency for mail/thread mutations.
-- Adds a monotonically-increasing `version` column to Email and EmailThread.
-- Every guarded mutation does an atomic conditional update
-- (WHERE id AND version = :expected) and increments the column, so two
-- concurrent writers can never silently overwrite each other: the loser gets
-- a VERSION_CONFLICT (409) with expected/current versions for recovery.
-- Existing rows start at 0; unguarded callers are unaffected.
ALTER TABLE "emails" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "email_threads" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
