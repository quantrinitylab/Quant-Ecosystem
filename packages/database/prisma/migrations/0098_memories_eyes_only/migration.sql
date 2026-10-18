-- QC-F-450: 'My Eyes Only' — passcode-locked private Memories section.
--
-- Until now the Memories vault was one open list: the Memory model had no
-- privacy flag, no lock/unlock/move endpoint existed, and serializeMemory
-- handed every item's mediaUrl to any authenticated response. This migration
-- creates the storage for the closed Slice-1 design:
--
--   1. memories.isPrivate — row-level vault membership. DEFAULT false is
--      honest: no existing item becomes private on its own; an item enters
--      the vault only by the user's explicit move-to-private.
--   2. memories_vault_credentials — one row per user holding ONLY the
--      argon2id PHC hash of the vault passcode (plaintext is never stored)
--      plus the persistent failed-attempt counter and lockout timestamp
--      shared by verify/change/reset (5 strikes -> 15 minute lockout).
--   3. memories_vault_unlocks — short-lived (5 minute) opaque unlock
--      tokens, stored as SHA-256 hex only (hash-at-rest, PAT precedent).
--      Deleting a row revokes instantly; verify issues exactly one live
--      token per user by deleting prior rows first.
--
-- No backfill: existing memories stay public (isPrivate=false), and no user
-- has a passcode until they set one.

ALTER TABLE "memories" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "memories_userId_isPrivate_idx" ON "memories"("userId", "isPrivate");

CREATE TABLE "memories_vault_credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passcodeHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memories_vault_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "memories_vault_credentials_userId_key" ON "memories_vault_credentials"("userId");

CREATE INDEX "memories_vault_credentials_userId_idx" ON "memories_vault_credentials"("userId");

ALTER TABLE "memories_vault_credentials" ADD CONSTRAINT "memories_vault_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "memories_vault_unlocks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memories_vault_unlocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "memories_vault_unlocks_tokenHash_key" ON "memories_vault_unlocks"("tokenHash");

CREATE INDEX "memories_vault_unlocks_userId_idx" ON "memories_vault_unlocks"("userId");

CREATE INDEX "memories_vault_unlocks_expiresAt_idx" ON "memories_vault_unlocks"("expiresAt");

ALTER TABLE "memories_vault_unlocks" ADD CONSTRAINT "memories_vault_unlocks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
