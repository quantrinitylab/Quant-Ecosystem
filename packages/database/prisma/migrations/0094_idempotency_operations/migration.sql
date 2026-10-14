-- fix/qm-idempotency-outbox-r4 (CODEX-REVIEW P0 on PR #1124): durable
-- idempotency operation ledger backing packages/server-core's
-- DbIdempotencyStore (registered in packages/server-core/src/app.ts).
--
-- One row per logical mutating operation, keyed by the plugin's scoped store
-- key (<prefix>:<userId>:<method>:<route>:<key>) so the SAME durable
-- operation id is reused across timeout, manual retry, reconnect/restart and
-- offline-outbox replay. The primary-key constraint is the cross-replica
-- arbiter: claim = INSERT, exactly one claimant wins, enforced by the
-- database (no Redis required). The completed outcome is written in the SAME
-- database transaction as the mutation (see runIdempotentOperation in
-- packages/server-core/src/plugins/idempotency.ts), so a store-write failure
-- rolls the mutation back with it — the claim is never released while a
-- mutation stands.
--
-- status: 'processing' | 'completed' | 'failed'. 'failed' is retryable.
-- Reads treat expired rows (expiresAt <= now) as absent; a janitor may
-- delete them (index below supports the sweep).
CREATE TABLE "idempotency_operations" (
    "operation_id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_headers" TEXT,
    "response_body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "idempotency_operations_pkey" PRIMARY KEY ("operation_id")
);
CREATE INDEX "idempotency_operations_expiresAt_idx" ON "idempotency_operations"("expires_at");
