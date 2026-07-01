-- CreateTable: durable QuantEdits daily auto-edit run (one per user per UTC day).
CREATE TABLE "auto_edit_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "utcDay" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "checkpoints" JSONB NOT NULL DEFAULT '[]',
    "sourceRef" TEXT,
    "outputUrl" TEXT,
    "postId" TEXT,
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "auto_edit_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_edit_runs_userId_utcDay_key" ON "auto_edit_runs"("userId", "utcDay");
CREATE INDEX "auto_edit_runs_userId_idx" ON "auto_edit_runs"("userId");
