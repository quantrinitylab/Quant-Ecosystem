-- Persist auth sessions: reshape "sessions" to back SessionService with Postgres
-- (SSO Phase 0, slice 1 — closes design gap 3.6 / bug 3.7 #6: in-memory sessions
-- did not survive restarts or span instances).

-- token is no longer required (persisted sessions are keyed by id / tokenId).
ALTER TABLE "sessions" ALTER COLUMN "token" DROP NOT NULL;

-- New columns backing AuthSession fields that were previously in-memory only.
ALTER TABLE "sessions" ADD COLUMN "tokenId" TEXT;
ALTER TABLE "sessions" ADD COLUMN "refreshTokenFamily" TEXT;
ALTER TABLE "sessions" ADD COLUMN "app" TEXT;
ALTER TABLE "sessions" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sessions" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Active-session lookups (getUserSessions / getActiveSessionCount) filter on isActive.
CREATE INDEX "sessions_isActive_idx" ON "sessions"("isActive");
