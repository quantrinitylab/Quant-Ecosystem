-- CreateEnum
CREATE TYPE "EditCollaboratorRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER', 'COMMENTER');

-- CreateTable
CREATE TABLE "edit_collaborators" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "EditCollaboratorRole" NOT NULL DEFAULT 'VIEWER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edit_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edit_comments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "layerId" TEXT,
    "position" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edit_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "edit_collaborators_projectId_idx" ON "edit_collaborators"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "edit_collaborators_projectId_userId_key" ON "edit_collaborators"("projectId", "userId");

-- CreateIndex
CREATE INDEX "edit_comments_projectId_idx" ON "edit_comments"("projectId");
