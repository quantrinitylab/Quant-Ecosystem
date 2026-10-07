-- QCHAT-P0-2 (2026-10-07): text stories could never be posted. The Story
-- model had no column for the text body, so the backend silently dropped it.
-- Adds a nullable "textContent" column (Prisma default field->column mapping
-- is quoted camelCase for this table); NULL for photo/video stories.
ALTER TABLE "stories" ADD COLUMN "textContent" TEXT;
