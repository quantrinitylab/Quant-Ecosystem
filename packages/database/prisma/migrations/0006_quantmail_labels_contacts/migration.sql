-- QuantMail Labels & Contacts Migration
-- Adds two QuantMail-specific tables backing features that previously had no
-- persistence layer (a latent runtime bug — the services called prisma.label.*
-- and prisma.contact.* against models that did not exist):
--   * labels   — per-user email label metadata (name/color). Email-to-label
--                association is stored as a string-id array on emails.labels.
--   * contacts — per-user contacts directory used by the compose autocomplete
--                and AI contact-context service.
--
-- Note: the CIRun -> CiRun and CIJob -> CiJob model renames are Prisma-client
-- (delegate name) changes only; the @@map table names ("ci_runs", "ci_jobs")
-- are unchanged, so no DDL is required for them.

-- CreateTable: labels
CREATE TABLE "labels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: owner-scoped lookups
CREATE INDEX "labels_userId_idx" ON "labels"("userId");

-- CreateIndex: unique label name per user
CREATE UNIQUE INDEX "labels_userId_name_key" ON "labels"("userId", "name");

-- CreateTable: contacts
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatar" TEXT,
    "frequency" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: owner-scoped lookups
CREATE INDEX "contacts_userId_idx" ON "contacts"("userId");

-- CreateIndex: unique contact email per user
CREATE UNIQUE INDEX "contacts_userId_email_key" ON "contacts"("userId", "email");

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AlterTable: capture the OIDC `nonce` from the authorization request so it can
-- be echoed in the issued id_token (OpenID Connect Core 3.1.2.1). Nullable;
-- existing rows and non-OIDC authorization codes leave it null.
ALTER TABLE "authorization_codes" ADD COLUMN "nonce" TEXT;


-- AlterTable: durable thread preferences. Previously mute/snooze state lived in
-- a per-request in-memory Map (lost immediately because ThreadService is
-- instantiated per request). Persist it on the thread row instead.
ALTER TABLE "email_threads" ADD COLUMN "isMuted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "email_threads" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
