-- CODEX-REVIEW 6241280732 (war-room #902) corrective on merged PR #1254:
-- the recovery channel's authorization gap.
--
-- #1254 activated a recovery address on session identity alone
-- (PUT /auth/account/recovery-email with only {email} -> 200), and the
-- forgot-password flow then mailed that unverified address a usable reset
-- link. A stolen session — or a typo'd address — could therefore redirect
-- the account's recovery channel without any fresh proof of intent.
--
-- The correction has two parts, both enforced in application code:
--
-- 1. MUTATIONS CROSS THE SENSITIVE-ACTION BOUNDARY: setting, verifying, and
--    clearing the recovery address now require fastify.requireStepUp() —
--    recent strong authentication, not just a live session. A stale session
--    gets an honest 401 STEP_UP_REQUIRED telling the user to sign in again.
--
-- 2. DESTINATION VERIFICATION LIFECYCLE: a new address starts PENDING. Only
--    the SHA-256 digest of a 6-digit code is stored (same contract as
--    email_verification_codes), single-use, 15-minute-bounded, attempt-capped.
--    Consuming the code flips users."recoveryEmailVerifiedAt". The CURRENT
--    recoveryEmail stays active until the pending one verifies, so a typo'd
--    or hostile address can never silently become the channel.
--
-- Legacy rows: every recoveryEmail written by #1254 predates verification,
-- so "recoveryEmailVerifiedAt" is deliberately left NULL for them — the
-- column is nullable and no backfill runs. An unverified legacy address is
-- INERT: password-reset.ts only mails the recovery address when verified,
-- and GET /auth/account/recovery-email reports verified:false so the owner
-- can re-verify it. Grandfathering those rows as "verified" would preserve
-- the exact gap this migration closes.
ALTER TABLE "users" ADD COLUMN "recoveryEmailVerifiedAt" TIMESTAMPTZ;

CREATE TABLE "recovery_email_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMPTZ,
    "requestedIp" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_email_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recovery_email_verifications_userId_idx" ON "recovery_email_verifications"("userId");
CREATE INDEX "recovery_email_verifications_expiresAt_idx" ON "recovery_email_verifications"("expiresAt");

ALTER TABLE "recovery_email_verifications" ADD CONSTRAINT "recovery_email_verifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
