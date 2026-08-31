-- Working password reset.
--
-- Before this, POST /auth/password-reset returned "reset instructions have been
-- sent" and sent nothing, and /auth/password-reset/confirm answered 501. There
-- was nowhere to record an issued link, so there was nothing a confirm could
-- verify against.
--
-- Only the SHA-256 digest of the mailed token is stored: the row grants the
-- right to take over the account, so a leaked table must not be a set of live
-- reset links. `usedAt` rather than a delete keeps a spent link distinguishable
-- from a forged one and lets the spending UPDATE be scoped to `usedAt IS NULL`,
-- which is what makes "single use" hold under two simultaneous confirms.
--
-- Additive. IF NOT EXISTS throughout so a partially-applied state converges.

-- CreateTable
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_tokenHash_key"
  ON "password_reset_tokens"("tokenHash");
CREATE INDEX IF NOT EXISTS "password_reset_tokens_userId_idx"
  ON "password_reset_tokens"("userId");
-- Sweeping expired rows is a range scan, not a table scan.
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expiresAt_idx"
  ON "password_reset_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "password_reset_tokens"
  DROP CONSTRAINT IF EXISTS "password_reset_tokens_userId_fkey";
ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
