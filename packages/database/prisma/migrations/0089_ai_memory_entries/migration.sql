-- 0089: durable home for the @quant/ai-memory AIMemoryStore domain (QuantAI
-- memory CRUD API). Relation-free and additive: namespaced by (appId, userId),
-- NO User FK — safe for the shared schema. Separate from memory_records (the
-- frozen ADR-005 MemoryStore port for the engine observe/recall path); this
-- table serves the user-facing CRUD + candidate-approval workflow.
CREATE TABLE "ai_memory_entries" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL DEFAULT 'quantai',
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceApp" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "accessScopes" TEXT[] NOT NULL DEFAULT '{}',
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "writeSignal" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3),
    "accessLog" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_memory_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_memory_entries_appId_userId_idx" ON "ai_memory_entries"("appId", "userId");
CREATE INDEX "ai_memory_entries_appId_userId_status_idx" ON "ai_memory_entries"("appId", "userId", "status");
CREATE INDEX "ai_memory_entries_appId_userId_category_idx" ON "ai_memory_entries"("appId", "userId", "category");
CREATE INDEX "ai_memory_entries_expiresAt_idx" ON "ai_memory_entries"("expiresAt");
