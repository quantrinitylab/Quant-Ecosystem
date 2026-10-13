-- QC-F-081 (E2EE one-time prekey pool exhaustion): record WHO claimed each
-- one-time prekey. Before this column existed, any logged-in user could drain
-- a victim's entire one-time prekey pool anonymously — claims were not
-- attributable, so no per-claimer quota could be enforced and a drain left
-- no forensic trace. The claimed rows (claimedBy + claimedAt) now double as
-- the claim ledger: the backend refuses to consume a key once a claimer is
-- over their per-(claimer, owner) quota or the pool is under aggregate
-- claim velocity, and a drain attempt is attributable after the fact.
--
-- Nullable: rows claimed before this migration keep NULL (unknown claimer).
ALTER TABLE "onetime_prekeys" ADD COLUMN "claimedBy" TEXT;
CREATE INDEX "onetime_prekeys_userId_claimedBy_claimedAt_idx" ON "onetime_prekeys"("userId", "claimedBy", "claimedAt");
