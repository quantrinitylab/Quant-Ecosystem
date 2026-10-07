-- Quanty MCP production grant store: external OAuth connections (e.g. Gmail)
-- plus an audit trail for grant lifecycle events.
-- Refresh tokens are stored ONLY as AES-256-GCM encrypted blobs; plaintext
-- tokens never touch these tables.

CREATE TABLE "mcp_connections" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'connected',
  "encrypted_tokens" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "account_email" TEXT,
  "account_label" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_refreshed_at" TIMESTAMP(3),
  "last_tested_at" TIMESTAMP(3),
  "last_test_ok" BOOLEAN,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mcp_connections_user_id_provider_key" ON "mcp_connections"("user_id", "provider");
CREATE INDEX "mcp_connections_user_id_idx" ON "mcp_connections"("user_id");
CREATE INDEX "mcp_connections_provider_status_idx" ON "mcp_connections"("provider", "status");

CREATE TABLE "mcp_grant_audit" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "detail" TEXT,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mcp_grant_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mcp_grant_audit_user_id_provider_idx" ON "mcp_grant_audit"("user_id", "provider");
CREATE INDEX "mcp_grant_audit_created_at_idx" ON "mcp_grant_audit"("created_at");
