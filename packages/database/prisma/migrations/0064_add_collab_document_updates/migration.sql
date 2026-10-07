-- CreateTable
CREATE TABLE IF NOT EXISTS "collab_document_updates" (
    "id" TEXT NOT NULL,
    "doc_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "update_binary" BYTEA NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collab_document_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "collab_document_updates_doc_id_version_key"
    ON "collab_document_updates" ("doc_id", "version");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "collab_document_updates_doc_id_created_at_idx"
    ON "collab_document_updates" ("doc_id", "created_at");
