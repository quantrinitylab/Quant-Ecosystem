-- CreateTable: QuantTrinity owner control-plane state (previously the
-- in-memory globalThis.__trinity store). A single durable document
-- (id = 'singleton') holding team, app registry, model registry, payouts,
-- revenue, reports and the audit trail as a serialized JSON document.
CREATE TABLE "trinity_control_state" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trinity_control_state_pkey" PRIMARY KEY ("id")
);
