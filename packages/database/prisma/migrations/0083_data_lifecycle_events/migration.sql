-- QM-BACK-006 (2026-10-08): data-lifecycle domain tables (M15, doc 23 EC-03).
--
-- Versioned lifecycle events (legalhold.placed/released, data.export.*,
-- data.deletion.*, data.retention.*) are emitted transactionally through the
-- outbox (doc 23 runtime law 1). These tables track the operations themselves
-- so completion is VERIFIED, not assumed from publication (doc 23 laws 7/8):
--
-- - data_export_requests: a user's export request + artifact pointer. v1
--   artifacts are data-inventory manifests generated from live DB counts.
-- - retention_policies: persisted retention policies so the retention sweep
--   can execute them (the legacy in-memory policy list cannot survive a
--   restart and is invisible to the sweep).
-- - lifecycle_operations: one row per lifecycle operation, created in the
--   SAME transaction as its request event; reaches `completed` only when the
--   side effects are done. Consumers/projectors ack against this row.
-- - projector_checkpoints: per-consumer durable checkpoints for derived-index
--   consumers (e.g. search-indexer invalidation); replay resumes from the
--   checkpoint, never from zero and never by skipping.
--
-- INVARIANT: lifecycle event payloads carry ids + actor scope only — never
-- message bodies, file contents, or secrets (same contract as K1 mail events).

CREATE TABLE "data_export_requests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'mailbox-inventory',
  "status" TEXT NOT NULL DEFAULT 'requested',
  "artifactRef" TEXT,
  "error" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),

  CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_export_requests_userId_status_idx" ON "data_export_requests"("userId", "status");

CREATE TABLE "retention_policies" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "duration_days" INTEGER NOT NULL,
  "target_folders" JSONB NOT NULL DEFAULT '[]',
  "action" TEXT NOT NULL DEFAULT 'ARCHIVE',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "retention_policies_enabled_idx" ON "retention_policies"("enabled");

CREATE TABLE "lifecycle_operations" (
  "id" TEXT NOT NULL,
  "operation_type" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'requested',
  "requested_by" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "error" TEXT,

  CONSTRAINT "lifecycle_operations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lifecycle_operations_status_idx" ON "lifecycle_operations"("status");
CREATE INDEX "lifecycle_operations_aggregate_type_aggregate_id_idx" ON "lifecycle_operations"("aggregate_type", "aggregate_id");

CREATE TABLE "projector_checkpoints" (
  "consumer_id" TEXT NOT NULL,
  "last_event_id" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "projector_checkpoints_pkey" PRIMARY KEY ("consumer_id")
);
