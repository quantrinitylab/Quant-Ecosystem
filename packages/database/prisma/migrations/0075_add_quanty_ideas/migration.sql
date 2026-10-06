-- Quanty Ideas (PR-Q9): proactive idea cards proposed by the agent.
-- The user saves or dismisses each proposal; dismissed ideas stay queryable
-- but are hidden from the default "new" feed. No fabricated rows: ideas only
-- exist when the agent proposes them or the user creates them.

CREATE TABLE "quanty_ideas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "emoji" TEXT NOT NULL DEFAULT '💡',
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quanty_ideas_pkey" PRIMARY KEY ("id")
);

-- Per-user idea listing (default view).
CREATE INDEX "quanty_ideas_userId_idx" ON "quanty_ideas"("userId");

-- Status-filtered listing (new / saved tabs).
CREATE INDEX "quanty_ideas_userId_status_idx" ON "quanty_ideas"("userId", "status");
