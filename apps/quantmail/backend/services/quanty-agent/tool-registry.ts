// ============================================================================
// Quanty agent — tool registry (integration layer)
// ============================================================================
//
// PURPOSE
//   The single registry the Quanty agentic engine (planner + executor) reads.
//   It used to be populated by `registerBuiltinTools()` — a set of STUB
//   handlers that described what they *would* do and returned fabricated
//   results. Those stubs are gone. This module now registers the REAL tools:
//
//     - mail.*  — adapted from `./tools/mail-tools.ts` (real EmailService /
//                 ThreadService implementations) plus real composite tools
//                 from `./tools/composite-mail-tools.ts`
//     - git.*   — adapted from `./tools/git-tools.ts` (real Prisma/git-backed)
//
//   Every tool id is namespaced (`mail.searchEmails`, `git.listRepos`, ...).
//   Every side-effect flows through the QuantMail backend's scoped services —
//   never by reaching around them — and every call is userId-scoped.
//
// SAFETY INVARIANTS
//   * USER SCOPING: handlers derive userId from the tool context (never from
//     tool args). Services throw 403 on cross-user rows.
//   * REAL CONSENT: a tool whose source metadata says `requiresConfirmation`
//     / `needsConfirm` is registered with `destructive: true`, which makes the
//     executor pause the task in `waiting-confirm` until the user taps
//     "Haan, karo" or "Rehne do". There is no auto-resolve anywhere.
//   * NO FABRICATION: handlers return honest errors, never invented content.
//
// COMPAT
//   `buildQuantyMailToolRegistry` / `registerQuantyMailTools` are kept for the
//   `@quant/ai`-shaped registry consumers (and their tests); the engine
//   itself uses `registerRealTools`.

import { ToolRegistry } from '@quant/ai';
import type { AITool, AIToolParameter, AssistantContext } from '@quant/ai';
import { buildQuantyMailTools } from './tools/mail-tools';
import type { QuantyMailTool, QuantyMailToolsDeps, MailAuditEntry } from './tools/mail-tools';
import { buildCompositeMailTools } from './tools/composite-mail-tools';
import { GIT_TOOLS } from './tools/git-tools';
import type { QuantyTool as GitQuantyTool, GitToolsPrisma } from './tools/git-tools';
import type {
  QuantyTool,
  QuantyToolApp,
  QuantyToolContext,
  QuantyToolParam,
  QuantyToolResult,
} from './types';

// ---------------------------------------------------------------------------
// Core module-level registry (planner + executor read this)
// ---------------------------------------------------------------------------

const tools = new Map<string, QuantyTool>();

/**
 * Register a tool. Throws if a tool with the same name is already registered —
 * duplicate registrations are a wiring bug, not something to silently merge.
 */
export function registerTool(tool: QuantyTool): void {
  if (!tool.name || typeof tool.name !== 'string') {
    throw new Error('QuantyTool must have a non-empty name');
  }
  if (tools.has(tool.name)) {
    throw new Error(`QuantyTool "${tool.name}" is already registered`);
  }
  if (typeof tool.handler !== 'function') {
    throw new Error(`QuantyTool "${tool.name}" must have a handler function`);
  }
  tools.set(tool.name, tool);
}

/** Register several tools at once. */
export function registerTools(list: QuantyTool[]): void {
  for (const tool of list) registerTool(tool);
}

/** Look up a tool by name. Returns undefined when unknown. */
export function getTool(name: string): QuantyTool | undefined {
  return tools.get(name);
}

/** All registered tools, sorted by name for deterministic planning. */
export function listTools(): QuantyTool[] {
  return [...tools.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Tools for one app surface only. */
export function listToolsByApp(app: QuantyToolApp): QuantyTool[] {
  return listTools().filter((t) => t.app === app);
}

/** Names only — cheap capability listing for the planner/LLM prompt. */
export function listToolNames(): string[] {
  return listTools().map((t) => t.name);
}

/** Clear the registry. Intended for tests only. */
export function clearTools(): void {
  tools.clear();
}

// ---------------------------------------------------------------------------
// @quant/ai-shaped registry (compat — kept for existing consumers/tests)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Adapters: real tool definitions -> engine QuantyTool
// ---------------------------------------------------------------------------

function toCoreParam(p: AIToolParameter | { type: string; description: string; required: boolean; enum?: string[] }): QuantyToolParam {
  const t = p.type === 'number' || p.type === 'boolean' || p.type === 'array' || p.type === 'object'
    ? p.type
    : 'string';
  return { type: t, description: p.description, required: p.required === true, enum: p.enum };
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function assistantContextFor(ctx: QuantyToolContext): AssistantContext {
  return {
    userId: ctx.userId,
    currentApp: 'quantmail',
    conversationHistory: [],
    crossAppState: { taskId: ctx.taskId },
  };
}

/** Adapt one real @quant/ai mail tool into an engine tool (`mail.*`). */
function adaptMailTool(tool: QuantyMailTool): QuantyTool {
  const aiTool: AITool = tool;
  return {
    name: `mail.${snakeToCamel(tool.name)}`,
    app: 'mail',
    description: tool.description,
    parameters: Object.fromEntries(
      Object.entries(tool.parameters).map(([k, v]) => [k, toCoreParam(v)]),
    ),
    // requiresConfirmation is the consent gate: send_email, delete_thread.
    destructive: tool.requiresConfirmation === true,
    reversible: tool.reversible === true,
    handler: async (args, ctx): Promise<QuantyToolResult> => {
      const res = await aiTool.handler(args, assistantContextFor(ctx));
      return {
        ok: res.success,
        data: res.data,
        summary: res.success
          ? res.displayMessage
          : res.error || res.displayMessage || 'Tool failed',
        reversible: tool.reversible === true,
      };
    },
  };
}

/** Adapt one real git tool into an engine tool (`git.*`). */
function adaptGitTool(tool: GitQuantyTool): QuantyTool {
  return {
    name: `git.${snakeToCamel(tool.name)}`,
    app: 'git',
    description: tool.description,
    parameters: Object.fromEntries(
      Object.entries(tool.parameters).map(([k, v]) => [
        k,
        toCoreParam({ type: v.type, description: v.description, required: v.required === true, enum: v.enum }),
      ]),
    ),
    // needsConfirm is the consent gate: merge_pr.
    destructive: tool.needsConfirm === true,
    reversible: tool.reversible === true,
    handler: async (args, ctx): Promise<QuantyToolResult> => {
      const res = await tool.handler(args, {
        userId: ctx.userId,
        prisma: ctx.prisma as GitToolsPrisma,
      });
      return {
        ok: res.success,
        data: res.data,
        summary: res.success ? res.message : res.error || res.message || 'Tool failed',
        reversible: tool.reversible === true,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Real tool registration — replaces the old stub registerBuiltinTools()
// ---------------------------------------------------------------------------

/**
 * Register the REAL mail + git tools into the engine registry.
 * Call once at backend boot (see routes/quanty-agent.ts). Throws on duplicate
 * registration — boot it exactly once per process.
 *
 * After this call the planner's rules resolve to live implementations:
 * `mail.archiveUnread`, `mail.sendEmail`, `git.listRepos`, ...
 */
export function registerRealTools(deps: QuantyMailToolsDeps): void {
  const mailTools = buildQuantyMailTools(deps);
  registerTools(mailTools.map(adaptMailTool));
  registerTools(GIT_TOOLS.map(adaptGitTool));
  registerTools(buildCompositeMailTools(deps));
}

export type { QuantyMailToolsDeps, MailAuditEntry };
