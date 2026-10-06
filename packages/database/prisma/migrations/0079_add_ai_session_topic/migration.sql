-- Side chats (Muse parity): nullable topic label on AI sessions so users can
-- organize conversations by topic. Additive only — existing rows keep topic NULL
-- (shown as "Main chats"). No backfill: NULL is a valid state, not missing data.
ALTER TABLE "ai_sessions" ADD COLUMN "topic" TEXT;

CREATE INDEX "ai_sessions_userId_topic_idx" ON "ai_sessions"("userId", "topic");
