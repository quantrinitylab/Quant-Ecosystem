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
import { buildQuantyGmailTools, type QuantyGmailToolsDeps } from './gmail-tools';

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
