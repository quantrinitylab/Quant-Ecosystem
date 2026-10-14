-- QC-F-321: first-contact MESSAGE REQUESTS (consent surface).
--
-- Before this table, a stranger whose whoCanMessage gate verdict was
-- 'denied' (the default 'friends' setting for two brand-new users) hit a
-- 403 dead end: there was nowhere for a first message to wait while the
-- target decided. This table is that waiting place — a row is NOT a
-- Message and belongs to NO conversation. On accept, the backend creates
-- a real DIRECT conversation and delivers firstMessage as its first
-- Message row inside the same transaction; on decline the row stays as
-- the terminal record that makes a re-request impossible.
--
-- No backfill: no request state existed before this migration, so there
-- is nothing honest to migrate. The unique (senderId, targetId) pair is
-- the anti-spam spine — at most one request row per ordered pair, ever.

CREATE TYPE "MessageRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "message_requests" (
  "id" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "firstMessage" TEXT NOT NULL,
  "status" "MessageRequestStatus" NOT NULL DEFAULT 'PENDING',
  "conversationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),

  CONSTRAINT "message_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_requests_senderId_targetId_key" ON "message_requests"("senderId", "targetId");
CREATE INDEX "message_requests_targetId_status_createdAt_idx" ON "message_requests"("targetId", "status", "createdAt");
CREATE INDEX "message_requests_senderId_status_idx" ON "message_requests"("senderId", "status");

ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
