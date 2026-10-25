-- PR (fix/qm-consent-jti-replay-r3): cross-instance single-use enforcement for
-- OAuth consent tokens. The consumed-jti set in
-- services/oauth-consent-session.ts was per backend instance; in a
-- multi-replica deploy a token consumed on replica A was not known-consumed
-- on replica B (best-effort replay guarantee). This table is the shared
-- mutex: PrismaConsentTokenStore INSERTs the jti on consume and the
-- PRIMARY KEY(jti) makes the insert atomic across replicas — exactly one
-- replica wins, the other gets a unique violation (replay).
--
-- One row per consumed consent token. expiresAt mirrors the 600s token TTL so
-- the store's lazy sweep can delete expired rows; nothing else is stored
-- (the jti is an opaque 256-bit random value, no user data).
CREATE TABLE "oauth_consent_tokens" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oauth_consent_tokens_pkey" PRIMARY KEY ("jti")
);
CREATE INDEX "oauth_consent_tokens_expiresAt_idx" ON "oauth_consent_tokens"("expiresAt");
