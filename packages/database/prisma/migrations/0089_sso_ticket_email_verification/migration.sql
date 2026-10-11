-- SSO handoff tickets (replaces ?token= URL handoffs) + email verification tokens.
-- Both are single-use, digest-only, short-lived. Rows cascade with the user.

CREATE TABLE "sso_tickets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "ticketHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sso_tickets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sso_tickets_ticketHash_key" ON "sso_tickets"("ticketHash");
CREATE INDEX "sso_tickets_userId_idx" ON "sso_tickets"("userId");
CREATE INDEX "sso_tickets_expiresAt_idx" ON "sso_tickets"("expiresAt");

CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");
CREATE INDEX "email_verification_tokens_expiresAt_idx" ON "email_verification_tokens"("expiresAt");
