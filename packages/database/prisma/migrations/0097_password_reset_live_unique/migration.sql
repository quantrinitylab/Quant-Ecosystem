-- CODEX-REVIEW 6167000384 corrective on merged PR #1151: close the
-- empty-empty concurrent-issuance race on POST /auth/password-reset.
--
-- The request transaction snapshots live (usedAt IS NULL) tokens, burns
-- exactly that snapshot with a compare-and-set ({ id: { in: ids },
-- usedAt: null }), and requires the deleted count to match the snapshot
-- size. When the snapshot is EMPTY, two concurrent requests both pass
-- 0===0 and both create+send separate tokens under READ COMMITTED — the
-- transactional grouping alone does not serialize issuance.
--
-- This partial unique index makes "one live (unused) token per user" a
-- database-enforced invariant instead of an application hope: the second
-- concurrent create blocks on the index until the first commits, then
-- fails with a unique violation (P2002), which the route maps to the
-- superseded-loser path — the same non-committal 200, and no email goes
-- out, so no inbox ever receives a link that is already dead.
--
-- Expired-but-unused rows can never collide: the burn deletes every
-- usedAt IS NULL row for the user inside the same transaction before the
-- create. Spent rows (usedAt set) are excluded by the predicate, so the
-- confirm flow's single-use bookkeeping is untouched.
--
-- Dedupe first: earlier bursts — including the race itself, and the old
-- pre-#1151 pile-up the burn comment describes — may have left more than
-- one unused row per user. Keep the newest (most likely to match a mailed
-- link) so index creation cannot fail on live data. The (createdAt, id)
-- row comparison breaks ties deterministically; id is the PK so a full
-- tie is impossible.
DELETE FROM "password_reset_tokens" dup
USING "password_reset_tokens" keeper
WHERE dup."userId" = keeper."userId"
  AND dup."usedAt" IS NULL
  AND keeper."usedAt" IS NULL
  AND dup."id" <> keeper."id"
  AND (dup."createdAt", dup."id") < (keeper."createdAt", keeper."id");

-- Enforce one live token per user. Partial, because spent rows must be
-- allowed to accumulate for auditability.
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_user_live_unique"
  ON "password_reset_tokens"("userId")
  WHERE "usedAt" IS NULL;
