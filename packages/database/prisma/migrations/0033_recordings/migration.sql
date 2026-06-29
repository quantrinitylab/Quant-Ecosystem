-- CreateTable: QuantMeet durable meeting recordings (previously in-memory).
-- roomId is a logical room reference (may be a LiveKit room id, relation-free).
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'recording',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "storageKey" TEXT NOT NULL,
    "duration" INTEGER,
    "fileSize" INTEGER,
    "egressId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recordings_roomId_idx" ON "recordings"("roomId");

-- CreateIndex
CREATE INDEX "recordings_userId_idx" ON "recordings"("userId");
