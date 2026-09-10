-- Drive starring and trash metadata fields for files and folders
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "files" ADD COLUMN IF NOT EXISTS "trashRootId" TEXT;

ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "folders" ADD COLUMN IF NOT EXISTS "trashRootId" TEXT;
