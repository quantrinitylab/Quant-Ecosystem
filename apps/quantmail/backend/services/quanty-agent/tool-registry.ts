// ============================================================================
// Quanty agent — tool registry for QuantMail mail tools
// ============================================================================
//
// PURPOSE
//   Builds (or populates) a {@link ToolRegistry} containing ONLY the
//   Quanty mail tools defined in `./tools/mail-tools.ts`. Every side-effect
//   flows through the QuantMail backend's scoped services (`EmailService`,
//   `ThreadService`) — never by reaching around them — and every call is
//   userId-scoped and audit-logged.
//
//   Two entry points (mirrors the `modules/agent` QuantCode pattern):
//     - buildQuantyMailToolRegistry(deps) — fresh registry with mail tools
//     - registerQuantyMailTools(registry, deps) — add mail tools to an
//       existing (possibly cross-app) registry
//
// SAFETY INVARIANTS ENFORCED BY THE TOOLS THEMSELVES
//   * USER SCOPING: every handler derives userId from the AssistantContext
//     and passes it to the underlying service; services throw 403 on
//     cross-user access. No tool accepts a userId argument.
//   * DESTRUCTIVE GATING: tools carry `destructive` / `reversible` /
//     `requiresConfirmation` metadata; the agent runtime must prompt the
//     user before invoking a tool with `requiresConfirmation: true`
//     (send_email, delete_thread).
//   * AUDIT TRAIL: every invocation (success or failure) is logged with
//     tool name, userId, sanitized args and outcome.

import { ToolRegistry } from '@quant/ai';
import { buildQuantyMailTools } from './tools/mail-tools';
import type { QuantyMailToolsDeps } from './tools/mail-tools';

/**
 * Build a fresh {@link ToolRegistry} containing only the Quanty mail tools.
 */
export function buildQuantyMailToolRegistry(deps: QuantyMailToolsDeps): ToolRegistry {
  const registry = new ToolRegistry();
  registerQuantyMailTools(registry, deps);
  return registry;
}

/**
 * Register the Quanty mail tools onto an existing {@link ToolRegistry}
 * (e.g. a cross-app registry shared with calendar/drive/contacts tools).
 */
export function registerQuantyMailTools(
  registry: ToolRegistry,
  deps: QuantyMailToolsDeps,
): void {
  registry.registerApp('quantmail', buildQuantyMailTools(deps));
}
