-- ============================================================================
-- 0005a_oauth_server_tables
-- ----------------------------------------------------------------------------
-- Creates the OAuth2/OIDC Authorization Server tables that QuantMail's auth
-- server (apps/quantmail/backend/routes/oauth.ts) and schema.prisma rely on:
--   oauth_clients, authorization_codes, oauth_consents
--
-- These models exist in schema.prisma and are used at runtime, but NO prior
-- migration ever created them — yet 0006_quantmail_labels_contacts runs
-- `ALTER TABLE "authorization_codes" ADD COLUMN "nonce"`, which fails on a fresh
-- database. This migration is intentionally ordered BETWEEN 0005 and 0006
-- (lexicographically "0005a" sorts after "0005_" and before "0006_") so the
-- tables exist before 0006 alters authorization_codes.
--
-- `authorization_codes` is created WITHOUT the `nonce` column on purpose — 0006
-- adds it. Statements are idempotent (IF NOT EXISTS + guarded constraint DO
-- blocks) so this is also safe on databases that were bootstrapped via
-- `prisma db push` and already have these tables.
-- ============================================================================

-- CreateTable: oauth_clients
CREATE TABLE IF NOT EXISTS "oauth_clients" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "redirectUris" TEXT[],
    "allowedScopes" TEXT[],
    "isConfidential" BOOLEAN NOT NULL DEFAULT true,
    "isFirstParty" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_clients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_clients_clientId_key" ON "oauth_clients"("clientId");
CREATE INDEX IF NOT EXISTS "oauth_clients_clientId_idx" ON "oauth_clients"("clientId");
CREATE INDEX IF NOT EXISTS "oauth_clients_ownerId_idx" ON "oauth_clients"("ownerId");

-- CreateTable: authorization_codes (nonce is added later by 0006)
CREATE TABLE IF NOT EXISTS "authorization_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT[],
    "codeChallenge" TEXT,
    "codeChallengeMethod" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authorization_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "authorization_codes_code_key" ON "authorization_codes"("code");
CREATE INDEX IF NOT EXISTS "authorization_codes_code_idx" ON "authorization_codes"("code");
CREATE INDEX IF NOT EXISTS "authorization_codes_userId_idx" ON "authorization_codes"("userId");

-- CreateTable: oauth_consents
CREATE TABLE IF NOT EXISTS "oauth_consents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauth_consents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "oauth_consents_userId_clientId_key" ON "oauth_consents"("userId", "clientId");
CREATE INDEX IF NOT EXISTS "oauth_consents_userId_idx" ON "oauth_consents"("userId");
CREATE INDEX IF NOT EXISTS "oauth_consents_clientId_idx" ON "oauth_consents"("clientId");

-- AddForeignKey: oauth_clients.ownerId -> users.id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oauth_clients_ownerId_fkey'
  ) THEN
    ALTER TABLE "oauth_clients"
      ADD CONSTRAINT "oauth_clients_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: authorization_codes.userId -> users.id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'authorization_codes_userId_fkey'
  ) THEN
    ALTER TABLE "authorization_codes"
      ADD CONSTRAINT "authorization_codes_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey: oauth_consents.userId -> users.id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oauth_consents_userId_fkey'
  ) THEN
    ALTER TABLE "oauth_consents"
      ADD CONSTRAINT "oauth_consents_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
