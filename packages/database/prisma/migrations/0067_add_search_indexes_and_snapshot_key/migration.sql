-- Migration 0067: Gate 3 — GIN Trigram & to_tsvector Full-Text Search Indexes & QuantDocs Snapshot Key
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add snapshot_storage_key column to documents for R2/S3 snapshot offload
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "snapshot_storage_key" TEXT;

-- GIN Full-Text Index on emails (subject + bodyPlain + fromAddress)
CREATE INDEX IF NOT EXISTS "emails_fts_idx" ON "emails" USING GIN (
    to_tsvector('english', coalesce("subject", '') || ' ' || coalesce("bodyPlain", '') || ' ' || coalesce("fromAddress", ''))
);

-- GIN Trigram Index on mail_attachments.filename for substring matching
CREATE INDEX IF NOT EXISTS "mail_attachments_filename_trgm_idx" ON "mail_attachments" USING GIN (
    "filename" gin_trgm_ops
);

-- GIN Trigram Index on drive_files.name for substring matching
CREATE INDEX IF NOT EXISTS "drive_files_name_trgm_idx" ON "drive_files" USING GIN (
    "name" gin_trgm_ops
);

-- GIN Full-Text Index on documents (title + content) for active docs
CREATE INDEX IF NOT EXISTS "documents_fts_idx" ON "documents" USING GIN (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", ''))
) WHERE "isDeleted" = false;
