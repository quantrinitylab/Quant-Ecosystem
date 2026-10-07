-- CreateTable
CREATE TABLE "drive_files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "encryptedContent" TEXT NOT NULL,
    "encryptionIV" TEXT NOT NULL,
    "encryptionAuthTag" TEXT NOT NULL,
    "encryptionKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_shares" (
    "id" TEXT NOT NULL,
    "fileId" TEXT,
    "folderId" TEXT,
    "ownerUserId" TEXT NOT NULL,
    "sharedWithUserId" TEXT NOT NULL,
    "encryptedFileKey" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'read',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_file_versions" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 0,
    "encryptedContent" TEXT NOT NULL,
    "encryptionIV" TEXT NOT NULL,
    "encryptionAuthTag" TEXT NOT NULL,
    "encryptionKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_file_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_file_indexes" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drive_file_indexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drive_user_subscriptions" (
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_user_subscriptions_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "drive_files_userId_isDeleted_idx" ON "drive_files"("userId", "isDeleted");
CREATE INDEX "drive_files_folderId_idx" ON "drive_files"("folderId");
CREATE INDEX "drive_folders_userId_idx" ON "drive_folders"("userId");
CREATE INDEX "drive_folders_parentId_idx" ON "drive_folders"("parentId");
CREATE INDEX "drive_shares_ownerUserId_idx" ON "drive_shares"("ownerUserId");
CREATE INDEX "drive_shares_sharedWithUserId_idx" ON "drive_shares"("sharedWithUserId");
CREATE INDEX "drive_shares_fileId_idx" ON "drive_shares"("fileId");
CREATE INDEX "drive_file_versions_fileId_idx" ON "drive_file_versions"("fileId");
CREATE INDEX "drive_file_indexes_userId_idx" ON "drive_file_indexes"("userId");
CREATE INDEX "drive_file_indexes_fileId_idx" ON "drive_file_indexes"("fileId");
