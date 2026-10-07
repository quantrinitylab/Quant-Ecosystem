-- CreateTable: QuantMeet durable transcript segments (previously in-memory).
CREATE TABLE "meeting_transcript_segments" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_transcript_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QuantMeet AI meeting summaries (one per room).
CREATE TABLE "meeting_summaries" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL DEFAULT '[]',
    "decisions" JSONB NOT NULL DEFAULT '[]',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QuantMeet AI-extracted action items.
CREATE TABLE "meeting_action_items" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "assignee" TEXT,
    "dueDate" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: QuantNeon durable in-feed game sessions (previously in-memory).
CREATE TABLE "neon_game_sessions" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "players" JSONB NOT NULL DEFAULT '[]',
    "state" TEXT NOT NULL DEFAULT 'waiting',
    "turn" TEXT,
    "board" JSONB NOT NULL DEFAULT '[]',
    "winner" TEXT,
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "neon_game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meeting_transcript_segments_roomId_idx" ON "meeting_transcript_segments"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "meeting_summaries_roomId_key" ON "meeting_summaries"("roomId");

-- CreateIndex
CREATE INDEX "meeting_action_items_roomId_idx" ON "meeting_action_items"("roomId");

-- CreateIndex
CREATE INDEX "neon_game_sessions_gameId_idx" ON "neon_game_sessions"("gameId");

-- CreateIndex
CREATE INDEX "neon_game_sessions_state_idx" ON "neon_game_sessions"("state");
