// ============================================================================
// MCPServerAdapter — backwards-compatible facade over QuantyMcpServer.
//
// The sketch that lived here (direct tool-name → executor calls, no JSON-RPC)
// is replaced by the protocol-compliant QuantyMcpServer in
// ./mcp-gateway-server.js. This class keeps the old public API so existing
// consumers keep working; new integrations should use QuantyMcpServer
// (Streamable HTTP, tools/list + tools/call, confirmation gating).
//
// BEHAVIOR CHANGE vs the old sketch: riskTier >= 2 tools no longer
// auto-execute. handleRequest returns a failure with a confirmation-required
// error for them — the confirmation flow lives on the gateway's tools/call.
// ============================================================================

import { ToolExecutor } from '../executor/tool-executor.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import type {
  MCPToolEntry,
  PermissionTier,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from '../types.js';
import { QuantyMcpServer, type McpAuthContext } from './mcp-gateway-server.js';

interface AuthResult {
  valid: boolean;
  userId: string;
  tier: PermissionTier;
}

export class MCPServerAdapter {
  private readonly server: QuantyMcpServer;

  constructor(tools: ToolDefinition[], executor: ToolExecutor) {
    const registry = new ToolRegistry();
    for (const tool of tools) {
      registry.register(tool);
    }
    this.server = new QuantyMcpServer(registry, executor);
  }

  registerToken(token: string, userId: string, tier: PermissionTier): void {
    this.server.registerToken(token, userId, tier);
  }

  getCatalog(): MCPToolEntry[] {
    return this.server.getCatalog();
  }

  async handleRequest(
    toolName: string,
    args: Record<string, unknown>,
    token: string,
  ): Promise<ToolResult> {
    const auth = this.authenticate(token);
    if (!auth.valid) {
      return {
        success: false,
        data: null,
        error: 'Authentication failed',
        executionId: '',
        toolId: toolName,
        latencyMs: 0,
      };
    }

    const context: McpAuthContext = { userId: auth.userId, tier: auth.tier, bearer: token, scopes: [] };
    try {
      const outcome = await this.server.dispatchToolCall(toolName, args, context);

      switch (outcome.kind) {
        case 'executed':
          return outcome.result;
        case 'confirmation-required':
          return failure(
            toolName,
            `Confirmation required: '${toolName}' is risk tier ${outcome.approval.riskTier} — ` +
              `confirm via the MCP gateway approval flow (approvalId ${outcome.approval.approvalId}). ` +
              'Destructive actions never auto-execute.',
          );
        case 'confirmation-rejected':
          return failure(
            toolName,
            `Confirmation rejected by user (approval ${outcome.approvalId}). No action was taken.`,
          );
        case 'confirmation-invalid':
          return failure(toolName, outcome.error);
        case 'not-implemented':
          return failure(toolName, outcome.error);
      }
    } catch (e) {
      // dispatchToolCall throws McpRpcError for unknown tool / permissions / params.
      const message = e instanceof Error ? e.message : 'Unknown error';
      return failure(toolName, message);
    }
  }

  authenticate(token: string): AuthResult {
    const auth = this.server.authenticate(token);
    if (!auth) {
      return { valid: false, userId: '', tier: 0 as PermissionTier };
    }
    return { valid: true, userId: auth.userId, tier: auth.tier };
  }
}

function failure(toolId: string, error: string): ToolResult {
  return { success: false, data: null, error, executionId: '', toolId, latencyMs: 0 };
}

// Kept for signature compatibility with the previous sketch's context type.
export type { ToolExecutionContext };
