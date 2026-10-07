-- Migration 0068: Gate 4 — Email Suppressions (Hard-Block Bounce & Complaint Protection)
CREATE TABLE IF NOT EXISTS "email_suppressions" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "email_suppressions_email_key"
    ON "email_suppressions" ("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_suppressions_email_idx"
    ON "email_suppressions" ("email");
