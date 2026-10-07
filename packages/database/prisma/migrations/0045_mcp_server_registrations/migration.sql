-- CreateTable: per-user registration of external MCP servers QuantAI bridges to.
CREATE TABLE "mcp_server_registrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "transport" TEXT NOT NULL DEFAULT 'http',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_server_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_server_registrations_userId_name_key" ON "mcp_server_registrations"("userId", "name");
CREATE INDEX "mcp_server_registrations_userId_idx" ON "mcp_server_registrations"("userId");
