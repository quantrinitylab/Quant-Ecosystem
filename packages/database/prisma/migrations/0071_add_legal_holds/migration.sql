-- Migration 0071: Task W33-03 — Enterprise Legal Holds Table
CREATE TABLE IF NOT EXISTS "legal_holds" (
    "id" TEXT NOT NULL,
    "custodian_email" TEXT NOT NULL,
    "matter_name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "placed_by" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,

    CONSTRAINT "legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_holds_custodian_email_idx"
    ON "legal_holds" ("custodian_email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "legal_holds_active_idx"
    ON "legal_holds" ("active");
