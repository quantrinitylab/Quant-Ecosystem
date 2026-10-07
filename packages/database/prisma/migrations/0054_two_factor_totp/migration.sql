-- Real TOTP two-factor authentication.
--
-- Before this, /auth/2fa/enable's entire verification was a /^\d{6}$/ regex and
-- the generated secret was never stored, so "2FA enabled" meant a boolean flag
-- and nothing else. These columns are what makes verification possible:
--   twoFactorPendingSecret  the secret shown at setup, held until a code proves
--                           the authenticator actually has it
--   twoFactorConfirmedAt    when the second factor became real
--   twoFactorLastUsedStep   the 30s TOTP step of the last accepted code (+1), so
--                           a captured code cannot be replayed inside its window
--
-- All additive. IF NOT EXISTS throughout so a partially-applied state converges.

-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorPendingSecret" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorConfirmedAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorLastUsedStep" INTEGER;

-- CreateTable
CREATE TABLE IF NOT EXISTS "two_factor_backup_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_backup_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "two_factor_backup_codes_userId_codeHash_key"
  ON "two_factor_backup_codes"("userId", "codeHash");
CREATE INDEX IF NOT EXISTS "two_factor_backup_codes_userId_idx"
  ON "two_factor_backup_codes"("userId");

-- AddForeignKey
ALTER TABLE "two_factor_backup_codes"
  DROP CONSTRAINT IF EXISTS "two_factor_backup_codes_userId_fkey";
ALTER TABLE "two_factor_backup_codes"
  ADD CONSTRAINT "two_factor_backup_codes_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Anyone flagged as 2FA-enabled by the old format-only endpoint has no secret to
-- verify against. Leaving the flag set would lock them out of a challenge they
-- can never answer, so the flag is cleared and they are asked to enrol for real.
UPDATE "users"
  SET "twoFactorEnabled" = false
  WHERE "twoFactorEnabled" = true AND "twoFactorSecret" IS NULL;
