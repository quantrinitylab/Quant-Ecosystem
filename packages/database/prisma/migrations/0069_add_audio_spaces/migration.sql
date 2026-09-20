-- Migration 0069: QuantWave Audio Spaces (live audio rooms)
--
-- Backs `apps/quantsync/backend/routes/spaces.ts`. Membership, speaker roles and the
-- hand-raise queue are persisted so a Space survives a backend restart and can be served
-- by more than one instance.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "SpaceStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "SpaceRole" AS ENUM ('HOST', 'SPEAKER', 'LISTENER');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "spaces" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "SpaceStatus" NOT NULL DEFAULT 'LIVE',
    "isRecording" BOOLEAN NOT NULL DEFAULT false,
    "topics" JSONB NOT NULL DEFAULT '[]',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "space_participants" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SpaceRole" NOT NULL DEFAULT 'LISTENER',
    "isMuted" BOOLEAN NOT NULL DEFAULT true,
    "handRaisedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "space_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "spaces_hostId_idx" ON "spaces" ("hostId");
CREATE INDEX IF NOT EXISTS "spaces_status_idx" ON "spaces" ("status");
CREATE INDEX IF NOT EXISTS "spaces_startedAt_idx" ON "spaces" ("startedAt");

-- One row per user per space: re-joining reactivates the existing row.
CREATE UNIQUE INDEX IF NOT EXISTS "space_participants_spaceId_userId_key"
    ON "space_participants" ("spaceId", "userId");
CREATE INDEX IF NOT EXISTS "space_participants_spaceId_idx" ON "space_participants" ("spaceId");
CREATE INDEX IF NOT EXISTS "space_participants_userId_idx" ON "space_participants" ("userId");
CREATE INDEX IF NOT EXISTS "space_participants_handRaisedAt_idx"
    ON "space_participants" ("handRaisedAt");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "spaces"
        ADD CONSTRAINT "spaces_hostId_fkey" FOREIGN KEY ("hostId")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "space_participants"
        ADD CONSTRAINT "space_participants_spaceId_fkey" FOREIGN KEY ("spaceId")
        REFERENCES "spaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "space_participants"
        ADD CONSTRAINT "space_participants_userId_fkey" FOREIGN KEY ("userId")
        REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
