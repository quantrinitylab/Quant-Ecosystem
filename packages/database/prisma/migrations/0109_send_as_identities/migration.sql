-- fix/qm-accounts-import (2026-10-23): send-mail-as identities for the new
-- "Accounts and Import" settings surface (Settings → Account Management).
--
-- Gmail parity gap: QuantMail had no send-as aliases at all. New table:
--   send_as_identities — one row per (user, address). An address starts
--                         UNVERIFIED (verifiedAt NULL): only the SHA-256 digest
--                         of a 6-digit code is stored, single-use,
--                         15-minute-bounded, attempt-capped — the same contract
--                         as recovery_email_verifications. The composer may
--                         stamp the address as From only once verified.
--
-- New table only: no existing rows, no backfill, no fake data.
CREATE TABLE "send_as_identities" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "displayName" TEXT,
  "verifiedAt" TIMESTAMPTZ,
  "codeHash" TEXT,
  "codeExpiresAt" TIMESTAMPTZ,
  "codeAttempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "send_as_identities_pkey" PRIMARY KEY ("id")
);

-- One address per user: re-adding the same address re-verifies the same row
-- instead of minting a duplicate.
CREATE UNIQUE INDEX "send_as_identities_userId_email_key" ON "send_as_identities"("userId", "email");

-- The settings read path lists one user's identities.
CREATE INDEX "send_as_identities_userId_idx" ON "send_as_identities"("userId");

ALTER TABLE "send_as_identities"
  ADD CONSTRAINT "send_as_identities_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
