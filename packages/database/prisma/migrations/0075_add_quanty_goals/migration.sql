-- Quanty user goals (Muse S7 parity): tracking/done goals plus
-- agent-proposed goals that require explicit user confirmation.

CREATE TABLE "quanty_goals" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT 'custom',
  "status" TEXT NOT NULL DEFAULT 'tracking',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "quanty_goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quanty_goals_userId_idx" ON "quanty_goals"("userId");
CREATE INDEX "quanty_goals_userId_status_idx" ON "quanty_goals"("userId", "status");

-- Agent-proposed goals: never auto-applied; only become goals on accept.
CREATE TABLE "quanty_goal_proposals" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" TEXT NOT NULL DEFAULT 'custom',
  "source" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "quanty_goal_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quanty_goal_proposals_userId_idx" ON "quanty_goal_proposals"("userId");
CREATE INDEX "quanty_goal_proposals_userId_status_idx" ON "quanty_goal_proposals"("userId", "status");
