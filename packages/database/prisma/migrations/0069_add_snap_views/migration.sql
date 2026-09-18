-- Migration 0069: QuantChat Ephemeral Snaps — Snap Views Table (Atomic View-Once & IDOR Protection)
CREATE TABLE IF NOT EXISTS "snap_views" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snap_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "snap_views_messageId_userId_key"
    ON "snap_views" ("messageId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "snap_views_messageId_idx"
    ON "snap_views" ("messageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "snap_views_userId_idx"
    ON "snap_views" ("userId");

-- AddForeignKey
ALTER TABLE "snap_views" ADD CONSTRAINT "snap_views_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
