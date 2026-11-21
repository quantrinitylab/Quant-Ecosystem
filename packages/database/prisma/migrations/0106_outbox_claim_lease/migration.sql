-- QC-F-541 (2026-10-20): outbox claim lease — `PrismaOutboxService.claimBatch`
-- used to run a standalone SELECT ... FOR UPDATE SKIP LOCKED outside any
-- transaction, so the row locks were released the moment the statement
-- finished and two DeliveryWorker instances could claim (and deliver) the
-- SAME event. The claim is now real: claimBatch runs inside an interactive
-- transaction and stamps a lease on every row it returns.
--
-- New columns on "message_outbox":
--   claimedAt      — when the current claim was taken (NULL = never claimed,
--                    or the claim was resolved/released).
--   leaseExpiresAt — when the current claim lapses; a row whose lease is
--                    still in the future is invisible to other workers'
--                    claims, and a row whose lease has expired (claiming
--                    worker crashed before markProcessed/markFailed) becomes
--                    claimable again — at-least-once is preserved.
--
-- Additive and nullable: every existing row reads as "never claimed", which
-- is honest — no claim state existed before this migration. No backfill.
ALTER TABLE "message_outbox" ADD COLUMN "claimedAt" TIMESTAMPTZ;
ALTER TABLE "message_outbox" ADD COLUMN "leaseExpiresAt" TIMESTAMPTZ;

-- Claim hot path: unprocessed rows ordered by (lease state, age). This index
-- is a superset of the old (processedAt, createdAt) drain index, which is
-- dropped so the table keeps exactly one drain index.
DROP INDEX "message_outbox_processedAt_createdAt_idx";
CREATE INDEX "message_outbox_processedAt_leaseExpiresAt_createdAt_idx" ON "message_outbox"("processedAt", "leaseExpiresAt", "createdAt");
