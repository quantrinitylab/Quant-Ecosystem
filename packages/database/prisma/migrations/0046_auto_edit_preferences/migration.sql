-- CreateTable: per-user opt-in for the QuantEdits daily auto-edit loop (default OFF).
CREATE TABLE "auto_edit_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "sourceRef" TEXT,
    "templateId" TEXT,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_edit_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_edit_preferences_userId_key" ON "auto_edit_preferences"("userId");
CREATE INDEX "auto_edit_preferences_enabled_idx" ON "auto_edit_preferences"("enabled");
