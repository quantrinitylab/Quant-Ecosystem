-- CreateTable: durable AI/agent memory for the frozen MemoryStore port
-- (ADR-005/006). Relation-free polymorphic ownership (ownerType/ownerId/
-- tenantId) mirrors credit_ledger_entries — no User FK, additive and safe for
-- the shared schema. Immutable-append versioning via (logicalId, version).
-- archivedAt = soft archive (ForgetPolicy 'archive'); deletedAt = hard/GDPR.
CREATE TABLE "memory_records" (
    "id" TEXT NOT NULL,
    "logicalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ownerType" TEXT NOT NULL DEFAULT 'user',
    "ownerId" TEXT,
    "tenantId" TEXT,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable: one row per (memory, provider, model). Re-embedding inserts a new
-- row; the vector itself lives in Qdrant (embeddingRef = point id).
CREATE TABLE "memory_embeddings" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "embeddingRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "memory_records_logicalId_version_key" ON "memory_records"("logicalId", "version");
CREATE INDEX "memory_records_ownerType_ownerId_idx" ON "memory_records"("ownerType", "ownerId");
CREATE INDEX "memory_records_ownerType_ownerId_level_idx" ON "memory_records"("ownerType", "ownerId", "level");
CREATE INDEX "memory_records_ownerType_ownerId_kind_idx" ON "memory_records"("ownerType", "ownerId", "kind");
CREATE INDEX "memory_records_ownerId_createdAt_idx" ON "memory_records"("ownerId", "createdAt");
CREATE INDEX "memory_records_expiresAt_idx" ON "memory_records"("expiresAt");
CREATE INDEX "memory_records_archivedAt_idx" ON "memory_records"("archivedAt");
CREATE INDEX "memory_records_tenantId_idx" ON "memory_records"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "memory_embeddings_memoryId_provider_model_key" ON "memory_embeddings"("memoryId", "provider", "model");
CREATE INDEX "memory_embeddings_memoryId_idx" ON "memory_embeddings"("memoryId");
CREATE INDEX "memory_embeddings_provider_model_idx" ON "memory_embeddings"("provider", "model");

-- AddForeignKey
ALTER TABLE "memory_embeddings" ADD CONSTRAINT "memory_embeddings_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "memory_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
