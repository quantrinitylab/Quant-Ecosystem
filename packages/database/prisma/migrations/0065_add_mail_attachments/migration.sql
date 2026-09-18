-- CreateTable
CREATE TABLE IF NOT EXISTS "mail_attachments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_id" TEXT,
    "filename" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "declared_size" INTEGER NOT NULL,
    "stored_size" INTEGER,
    "storage_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_at" TIMESTAMP(3),

    CONSTRAINT "mail_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "mail_attachments_storage_key_key"
    ON "mail_attachments" ("storage_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mail_attachments_user_id_created_at_idx"
    ON "mail_attachments" ("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mail_attachments_email_id_idx"
    ON "mail_attachments" ("email_id");
