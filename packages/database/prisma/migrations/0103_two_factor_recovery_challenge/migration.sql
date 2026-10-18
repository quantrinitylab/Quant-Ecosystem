-- fix/qm-2fa-recovery-flow (2026-10-18): the both-factors-lost lockout.
--
-- Password-reset deliberately never clears 2FA (mailbox control is not the
-- second factor, and it issues no session), so a user who loses the
-- authenticator AND the backup codes had no path back in. The recovery
-- channel is the VERIFIED recovery email (migration 0102's lifecycle);
-- no session exists in this flow, so instead of step-up the channel is
-- strongly re-verified at challenge time with a fresh single-use,
-- 15-minute-bounded, attempt-capped code — the same contract as
-- recovery_email_verifications. Consuming the code (plus re-proving the
-- password) is what finally allows disabling the TOTP secret: an explicit,
-- separately-confirmed action, never a side effect of password reset.
--
-- Only the SHA-256 digest of the 6-digit code is stored; a leaked table is
-- not live codes.
CREATE TABLE "two_factor_recovery_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMPTZ,
    "requestedIp" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_recovery_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "two_factor_recovery_challenges_userId_idx" ON "two_factor_recovery_challenges"("userId");
CREATE INDEX "two_factor_recovery_challenges_expiresAt_idx" ON "two_factor_recovery_challenges"("expiresAt");

ALTER TABLE "two_factor_recovery_challenges" ADD CONSTRAINT "two_factor_recovery_challenges_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
