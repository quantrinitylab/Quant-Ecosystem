-- PR #940 (real SES email verification): the EmailVerificationCode model was
-- added to schema.prisma without a migration, so this table did not exist and
-- POST /auth/verify-email would fail at runtime. This migration creates it.
--
-- One row per verification code issued at registration. The row stores only
-- the SHA-256 hex digest of the six-digit code (codeHash) — never the plaintext
-- code — so a leaked table is not a set of live verification codes. Codes
-- expire 15 minutes after issuance (expiresAt), are single-use (usedAt is set
-- on first successful verification and the row is then consumed), and are
-- capped at five attempts (attempts) before the code is rejected. requestedIp
-- is recorded for abuse detection. Rows are deleted with the user
-- (ON DELETE CASCADE) so no orphaned codes linger.
CREATE TABLE "email_verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "requestedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "email_verification_codes_userId_idx" ON "email_verification_codes"("userId");
CREATE INDEX "email_verification_codes_expiresAt_idx" ON "email_verification_codes"("expiresAt");
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
