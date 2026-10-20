-- fix/qm-quanty-task-durability (2026-10-20): durable Quanty agentic tasks.
--
-- WR-G finding: the Quanty agentic engine kept task state in process memory
-- (InMemoryTaskStore), broadcast progress only to process-local SSE
-- subscribers, persisted audit entries nowhere, and never distinguished "UI
-- closed" from an explicit background transition. A backend restart or a
-- second replica lost every task; approvals lived in a process-global list
-- that was not even scoped per user.
--
-- New tables:
--   quanty_tasks            — the task row; steps ride along as a JSON TEXT
--                             column (always read/written with the task).
--   quanty_task_events      — append-only audit/event log; the SSE stream
--                             replays it so reconnects see full history.
--   quanty_approval_records — durable, per-user permission grants.
--
-- Per-step idempotent effects ("receipts") reuse the existing
-- idempotency_operations table with operationId
-- "quanty:step:<taskId>:<stepId>" — no new table needed.
--
-- All additive; no existing rows touched.

CREATE TABLE "quanty_tasks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "planSummary" TEXT NOT NULL,
  "steps" TEXT NOT NULL,
  "needsConfirmation" BOOLEAN NOT NULL DEFAULT false,
  "pendingToolName" TEXT,
  "outcome" TEXT,
  "background" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quanty_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "quanty_tasks_userId_updatedAt_idx" ON "quanty_tasks"("userId", "updatedAt");
CREATE INDEX "quanty_tasks_status_updatedAt_idx" ON "quanty_tasks"("status", "updatedAt");

CREATE TABLE "quanty_task_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "toolName" TEXT,
  "stepId" TEXT,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quanty_task_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "quanty_task_events_taskId_createdAt_idx" ON "quanty_task_events"("taskId", "createdAt");
CREATE INDEX "quanty_task_events_userId_createdAt_idx" ON "quanty_task_events"("userId", "createdAt");

CREATE TABLE "quanty_approval_records" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "taskId" TEXT,
  "label" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quanty_approval_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "quanty_approval_records_userId_grantedAt_idx" ON "quanty_approval_records"("userId", "grantedAt");
