// ============================================================================
// QuantCooks CP-1 — the @quant/quant-tools bridge (§2.3, K9). CP-1 does
// NOT invent a parallel agent layer: per registered tool this adapter
// derives a package ToolDefinition and registers a ToolExecutor handler
// that builds a ToolContext and calls registry invoke — the backend
// services stay the single implementation, the package stays the single
// agent-facing contract.
//
// Surface discipline (§7.1/§8): the bridge is built per transport with a
// fixed surface. An in-process QuantAI bridge for the user's own session
// carries no agentId (a direct user-context invoke — Tier A tools work).
// The MCP/CLI bridges carry an agentId: those invokes CLAIM an agent
// identity, and until CP-3 ships delegation verification the registry
// refuses them with DELEGATION_NOT_CONFIGURED. Same registry, same
// error vocabulary, on every surface (§9.4).
//
// Divergence note (§2.3): the package executor generates its own
// executionId for ToolResult; the registry invoke's audit id rides in
// the result data envelope (`auditId`), which is the id CP-3's events
// will join on.
// ============================================================================

import {
  ToolRegistry as PkgToolRegistry,
  ToolExecutor,
  type ToolDefinition as PkgToolDefinition,
  type PermissionTier,
} from '@quant/quant-tools';
import type { ToolRegistry } from './registry';
import type { ToolContext } from './context';
import { pricingRuleFor, costEstimateFor } from './pricing';
import { zodToFieldMap, zodToJsonSchema } from './json-schema';

export interface QuantToolsBridge {
  pkgRegistry: PkgToolRegistry;
  executor: ToolExecutor;
  definitions: PkgToolDefinition[];
}

export function buildQuantToolsBridge(
  registry: ToolRegistry,
  opts: { surface: 'quantai' | 'mcp' | 'cli'; agentId?: string },
): QuantToolsBridge {
  const pkgRegistry = new PkgToolRegistry();
  const executor = new ToolExecutor();
  const definitions: PkgToolDefinition[] = [];

  for (const def of registry.list()) {
    const outputJson = zodToJsonSchema(def.outputSchema) as {
      properties?: Record<string, { type?: string }>;
    };
    const fields: Record<string, { type: string; description: string }> = {};
    for (const [key, prop] of Object.entries(outputJson.properties ?? {})) {
      fields[key] = { type: typeof prop.type === 'string' ? prop.type : 'object', description: key };
    }

    const pkgDef: PkgToolDefinition = {
      id: def.name,
      appId: 'quantcooks',
      name: def.name,
      description: def.description,
      inputSchema: zodToFieldMap(def.inputSchema),
      outputSchema: {
        type: 'object',
        description: `${def.name} result envelope (tool, auditId, plus the tool's own fields)`,
        fields,
      },
      permissionTier: def.permissionTier as PermissionTier,
      costEstimate: costEstimateFor(pricingRuleFor(def.name)),
      undoRecipe: null, // §2.3: undo semantics are per-tool product decisions; never fabricated
      tags: [def.group, def.tier === 'A' ? 'live' : 'fail-closed'],
    };
    definitions.push(pkgDef);
    pkgRegistry.register(pkgDef);

    executor.registerHandler(def.name, async (params, execCtx) => {
      const ctx: ToolContext = {
        actorUserId: execCtx.userId,
        surface: opts.surface,
        ...(opts.agentId ? { agentId: opts.agentId } : {}),
        scopes: [],
        confirmedToolIds: execCtx.confirmedToolIds,
        ...(execCtx.metadata?.['quantyTaskId']
          ? { quantyTaskId: execCtx.metadata['quantyTaskId'] }
          : {}),
      };
      try {
        return await registry.invoke(def.name, params, ctx);
      } catch (err) {
        // The package executor surfaces err.message as ToolResult.error;
        // prefix the machine-readable code so hosts keep the registry's
        // exact error vocabulary (§9.4).
        const code = (err as { code?: string }).code;
        if (code && err instanceof Error && !err.message.startsWith(`${code}:`)) {
          throw new Error(`${code}: ${err.message}`);
        }
        throw err;
      }
    });
  }

  return { pkgRegistry, executor, definitions };
}
