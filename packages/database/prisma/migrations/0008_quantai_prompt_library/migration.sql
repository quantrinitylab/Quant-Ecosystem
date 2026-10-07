-- QuantAI prompt library: persisted, reusable prompt templates.
-- Additive and QuantAI-owned. Per-user, cascade is not required since rows are
-- keyed by userId (no FK) consistent with other QuantAI additive tables.

-- CreateTable: ai_prompt_templates
CREATE TABLE "ai_prompt_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_prompt_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_prompt_templates_userId_idx" ON "ai_prompt_templates"("userId");
CREATE INDEX "ai_prompt_templates_userId_category_idx" ON "ai_prompt_templates"("userId", "category");
