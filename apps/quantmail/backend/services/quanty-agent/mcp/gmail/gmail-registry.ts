// ============================================================================
// Quanty agent — Gmail MCP tool registration
// ============================================================================
//
// PURPOSE
//   Registers the Gmail MCP tools (./gmail-tools.ts) onto a Quanty
//   ToolRegistry, alongside the internal mail/git tools. Two entry points:
//
//     - buildGmailToolRegistry(deps)  — fresh registry with ONLY Gmail tools
//     - registerGmailTools(registry, deps) — add Gmail tools to an existing
//       (possibly cross-app) registry
//
// WIRING (backend app.ts — sketch, not executed here):
//
//   import { GmailOAuth, InMemoryGmailGrantStore, EnvKeyTokenCipher,
//            gmailOAuthConfigFromEnv } from './mcp/gmail/gmail-oauth';
//   import { GmailMcpClient, GmailRestTransport } from './mcp/gmail/gmail-mcp-client';
//
//   const oauth = new GmailOAuth({
//     config: gmailOAuthConfigFromEnv(),
//     grantStore: new PrismaGmailGrantStore(prisma), // production
//     cipher: new EnvKeyTokenCipher(process.env.GMAIL_TOKEN_ENCRYPTION_KEY!),
//   });
//
//   registerGmailTools(registry, {
//     getClient: async (userId) => {
//       const token = await oauth.getAccessToken(userId);
//       if (!token) return null; // not connected -> tools return "connect" msg
//       const transport = new GmailRestTransport({ getAccessToken: async () => token });
//       const client = new GmailMcpClient({ transport });
//       await client.connect();
//       return client;
//     },
//   });
//
// SECURITY
//   * The access token is captured in the getAccessToken closure — it never
//     appears in tool args, audit logs, or error messages.
//   * gmail_send is destructive + requiresConfirmation: the agent runtime
//     MUST NOT invoke it without explicit user approval of the exact
//     recipient/subject/body.

import { ToolRegistry } from '@quant/ai';
import type { ToolRegistry as ToolRegistryType } from '@quant/ai';
import type { AITool, AIToolResult, AssistantContext } from '@quant/ai';
import {
  buildQuantyGmailTools,
  type QuantyGmailTool,
  type QuantyGmailToolsDeps,
} from './gmail-tools';

export type { QuantyGmailToolsDeps };
export { buildQuantyGmailTools };

/** Build a fresh ToolRegistry containing only the Gmail MCP tools. */
export function buildGmailToolRegistry(deps: QuantyGmailToolsDeps): ToolRegistryType {
  const registry = new ToolRegistry();
  registerGmailTools(registry, deps);
  return registry;
}

/** Register the Gmail MCP tools onto an existing ToolRegistry.
 *
 * Gmail is an external integration surfaced through QuantMail's Quanty, so
 * the tools register under the 'quantmail' app namespace. Names are already
 * `gmail_`-prefixed, so they cannot collide with the internal mail tools.
 */
export function registerGmailTools(registry: ToolRegistryType, deps: QuantyGmailToolsDeps): void {
  registry.registerApp('quantmail', buildQuantyGmailTools(deps));
}

// ---------------------------------------------------------------------------
// Production registration (Q2): mcp.gmail.* namespaced tools
// ---------------------------------------------------------------------------

/**
 * Task-level confirmation gate for destructive tools. The agent runtime
 * (e.g. #482's executor) supplies the real implementation that asks the
 * user to approve the exact action. MUST never auto-resolve to true —
 * fail closed (deny) when no gate is wired.
 */
export type McpConfirmGate = (
  toolName: string,
  args: Record<string, unknown>,
  context: AssistantContext,
) => Promise<boolean>;

export interface McpGmailProductionDeps extends QuantyGmailToolsDeps {
  /**
   * Per-connection kill switch. When it resolves false for a user, every
   * mcp.gmail.* tool reports itself unavailable (honest, no fake results).
   */
  isConnectionEnabled?: (userId: string) => Promise<boolean>;
  /**
   * Confirmation gate for destructive tools (mcp.gmail.send). Invoked BEFORE
   * the tool handler runs. When omitted, destructive tools are DENIED —
   * the runtime must wire a real user-approval flow (see #482 confirm gate).
   */
  confirmGate?: McpConfirmGate;
}

const MCP_GMAIL_TOOL_PREFIX = 'mcp.gmail.';

function toMcpName(legacyName: string): string {
  return `${MCP_GMAIL_TOOL_PREFIX}${legacyName.replace(/^gmail_/, '')}`;
}

function notAvailableResult(toolName: string): AIToolResult {
  return {
    success: false,
    error: 'gmail_not_connected',
    displayMessage:
      `Gmail is not connected or is disabled for this account, so ${toolName} is unavailable. ` +
      'Connect Gmail in the Quanty Connectors screen to enable it.',
  };
}

function confirmationDeniedResult(toolName: string): AIToolResult {
  return {
    success: false,
    error: 'confirmation_required',
    displayMessage:
      `${toolName} changes your Gmail account, so it needs your explicit approval first. ` +
      'The action was not performed.',
  };
}

/**
 * Register production Gmail MCP tools under `mcp.gmail.*` names.
 *
 * Two safety layers wrap every tool:
 *  1. Connection gate — the per-connection `enabled` flag (and grant
 *     presence) is checked on every invocation; disabled → honest
 *     "unavailable" result, never a fake success.
 *  2. Confirm gate — destructive tools (send) go through `confirmGate`
 *     BEFORE executing. No gate wired → deny (fail closed). Auto-resolve
 *     to true is forbidden.
 *
 * Tools register under the 'quantmail' app namespace (the host app);
 * the `mcp.gmail.*` tool-name prefix provides provider namespacing per
 * the MCP architecture (docs/quanty-mcp-architecture.md).
 */
export function registerMcpGmailTools(
  registry: ToolRegistryType,
  deps: McpGmailProductionDeps,
): void {
  const baseTools: QuantyGmailTool[] = buildQuantyGmailTools(deps);
  const isEnabled = deps.isConnectionEnabled ?? (async () => true);
  const confirmGate = deps.confirmGate;

  const wrapped: AITool[] = baseTools.map((tool) => {
    const mcpName = toMcpName(tool.name);
    const originalHandler = tool.handler;
    return {
      name: mcpName,
      description: tool.description,
      parameters: tool.parameters,
      handler: async (
        args: Record<string, unknown>,
        context: AssistantContext,
      ): Promise<AIToolResult> => {
        // Layer 1: connection gate.
        const enabled = await isEnabled(context.userId).catch(() => false);
        if (!enabled) return notAvailableResult(mcpName);

        // Layer 2: confirm gate for destructive tools — fail closed.
        if (tool.destructive || tool.requiresConfirmation) {
          const confirmed = confirmGate
            ? await confirmGate(mcpName, args, context).catch(() => false)
            : false;
          if (!confirmed) return confirmationDeniedResult(mcpName);
        }

        return originalHandler(args, context);
      },
    };
  });

  registry.registerApp('quantmail', wrapped);
}

/** Build a fresh ToolRegistry containing only the production mcp.gmail.* tools. */
export function buildMcpGmailToolRegistry(deps: McpGmailProductionDeps): ToolRegistryType {
  const registry = new ToolRegistry();
  registerMcpGmailTools(registry, deps);
  return registry;
}

