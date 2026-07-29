-- Additive, relation-free shadow migration evidence (ADR-011 / M11d).
-- tenantId is mandatory and every query in the application repository includes
-- it. Raw payloads are short-lived because they can contain user memory text.
CREATE TABLE "memory_shadow_reports" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "legacy" JSONB NOT NULL,
    "next" JSONB NOT NULL,
    "divergence" JSONB NOT NULL,
    "severity" TEXT NOT NULL,
    "agreementRate" DOUBLE PRECISION NOT NULL,
    "infrastructureError" BOOLEAN NOT NULL DEFAULT false,
    "commitSha" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "corpusVersion" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_shadow_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memory_shadow_reports_tenant_check" CHECK (length(btrim("tenantId")) > 0),
    CONSTRAINT "memory_shadow_reports_actor_check" CHECK (length(btrim("actorUserId")) > 0),
    CONSTRAINT "memory_shadow_reports_request_check" CHECK (length(btrim("requestId")) > 0),
    CONSTRAINT "memory_shadow_reports_mode_check" CHECK ("mode" = 'shadow'),
    CONSTRAINT "memory_shadow_reports_severity_check" CHECK ("severity" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT "memory_shadow_reports_agreement_check" CHECK ("agreementRate" >= 0 AND "agreementRate" <= 1),
    CONSTRAINT "memory_shadow_reports_commit_check" CHECK ("commitSha" ~ '^[0-9a-fA-F]{40}$'),
    CONSTRAINT "memory_shadow_reports_policy_check" CHECK (length(btrim("policyVersion")) > 0),
    CONSTRAINT "memory_shadow_reports_corpus_check" CHECK (length(btrim("corpusVersion")) > 0),
    CONSTRAINT "memory_shadow_reports_expiry_check" CHECK ("expiresAt" > "observedAt")
);

CREATE UNIQUE INDEX "memory_shadow_reports_tenantId_requestId_key"
    ON "memory_shadow_reports"("tenantId", "requestId");
CREATE INDEX "memory_shadow_reports_tenantId_observedAt_idx"
    ON "memory_shadow_reports"("tenantId", "observedAt");
CREATE INDEX "memory_shadow_reports_tenantId_actorUserId_observedAt_idx"
    ON "memory_shadow_reports"("tenantId", "actorUserId", "observedAt");
CREATE INDEX "memory_shadow_reports_tenantId_severity_observedAt_idx"
    ON "memory_shadow_reports"("tenantId", "severity", "observedAt");
CREATE INDEX "memory_shadow_reports_expiresAt_idx"
    ON "memory_shadow_reports"("expiresAt");

COMMENT ON TABLE "memory_shadow_reports" IS
    'Append-only, tenant-scoped Memory V2 shadow evidence with explicit retention';