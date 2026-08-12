-- Workspace collaboration: multi-user workspaces with roles + emailed invites.

-- AlterEnum: read-only role for auditors/clients.
ALTER TYPE "OrgMemberRole" ADD VALUE IF NOT EXISTS 'VIEWER';

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkspaceInviteStatus') THEN
    CREATE TYPE "WorkspaceInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
  END IF;
END
$$;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "organization_members" ADD COLUMN IF NOT EXISTS "invitedById" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "workspace_invites" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "OrgMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "WorkspaceInviteStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "message" TEXT,
    "invitedById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invites_tokenHash_key" ON "workspace_invites"("tokenHash");
CREATE INDEX IF NOT EXISTS "workspace_invites_orgId_idx" ON "workspace_invites"("orgId");
CREATE INDEX IF NOT EXISTS "workspace_invites_email_idx" ON "workspace_invites"("email");
CREATE INDEX IF NOT EXISTS "workspace_invites_status_idx" ON "workspace_invites"("status");

-- AddForeignKey
ALTER TABLE "workspace_invites"
  DROP CONSTRAINT IF EXISTS "workspace_invites_orgId_fkey";
ALTER TABLE "workspace_invites"
  ADD CONSTRAINT "workspace_invites_orgId_fkey" FOREIGN KEY ("orgId")
  REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
