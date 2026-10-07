-- Drive starring and trash metadata fields for files and folders
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "drive_files" ADD COLUMN IF NOT EXISTS "trashRootId" TEXT;

ALTER TABLE "drive_folders" ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "drive_folders" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "drive_folders" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "drive_folders" ADD COLUMN IF NOT EXISTS "trashRootId" TEXT;
