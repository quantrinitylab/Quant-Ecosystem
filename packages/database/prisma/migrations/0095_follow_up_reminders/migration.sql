-- PR (fix/qm-followup-reminders): the FollowUpReminder model was added to
-- schema.prisma without a migration, so this table did not exist and
-- POST /follow-up-reminders would fail at runtime. This migration creates it.
--
-- One row per follow-up reminder a user sets on a sent thread/email that has
-- no reply yet. A reminder is ACTIVE while dismissedAt is NULL; "due" is
-- remindAt <= now (computed by the caller — the People home resurfaces due
-- rows at the top of the conversation list, Superhuman/Gmail-nudge style).
-- Rows are deleted with the user (ON DELETE CASCADE) so no orphaned
-- reminders linger.
CREATE TABLE "follow_up_reminders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "threadId" TEXT,
    "subject" TEXT,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follow_up_reminders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "follow_up_reminders_userId_idx" ON "follow_up_reminders"("userId");
CREATE INDEX "follow_up_reminders_userId_remindAt_idx" ON "follow_up_reminders"("userId", "remindAt");
ALTER TABLE "follow_up_reminders" ADD CONSTRAINT "follow_up_reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
