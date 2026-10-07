// ============================================================================
// QuantAI - External MCP bridge
// ============================================================================
//
// Lets QuantAI act as an MCP CLIENT: register external MCP servers (per user),
// discover their tools, and invoke them. This is the inverse of the existing
// MCPServerAdapter (which EXPOSES Quant's own tools to external clients).
//
// The wire protocol (stdio / streamable-HTTP) is behind a pluggable McpTransport
// port so the whole bridge is sandbox-verifiable. The default NullMcpTransport
// FAILS CLOSED (MCP_TRANSPORT_NOT_CONFIGURED) — it never fabricates a tool list
// or a tool result. A real stdio/HTTP transport is wired in staging.

import { createAppError } from '@quant/server-core';

export type McpTransportKind = 'http' | 'stdio';

export interface McpServerRegistrationRow {
  id: string;
  userId: string;
  name: string;
  endpoint: string;
  transport: string;
  enabled: boolean;
}

/** A tool advertised by an external MCP server. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpInvokeResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}

/** Connection details a transport needs to reach a registered server. */
export interface McpServerTarget {
  endpoint: string;
  transport: McpTransportKind;
}

/**
 * The wire transport to an external MCP server. Real adapters speak the MCP
 * protocol over stdio or streamable-HTTP; the default fails closed.
 */
export interface McpTransport {
  listTools(target: McpServerTarget): Promise<McpTool[]>;
  invokeTool(
    target: McpServerTarget,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<McpInvokeResult>;
}

/** Default transport: no wire protocol configured -> fail closed (never fake). */
export class NullMcpTransport implements McpTransport {
  async listTools(): Promise<McpTool[]> {
    throw createAppError('No MCP transport configured', 503, 'MCP_TRANSPORT_NOT_CONFIGURED');
  }
  async invokeTool(): Promise<McpInvokeResult> {
    throw createAppError('No MCP transport configured', 503, 'MCP_TRANSPORT_NOT_CONFIGURED');
  }
}

export interface McpBridgePrisma {
  mcpServerRegistration: {
    create(args: { data: Record<string, unknown> }): Promise<McpServerRegistrationRow>;
    findMany(args: { where: Record<string, unknown> }): Promise<McpServerRegistrationRow[]>;
    findFirst(args: { where: Record<string, unknown> }): Promise<McpServerRegistrationRow | null>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
  };
}

export interface RegisterServerInput {
  name: string;
  endpoint: string;
  transport?: McpTransportKind;
}

const VALID_TRANSPORTS = new Set<McpTransportKind>(['http', 'stdio']);
const MAX_NAME = 100;
const MAX_ENDPOINT = 2048;

export interface McpBridgeOptions {
  transport?: McpTransport;
}

export class McpBridgeService {
  private readonly transport: McpTransport;

  constructor(
    private readonly prisma: McpBridgePrisma,
    options: McpBridgeOptions = {},
  ) {
    this.transport = options.transport ?? new NullMcpTransport();
  }

  /** Register (or note the conflict of) an external MCP server for a user. */
  async registerServer(
    userId: string,
    input: RegisterServerInput,
  ): Promise<McpServerRegistrationRow> {
    if (!userId) throw createAppError('userId is required', 400, 'USER_ID_REQUIRED');
    const name = input.name?.trim();
    const endpoint = input.endpoint?.trim();
    if (!name || name.length > MAX_NAME) {
      throw createAppError('A valid server name is required', 400, 'INVALID_MCP_NAME');
    }
    if (!endpoint || endpoint.length > MAX_ENDPOINT) {
      throw createAppError('A valid endpoint is required', 400, 'INVALID_MCP_ENDPOINT');
    }
    const transport: McpTransportKind = VALID_TRANSPORTS.has(input.transport as McpTransportKind)
      ? (input.transport as McpTransportKind)
      : 'http';

    const existing = await this.prisma.mcpServerRegistration.findFirst({
      where: { userId, name },
    });
    if (existing) {
      throw createAppError('A server with this name is already registered', 409, 'MCP_NAME_TAKEN');
    }

    return this.prisma.mcpServerRegistration.create({
      data: { userId, name, endpoint, transport, enabled: true },
    });
  }

  /** List a user's registered MCP servers. */
  async listServers(userId: string): Promise<McpServerRegistrationRow[]> {
    return this.prisma.mcpServerRegistration.findMany({ where: { userId } });
  }

  /** Remove a registered server. */
  async unregisterServer(userId: string, name: string): Promise<{ removed: boolean }> {
    const res = await this.prisma.mcpServerRegistration.deleteMany({ where: { userId, name } });
    return { removed: res.count > 0 };
  }

  private async requireServer(userId: string, name: string): Promise<McpServerRegistrationRow> {
    const row = await this.prisma.mcpServerRegistration.findFirst({ where: { userId, name } });
    if (!row) throw createAppError('MCP server not registered', 404, 'MCP_SERVER_NOT_FOUND');
    if (!row.enabled) throw createAppError('MCP server is disabled', 409, 'MCP_SERVER_DISABLED');
    return row;
  }

  private target(row: McpServerRegistrationRow): McpServerTarget {
    return {
      endpoint: row.endpoint,
      transport: row.transport === 'stdio' ? 'stdio' : 'http',
    };
  }

  /** Discover the tools advertised by a registered server (via the transport). */
  async discoverTools(userId: string, name: string): Promise<McpTool[]> {
    const row = await this.requireServer(userId, name);
    return this.transport.listTools(this.target(row));
  }

  /** Invoke a tool on a registered server (via the transport). */
  async invokeTool(
    userId: string,
    name: string,
    tool: string,
    args: Record<string, unknown> = {},
  ): Promise<McpInvokeResult> {
    if (!tool?.trim()) throw createAppError('A tool name is required', 400, 'INVALID_MCP_TOOL');
    const row = await this.requireServer(userId, name);
    return this.transport.invokeTool(this.target(row), tool, args);
  }
}
