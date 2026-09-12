-- ADR-CH-001: revocable, expiring Personal Access Tokens for Git Smart HTTP.
-- Only a SHA-256 digest of the complete qcp_<tokenId>_<secret> credential is stored.

CREATE TABLE IF NOT EXISTS "personal_access_tokens" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "personal_access_tokens_tokenId_key"
  ON "personal_access_tokens"("tokenId");

CREATE INDEX IF NOT EXISTS "personal_access_tokens_userId_idx"
  ON "personal_access_tokens"("userId");

CREATE INDEX IF NOT EXISTS "personal_access_tokens_expiresAt_idx"
  ON "personal_access_tokens"("expiresAt");

ALTER TABLE "personal_access_tokens"
  DROP CONSTRAINT IF EXISTS "personal_access_tokens_userId_fkey";

ALTER TABLE "personal_access_tokens"
  ADD CONSTRAINT "personal_access_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
