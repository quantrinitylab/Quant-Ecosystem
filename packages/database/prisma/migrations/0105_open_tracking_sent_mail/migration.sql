-- fix/qm-composer-open-tracking (2026-10-20): per-message open tracking for
-- sent mail (Superhuman-class read statuses).
--
-- The existing readAt/deliveredAt columns are the internal WhatsApp-style
-- read-receipt pipeline: readAt is stamped on the sender's sent copy when a
-- QuantMail recipient opens the thread (ThreadService.markThreadRead). It
-- never fires for external recipients (Gmail, Outlook, ...), who never touch
-- our thread view — that is the gap this closes.
--
-- New columns on "emails":
--   openTrackingEnabled — per-message opt-out the composer sets (default on).
--   openToken           — unguessable beacon id, minted at send time, embedded
--                         in the OUTBOUND mime only (never the stored bodyHtml,
--                         so the sender's own views can never self-trigger).
--   openCount           — beacon image loads counted by GET /track/open/:token.
--   firstOpenedAt / lastOpenedAt — first/last counted load.
--
-- Additive and nullable/zero-defaulted: every existing row reads as
-- "tracking off, never opened", which is honest — tracking did not exist when
-- they were sent. No backfill: inventing open events for old mail would be
-- fake data.
ALTER TABLE "emails" ADD COLUMN "openTrackingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "emails" ADD COLUMN "openToken" TEXT;
ALTER TABLE "emails" ADD COLUMN "openCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "emails" ADD COLUMN "firstOpenedAt" TIMESTAMPTZ;
ALTER TABLE "emails" ADD COLUMN "lastOpenedAt" TIMESTAMPTZ;

-- Token lookup is the beacon hot path (one indexed findUnique per image load).
CREATE UNIQUE INDEX "emails_openToken_key" ON "emails"("openToken");
