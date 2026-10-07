-- QuantChat Message Delivery & Outbox Migration (W3)
-- Adds two QuantChat-specific tables:
--   * message_outbox      — transactional outbox guaranteeing an at-least-once
--                           delivery intent committed in the same transaction as
--                           a Message (Requirement 7.4).
--   * message_deliveries  — first-class delivery/read receipts replacing the
--                           race-prone Message.metadata JSON (Requirement 10.5).
--
-- NOTE: This is intentionally distinct from the generic data-plane `outbox_events`
-- table (model `OutboxEvent`). `message_outbox` is specific to chat message fan-out.

-- CreateTable: message_outbox (transactional outbox)
CREATE TABLE "message_outbox" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "recipientIds" TEXT[],
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable: message_deliveries (first-class delivery/read receipts)
CREATE TABLE "message_deliveries" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "message_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: message_outbox drain ordering (unprocessed-first, oldest-first)
CREATE INDEX "message_outbox_processedAt_createdAt_idx" ON "message_outbox"("processedAt", "createdAt");

-- CreateIndex: message_deliveries (one row per (messageId, userId) + fast lookup)
CREATE UNIQUE INDEX "message_deliveries_messageId_userId_key" ON "message_deliveries"("messageId", "userId");
CREATE INDEX "message_deliveries_messageId_idx" ON "message_deliveries"("messageId");

-- Backfill: promote existing delivery state out of Message.metadata JSON into
-- first-class message_deliveries rows (Requirement 10.5).
--
-- Source shape (written by the legacy DeliveryService):
--   metadata.deliveries = { "<userId>": { "deliveredAt": "<iso>", "readAt": "<iso>"? }, ... }
--
-- We iterate the per-user delivery object with jsonb_each. A deterministic id
-- (md5 of messageId:userId) plus ON CONFLICT DO NOTHING makes this backfill
-- idempotent and guarantees at most one row per (messageId, userId).
-- Per Requirement 10.4, when a readAt exists without a deliveredAt we set
-- deliveredAt to the readAt value (no later than readAt) via COALESCE.
INSERT INTO "message_deliveries" ("id", "messageId", "userId", "deliveredAt", "readAt")
SELECT
    'mdlv_' || md5(m."id" || ':' || d.key) AS "id",
    m."id" AS "messageId",
    d.key AS "userId",
    COALESCE(
        NULLIF(d.value ->> 'deliveredAt', '')::timestamptz,
        NULLIF(d.value ->> 'readAt', '')::timestamptz
    ) AT TIME ZONE 'UTC' AS "deliveredAt",
    (NULLIF(d.value ->> 'readAt', '')::timestamptz) AT TIME ZONE 'UTC' AS "readAt"
FROM "messages" m
CROSS JOIN LATERAL jsonb_each(m."metadata" -> 'deliveries') AS d(key, value)
WHERE jsonb_typeof(m."metadata" -> 'deliveries') = 'object'
  AND jsonb_typeof(d.value) = 'object'
ON CONFLICT ("messageId", "userId") DO NOTHING;
