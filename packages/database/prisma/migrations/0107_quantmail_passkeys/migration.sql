-- fix/qm-passkey-webauthn-r2 (2026-10-26): real passkey/WebAuthn sign-in.
--
-- Before this, QuantMail had no passkey storage at all: the only WebAuthn
-- code was an in-memory service in packages/auth (challenges and
-- credentials in Maps, wiped on restart, never mounted by any QuantMail
-- route) and a mobile capability flag that never ran a ceremony. The login
-- page offered email+password + TOTP only.
--
-- New table:
--   passkey_credentials — one row per registered credential. Only the
--   PUBLIC key is stored (the private key never leaves the authenticator).
--   credentialId is globally unique so one physical credential cannot be
--   registered to two accounts; counter is the authenticator's signature
--   counter at the last accepted assertion (clone/replay detection).
--   Challenges are NOT stored: they ride in signed short-lived JWTs
--   (backend/lib/passkeys.ts).
CREATE TABLE "passkey_credentials" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "counter" INTEGER NOT NULL DEFAULT 0,
  "transports" TEXT[] NOT NULL DEFAULT '{}',
  "name" TEXT,
  "deviceType" TEXT,
  "backedUp" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "passkey_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "passkey_credentials_credentialId_key" ON "passkey_credentials"("credentialId");
CREATE INDEX "passkey_credentials_userId_idx" ON "passkey_credentials"("userId");

ALTER TABLE "passkey_credentials" ADD CONSTRAINT "passkey_credentials_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
