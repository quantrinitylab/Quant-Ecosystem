-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('VIDEO', 'PROFILE', 'MESSAGE', 'CHAT_SESSION');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'NUDITY', 'VIOLENCE', 'HATE_SPEECH', 'SELF_HARM', 'MISINFORMATION', 'UNDERAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'REVIEWING', 'ACTIONED', 'DISMISSED');

-- CreateTable
CREATE TABLE "user_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_safety_settings" (
    "userId" TEXT NOT NULL,
    "hideSensitiveContent" BOOLEAN NOT NULL DEFAULT true,
    "allowRandomChat" BOOLEAN NOT NULL DEFAULT true,
    "blockUnknownMessages" BOOLEAN NOT NULL DEFAULT false,
    "filteredKeywords" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_safety_settings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "user_reports_reporterId_idx" ON "user_reports"("reporterId");

-- CreateIndex
CREATE INDEX "user_reports_targetType_targetId_idx" ON "user_reports"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "user_reports_status_idx" ON "user_reports"("status");
