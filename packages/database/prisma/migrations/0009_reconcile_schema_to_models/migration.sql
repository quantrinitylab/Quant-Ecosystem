-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('draft', 'queued', 'sent', 'deferred', 'bounced', 'delivered');

-- CreateEnum
CREATE TYPE "AgentSessionStatus" AS ENUM ('PLANNING', 'RUNNING', 'AWAITING_REVIEW', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentTranscriptRole" AS ENUM ('PLAN', 'TOOL_CALL', 'OBSERVATION', 'MESSAGE');

-- CreateEnum
CREATE TYPE "AgentOrgStatus" AS ENUM ('PLANNING', 'PROVISIONING', 'RUNNING', 'AWAITING_APPROVAL', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentRoleKey" AS ENUM ('PLANNER', 'CODER', 'REVIEWER', 'TESTER', 'DEBUGGER', 'UPGRADER', 'DEVOPS');

-- CreateEnum
CREATE TYPE "AgentWorkerStatus" AS ENUM ('SPAWNING', 'ACTIVE', 'PAUSED', 'RETIRED');

-- CreateEnum
CREATE TYPE "AgentMailboxIdentityStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AgentBusMsgType" AS ENUM ('TASK_ASSIGN', 'PR_READY', 'CHANGE_REQUEST', 'CI_RESULT', 'STATUS', 'ESCALATION', 'DONE');

-- CreateEnum
CREATE TYPE "AgentWorkItemStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE');

-- CreateEnum
CREATE TYPE "AgentActionType" AS ENUM ('MERGE', 'GMAIL_SEND', 'GMAIL_REPLY', 'GMAIL_ARCHIVE', 'GMAIL_LABEL', 'GMAIL_SCHEDULE_SEND', 'GMAIL_FOLLOWUP', 'EXTERNAL_SEND', 'OTHER');

-- CreateEnum
CREATE TYPE "AgentActionSensitivity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "DocumentChunkSource" AS ENUM ('EMAIL', 'REPO', 'WEB');

-- CreateEnum
CREATE TYPE "CreditBucket" AS ENUM ('DAILY', 'MONTHLY', 'PURCHASED');

-- CreateEnum
CREATE TYPE "OrgPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "OrgMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "DeliveryAttemptStatus" AS ENUM ('queued', 'sent', 'deferred', 'bounced');

-- DropIndex
DROP INDEX "audit_logs_actorId_idx";

-- DropIndex
DROP INDEX "audit_logs_createdAt_idx";

-- DropIndex
DROP INDEX "audit_logs_resourceType_resourceId_idx";

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "actorId",
DROP COLUMN "diff",
DROP COLUMN "ipAddress",
DROP COLUMN "resourceType",
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "metadata" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "orgId" TEXT,
ADD COLUMN     "resource" TEXT NOT NULL,
ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "resourceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "emails" ADD COLUMN     "authResults" JSONB,
ADD COLUMN     "deliveryStatus" "EmailDeliveryStatus" NOT NULL DEFAULT 'draft',
ADD COLUMN     "messageId" TEXT;

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PostType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "mediaUrls" JSONB NOT NULL DEFAULT '[]',
    "hashtags" JSONB NOT NULL DEFAULT '[]',
    "mentions" JSONB NOT NULL DEFAULT '[]',
    "linkPreview" JSONB,
    "replyToId" TEXT,
    "communityId" TEXT,
    "visibility" "PostVisibility" NOT NULL DEFAULT 'PUBLIC',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "repostCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "category" TEXT,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_members" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CommunityRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "endAt" TIMESTAMP(3),
    "voterCount" INTEGER NOT NULL DEFAULT 0,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "CampaignObjective" NOT NULL DEFAULT 'AWARENESS',
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "budget" JSONB NOT NULL DEFAULT '{}',
    "schedule" JSONB NOT NULL DEFAULT '{}',
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "totalSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalImpressions" INTEGER NOT NULL DEFAULT 0,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "totalConversions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_sets" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdSetStatus" NOT NULL DEFAULT 'DRAFT',
    "budget" JSONB NOT NULL DEFAULT '{}',
    "targeting" JSONB NOT NULL DEFAULT '{}',
    "placement" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads" (
    "id" TEXT NOT NULL,
    "adSetId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_creatives" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "type" "AdCreativeType" NOT NULL DEFAULT 'IMAGE',
    "name" TEXT NOT NULL,
    "headline" TEXT,
    "description" TEXT,
    "mediaUrl" TEXT,
    "callToAction" TEXT,
    "landingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" BIGINT NOT NULL DEFAULT 0,
    "category" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "visibility" "VideoVisibility" NOT NULL DEFAULT 'PUBLIC',
    "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "processingStatus" "VideoProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_channels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "description" TEXT,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "VideoVisibility" NOT NULL DEFAULT 'PUBLIC',
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "albumId" TEXT,
    "caption" TEXT,
    "imageUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "filter" TEXT,
    "location" JSONB,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_albums" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverPhotoUrl" TEXT,
    "photoCount" INTEGER NOT NULL DEFAULT 0,
    "visibility" "VideoVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "photo_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "StoryType" NOT NULL DEFAULT 'IMAGE',
    "mediaUrl" TEXT,
    "thumbnailUrl" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 15,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "music" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "albumName" TEXT,
    "coverUrl" TEXT,
    "audioUrl" TEXT NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "genre" TEXT,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dating_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "age" INTEGER NOT NULL,
    "gender" TEXT,
    "genderPreference" JSONB NOT NULL DEFAULT '[]',
    "location" JSONB,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "interests" JSONB NOT NULL DEFAULT '[]',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "profileScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastActive" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dating_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swipes" (
    "id" TEXT NOT NULL,
    "swiperId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "direction" "SwipeDirection" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "short_videos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "videoUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "caption" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "soundId" TEXT,
    "hashtags" JSONB NOT NULL DEFAULT '[]',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "short_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encryption_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'AES-256-GCM',
    "rotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encryption_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "RepoVisibility" NOT NULL DEFAULT 'PUBLIC',
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "storagePathUrl" TEXT,
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pull_requests" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "authorId" TEXT NOT NULL,
    "status" "PRStatus" NOT NULL DEFAULT 'OPEN',
    "sourceBranch" TEXT NOT NULL,
    "targetBranch" TEXT NOT NULL,
    "mergeStrategy" "MergeStrategy",
    "mergedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "prId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_comments" (
    "id" TEXT NOT NULL,
    "prId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "authorId" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "labels" JSONB NOT NULL DEFAULT '[]',
    "assignees" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_protections" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "branchPattern" TEXT NOT NULL,
    "requiredApprovals" INTEGER NOT NULL DEFAULT 1,
    "requireStatusChecks" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_protections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ci_runs" (
    "id" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "prId" TEXT,
    "branch" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "status" "CIStatus" NOT NULL DEFAULT 'PENDING',
    "triggeredBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ci_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ci_jobs" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CIStatus" NOT NULL DEFAULT 'PENDING',
    "logs" TEXT,
    "artifacts" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ci_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "status" "AgentSessionStatus" NOT NULL DEFAULT 'PLANNING',
    "branchRef" TEXT NOT NULL,
    "maxIterations" INTEGER NOT NULL DEFAULT 10,
    "iterationCount" INTEGER NOT NULL DEFAULT 0,
    "costBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "linkedPrId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_transcripts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "AgentTranscriptRole" NOT NULL,
    "toolName" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_orgs" (
    "id" TEXT NOT NULL,
    "ceoUserId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "goalText" TEXT NOT NULL,
    "status" "AgentOrgStatus" NOT NULL DEFAULT 'PLANNING',
    "workspaceRepoId" TEXT,
    "budgetCap" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxIterations" INTEGER NOT NULL DEFAULT 100,
    "totalIterations" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_orgs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_workers" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "AgentRoleKey" NOT NULL,
    "modelRef" TEXT NOT NULL,
    "mailboxIdentityId" TEXT,
    "toolScope" JSONB NOT NULL DEFAULT '[]',
    "status" "AgentWorkerStatus" NOT NULL DEFAULT 'SPAWNING',
    "budgetShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costSpent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_mailbox_identities" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workerSlot" TEXT NOT NULL,
    "roleKey" "AgentRoleKey",
    "address" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "status" "AgentMailboxIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_mailbox_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_work_items" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assignedWorkerId" TEXT,
    "busThreadId" TEXT,
    "title" TEXT NOT NULL,
    "spec" TEXT,
    "status" "AgentWorkItemStatus" NOT NULL DEFAULT 'OPEN',
    "linkedSessionId" TEXT,
    "linkedPrId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_bus_email_meta" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "workItemId" TEXT NOT NULL,
    "fromWorkerId" TEXT NOT NULL,
    "fromRole" TEXT NOT NULL,
    "toWorkerIds" JSONB NOT NULL DEFAULT '[]',
    "msgType" "AgentBusMsgType" NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'agent-bus',
    "headers" JSONB NOT NULL DEFAULT '{}',
    "artifacts" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_bus_email_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_action_audits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT,
    "actorWorkerId" TEXT,
    "actionType" "AgentActionType" NOT NULL,
    "targetRef" TEXT NOT NULL,
    "sensitivity" "AgentActionSensitivity" NOT NULL DEFAULT 'HIGH',
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "approvedByUserId" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_action_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" "DocumentChunkSource" NOT NULL,
    "sourceRef" JSONB NOT NULL DEFAULT '{}',
    "text" TEXT NOT NULL,
    "embeddingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger_entries" (
    "id" TEXT NOT NULL,
    "ownerRef" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'user',
    "tenantId" TEXT,
    "entryType" TEXT NOT NULL,
    "bucket" "CreditBucket" NOT NULL,
    "amount" INTEGER NOT NULL,
    "actionKey" TEXT,
    "sourceRef" TEXT,
    "utcDay" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_subscriptions" (
    "id" TEXT NOT NULL,
    "ownerRef" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'user',
    "tenantId" TEXT,
    "planTier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "pendingPlanTier" TEXT,
    "effectiveAt" TIMESTAMP(3),
    "providerSubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "ownerRef" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'user',
    "tenantId" TEXT,
    "providerEventId" TEXT,
    "providerSessionId" TEXT,
    "providerSubId" TEXT,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amountCredits" INTEGER,
    "planTier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "percentage" INTEGER NOT NULL DEFAULT 100,
    "variants" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "OrgPlan" NOT NULL DEFAULT 'FREE',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_workspaces" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "DeliveryAttemptStatus" NOT NULL DEFAULT 'queued',
    "smtpResponse" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextRetryAt" TIMESTAMP(3),

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_auth_keys" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "dkimSelector" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKeyRef" TEXT NOT NULL,
    "spfRecord" TEXT,
    "dmarcPolicy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_auth_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_marketplace_agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "systemPrompt" TEXT NOT NULL,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "modelPreference" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_marketplace_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_installs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agent_installs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_userId_idx" ON "posts"("userId");

-- CreateIndex
CREATE INDEX "posts_communityId_idx" ON "posts"("communityId");

-- CreateIndex
CREATE INDEX "posts_publishedAt_idx" ON "posts"("publishedAt");

-- CreateIndex
CREATE INDEX "posts_visibility_idx" ON "posts"("visibility");

-- CreateIndex
CREATE INDEX "comments_postId_idx" ON "comments"("postId");

-- CreateIndex
CREATE INDEX "comments_userId_idx" ON "comments"("userId");

-- CreateIndex
CREATE INDEX "comments_parentId_idx" ON "comments"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- CreateIndex
CREATE INDEX "communities_slug_idx" ON "communities"("slug");

-- CreateIndex
CREATE INDEX "community_members_communityId_idx" ON "community_members"("communityId");

-- CreateIndex
CREATE INDEX "community_members_userId_idx" ON "community_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "community_members_communityId_userId_key" ON "community_members"("communityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "polls_postId_key" ON "polls"("postId");

-- CreateIndex
CREATE INDEX "poll_votes_pollId_idx" ON "poll_votes"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_pollId_userId_optionIndex_key" ON "poll_votes"("pollId", "userId", "optionIndex");

-- CreateIndex
CREATE INDEX "campaigns_advertiserId_idx" ON "campaigns"("advertiserId");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "ad_sets_campaignId_idx" ON "ad_sets"("campaignId");

-- CreateIndex
CREATE INDEX "ads_adSetId_idx" ON "ads"("adSetId");

-- CreateIndex
CREATE INDEX "ads_creativeId_idx" ON "ads"("creativeId");

-- CreateIndex
CREATE INDEX "ad_creatives_advertiserId_idx" ON "ad_creatives"("advertiserId");

-- CreateIndex
CREATE INDEX "videos_userId_idx" ON "videos"("userId");

-- CreateIndex
CREATE INDEX "videos_channelId_idx" ON "videos"("channelId");

-- CreateIndex
CREATE INDEX "videos_publishedAt_idx" ON "videos"("publishedAt");

-- CreateIndex
CREATE INDEX "videos_visibility_idx" ON "videos"("visibility");

-- CreateIndex
CREATE UNIQUE INDEX "video_channels_handle_key" ON "video_channels"("handle");

-- CreateIndex
CREATE INDEX "video_channels_userId_idx" ON "video_channels"("userId");

-- CreateIndex
CREATE INDEX "video_channels_handle_idx" ON "video_channels"("handle");

-- CreateIndex
CREATE INDEX "playlists_userId_idx" ON "playlists"("userId");

-- CreateIndex
CREATE INDEX "playlists_channelId_idx" ON "playlists"("channelId");

-- CreateIndex
CREATE INDEX "photos_userId_idx" ON "photos"("userId");

-- CreateIndex
CREATE INDEX "photos_albumId_idx" ON "photos"("albumId");

-- CreateIndex
CREATE INDEX "photo_albums_userId_idx" ON "photo_albums"("userId");

-- CreateIndex
CREATE INDEX "stories_userId_idx" ON "stories"("userId");

-- CreateIndex
CREATE INDEX "stories_expiresAt_idx" ON "stories"("expiresAt");

-- CreateIndex
CREATE INDEX "music_artistName_idx" ON "music"("artistName");

-- CreateIndex
CREATE INDEX "music_genre_idx" ON "music"("genre");

-- CreateIndex
CREATE UNIQUE INDEX "dating_profiles_userId_key" ON "dating_profiles"("userId");

-- CreateIndex
CREATE INDEX "dating_profiles_userId_idx" ON "dating_profiles"("userId");

-- CreateIndex
CREATE INDEX "dating_profiles_isActive_idx" ON "dating_profiles"("isActive");

-- CreateIndex
CREATE INDEX "matches_user1Id_idx" ON "matches"("user1Id");

-- CreateIndex
CREATE INDEX "matches_user2Id_idx" ON "matches"("user2Id");

-- CreateIndex
CREATE UNIQUE INDEX "matches_user1Id_user2Id_key" ON "matches"("user1Id", "user2Id");

-- CreateIndex
CREATE INDEX "swipes_swiperId_idx" ON "swipes"("swiperId");

-- CreateIndex
CREATE INDEX "swipes_targetId_idx" ON "swipes"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "swipes_swiperId_targetId_key" ON "swipes"("swiperId", "targetId");

-- CreateIndex
CREATE INDEX "short_videos_userId_idx" ON "short_videos"("userId");

-- CreateIndex
CREATE INDEX "short_videos_createdAt_idx" ON "short_videos"("createdAt");

-- CreateIndex
CREATE INDEX "encryption_keys_userId_idx" ON "encryption_keys"("userId");

-- CreateIndex
CREATE INDEX "repositories_ownerId_idx" ON "repositories"("ownerId");

-- CreateIndex
CREATE INDEX "repositories_visibility_idx" ON "repositories"("visibility");

-- CreateIndex
CREATE INDEX "repositories_createdAt_idx" ON "repositories"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_ownerId_name_key" ON "repositories"("ownerId", "name");

-- CreateIndex
CREATE INDEX "branches_repoId_idx" ON "branches"("repoId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_repoId_name_key" ON "branches"("repoId", "name");

-- CreateIndex
CREATE INDEX "pull_requests_repoId_idx" ON "pull_requests"("repoId");

-- CreateIndex
CREATE INDEX "pull_requests_authorId_idx" ON "pull_requests"("authorId");

-- CreateIndex
CREATE INDEX "pull_requests_status_idx" ON "pull_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pull_requests_repoId_number_key" ON "pull_requests"("repoId", "number");

-- CreateIndex
CREATE INDEX "reviews_prId_idx" ON "reviews"("prId");

-- CreateIndex
CREATE INDEX "reviews_reviewerId_idx" ON "reviews"("reviewerId");

-- CreateIndex
CREATE INDEX "review_comments_prId_idx" ON "review_comments"("prId");

-- CreateIndex
CREATE INDEX "review_comments_authorId_idx" ON "review_comments"("authorId");

-- CreateIndex
CREATE INDEX "issues_repoId_idx" ON "issues"("repoId");

-- CreateIndex
CREATE INDEX "issues_authorId_idx" ON "issues"("authorId");

-- CreateIndex
CREATE INDEX "issues_status_idx" ON "issues"("status");

-- CreateIndex
CREATE UNIQUE INDEX "issues_repoId_number_key" ON "issues"("repoId", "number");

-- CreateIndex
CREATE INDEX "branch_protections_repoId_idx" ON "branch_protections"("repoId");

-- CreateIndex
CREATE INDEX "ci_runs_repoId_idx" ON "ci_runs"("repoId");

-- CreateIndex
CREATE INDEX "ci_runs_status_idx" ON "ci_runs"("status");

-- CreateIndex
CREATE INDEX "ci_runs_commitSha_idx" ON "ci_runs"("commitSha");

-- CreateIndex
CREATE INDEX "ci_jobs_runId_idx" ON "ci_jobs"("runId");

-- CreateIndex
CREATE INDEX "ci_jobs_status_idx" ON "ci_jobs"("status");

-- CreateIndex
CREATE INDEX "agent_sessions_userId_idx" ON "agent_sessions"("userId");

-- CreateIndex
CREATE INDEX "agent_sessions_repoId_idx" ON "agent_sessions"("repoId");

-- CreateIndex
CREATE INDEX "agent_sessions_status_idx" ON "agent_sessions"("status");

-- CreateIndex
CREATE INDEX "agent_transcripts_sessionId_idx" ON "agent_transcripts"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_transcripts_sessionId_seq_key" ON "agent_transcripts"("sessionId", "seq");

-- CreateIndex
CREATE INDEX "agent_orgs_ceoUserId_idx" ON "agent_orgs"("ceoUserId");

-- CreateIndex
CREATE INDEX "agent_orgs_tenantId_idx" ON "agent_orgs"("tenantId");

-- CreateIndex
CREATE INDEX "agent_orgs_status_idx" ON "agent_orgs"("status");

-- CreateIndex
CREATE INDEX "agent_workers_orgId_idx" ON "agent_workers"("orgId");

-- CreateIndex
CREATE INDEX "agent_workers_tenantId_idx" ON "agent_workers"("tenantId");

-- CreateIndex
CREATE INDEX "agent_workers_status_idx" ON "agent_workers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_mailbox_identities_address_key" ON "agent_mailbox_identities"("address");

-- CreateIndex
CREATE INDEX "agent_mailbox_identities_orgId_idx" ON "agent_mailbox_identities"("orgId");

-- CreateIndex
CREATE INDEX "agent_mailbox_identities_tenantId_idx" ON "agent_mailbox_identities"("tenantId");

-- CreateIndex
CREATE INDEX "agent_mailbox_identities_status_idx" ON "agent_mailbox_identities"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_mailbox_identities_orgId_workerSlot_key" ON "agent_mailbox_identities"("orgId", "workerSlot");

-- CreateIndex
CREATE INDEX "agent_work_items_orgId_idx" ON "agent_work_items"("orgId");

-- CreateIndex
CREATE INDEX "agent_work_items_assignedWorkerId_idx" ON "agent_work_items"("assignedWorkerId");

-- CreateIndex
CREATE INDEX "agent_work_items_busThreadId_idx" ON "agent_work_items"("busThreadId");

-- CreateIndex
CREATE INDEX "agent_work_items_status_idx" ON "agent_work_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "agent_bus_email_meta_emailId_key" ON "agent_bus_email_meta"("emailId");

-- CreateIndex
CREATE INDEX "agent_bus_email_meta_orgId_idx" ON "agent_bus_email_meta"("orgId");

-- CreateIndex
CREATE INDEX "agent_bus_email_meta_workItemId_idx" ON "agent_bus_email_meta"("workItemId");

-- CreateIndex
CREATE INDEX "agent_bus_email_meta_threadId_idx" ON "agent_bus_email_meta"("threadId");

-- CreateIndex
CREATE INDEX "agent_bus_email_meta_msgType_idx" ON "agent_bus_email_meta"("msgType");

-- CreateIndex
CREATE INDEX "agent_action_audits_tenantId_idx" ON "agent_action_audits"("tenantId");

-- CreateIndex
CREATE INDEX "agent_action_audits_orgId_idx" ON "agent_action_audits"("orgId");

-- CreateIndex
CREATE INDEX "agent_action_audits_actorWorkerId_idx" ON "agent_action_audits"("actorWorkerId");

-- CreateIndex
CREATE INDEX "agent_action_audits_status_idx" ON "agent_action_audits"("status");

-- CreateIndex
CREATE INDEX "agent_action_audits_actionType_idx" ON "agent_action_audits"("actionType");

-- CreateIndex
CREATE INDEX "document_chunks_userId_idx" ON "document_chunks"("userId");

-- CreateIndex
CREATE INDEX "document_chunks_userId_sourceType_idx" ON "document_chunks"("userId", "sourceType");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_ownerRef_idx" ON "credit_ledger_entries"("ownerRef");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_ownerRef_bucket_idx" ON "credit_ledger_entries"("ownerRef", "bucket");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_ownerRef_entryType_idx" ON "credit_ledger_entries"("ownerRef", "entryType");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_tenantId_idx" ON "credit_ledger_entries"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_entries_actionKey_key" ON "credit_ledger_entries"("actionKey");

-- CreateIndex
CREATE INDEX "plan_subscriptions_ownerRef_idx" ON "plan_subscriptions"("ownerRef");

-- CreateIndex
CREATE INDEX "plan_subscriptions_ownerRef_status_idx" ON "plan_subscriptions"("ownerRef", "status");

-- CreateIndex
CREATE INDEX "plan_subscriptions_tenantId_idx" ON "plan_subscriptions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_providerEventId_key" ON "payment_records"("providerEventId");

-- CreateIndex
CREATE INDEX "payment_records_ownerRef_idx" ON "payment_records"("ownerRef");

-- CreateIndex
CREATE INDEX "payment_records_ownerRef_status_idx" ON "payment_records"("ownerRef", "status");

-- CreateIndex
CREATE INDEX "payment_records_providerSessionId_idx" ON "payment_records"("providerSessionId");

-- CreateIndex
CREATE INDEX "payment_records_tenantId_idx" ON "payment_records"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_name_key" ON "feature_flags"("name");

-- CreateIndex
CREATE INDEX "feature_flags_name_idx" ON "feature_flags"("name");

-- CreateIndex
CREATE INDEX "feature_flags_enabled_idx" ON "feature_flags"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_slug_idx" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_members_orgId_idx" ON "organization_members"("orgId");

-- CreateIndex
CREATE INDEX "organization_members_userId_idx" ON "organization_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_orgId_userId_key" ON "organization_members"("orgId", "userId");

-- CreateIndex
CREATE INDEX "org_workspaces_orgId_idx" ON "org_workspaces"("orgId");

-- CreateIndex
CREATE INDEX "likes_userId_idx" ON "likes"("userId");

-- CreateIndex
CREATE INDEX "likes_postId_idx" ON "likes"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "likes_userId_postId_key" ON "likes"("userId", "postId");

-- CreateIndex
CREATE INDEX "delivery_attempts_emailId_idx" ON "delivery_attempts"("emailId");

-- CreateIndex
CREATE INDEX "delivery_attempts_recipient_idx" ON "delivery_attempts"("recipient");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_emailId_recipient_key" ON "delivery_attempts"("emailId", "recipient");

-- CreateIndex
CREATE UNIQUE INDEX "domain_auth_keys_domain_key" ON "domain_auth_keys"("domain");

-- CreateIndex
CREATE INDEX "ai_marketplace_agents_author_idx" ON "ai_marketplace_agents"("author");

-- CreateIndex
CREATE INDEX "ai_marketplace_agents_createdAt_idx" ON "ai_marketplace_agents"("createdAt");

-- CreateIndex
CREATE INDEX "ai_agent_installs_userId_idx" ON "ai_agent_installs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_installs_userId_agentId_key" ON "ai_agent_installs"("userId", "agentId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_orgId_idx" ON "audit_logs"("orgId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_sets" ADD CONSTRAINT "ad_sets_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_adSetId_fkey" FOREIGN KEY ("adSetId") REFERENCES "ad_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_creativeId_fkey" FOREIGN KEY ("creativeId") REFERENCES "ad_creatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "video_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "video_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "photo_albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stories" ADD CONSTRAINT "stories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dating_profiles" ADD CONSTRAINT "dating_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_swiperId_fkey" FOREIGN KEY ("swiperId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "short_videos" ADD CONSTRAINT "short_videos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_prId_fkey" FOREIGN KEY ("prId") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_prId_fkey" FOREIGN KEY ("prId") REFERENCES "pull_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_protections" ADD CONSTRAINT "branch_protections_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ci_jobs" ADD CONSTRAINT "ci_jobs_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ci_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_repoId_fkey" FOREIGN KEY ("repoId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_transcripts" ADD CONSTRAINT "agent_transcripts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "agent_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_orgs" ADD CONSTRAINT "agent_orgs_ceoUserId_fkey" FOREIGN KEY ("ceoUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_workers" ADD CONSTRAINT "agent_workers_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "agent_orgs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_workspaces" ADD CONSTRAINT "org_workspaces_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

