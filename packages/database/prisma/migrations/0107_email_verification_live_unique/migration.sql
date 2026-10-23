-- Close the empty-empty concurrent-issuance race on
-- POST /auth/resend-verification (same class as CODEX-REVIEW 6167000384,
-- corrected for password-reset in migration 0097).
--
-- The resend transaction snapshots live (usedAt IS NULL) codes, burns
-- exactly that snapshot with a compare-and-set ({ id: { in: ids },
-- usedAt: null }), and requires the burned count to match the snapshot
-- size. When the snapshot is EMPTY, two concurrent resends both pass 0===0
-- and both reach the create under READ COMMITTED — the transactional
-- grouping alone does not serialize issuance.
--
-- This partial unique index makes "one live (unused) code per user" a
-- database-enforced invariant instead of an application hope: the second
-- concurrent create blocks on the index until the first commits, then
-- fails with a unique violation (P2002), which the route maps to the
-- RESEND_SUPERSEDED loser path — the same 409 the compare-and-set loser
-- gets, and no email goes out, so no inbox ever receives a code that is
-- already dead.
--
-- Burn-then-create order inside the transaction is safe: the burn sets
-- usedAt (removing the row from the predicate) in the same transaction
-- before the create, so the tx's own writes never self-conflict, and
-- sequential resends keep invalidating the previous code. Spent rows
-- (usedAt set, e.g. by /auth/verify-email) are excluded by the predicate,
-- so the verify flow's single-use bookkeeping is untouched.
--
-- Dedupe first: earlier bursts — including the race itself — may have
-- left more than one unused row per user. Keep the newest (most likely to
-- match a mailed code) so index creation cannot fail on live data. The
-- (createdAt, id) row comparison breaks ties deterministically; id is the
-- PK so a full tie is impossible.
DELETE FROM "email_verification_codes" dup
USING "email_verification_codes" keeper
WHERE dup."userId" = keeper."userId"
  AND dup."usedAt" IS NULL
  AND keeper."usedAt" IS NULL
  AND dup."id" <> keeper."id"
  AND (dup."createdAt", dup."id") < (keeper."createdAt", keeper."id");

-- Enforce one live code per user. Partial, because spent rows must be
-- allowed to accumulate for auditability.
CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_codes_user_live_unique"
  ON "email_verification_codes"("userId")
  WHERE "usedAt" IS NULL;
