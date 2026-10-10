// ============================================================================
// QuantyToolDescriptor mapping (canonical shape from @quant/quanty-contracts)
//
// Every tool registered in quant-tools' ToolRegistry gets a canonical
// QuantyToolDescriptor (riskTier 0–4, confirmationPolicy, idempotencyPolicy,
// verificationStrategy) plus a JSON-Schema input schema for MCP `tools/list`.
// The registry's ToolDefinition stays the internal shape; the descriptor is
// what the MCP gateway publishes and enforces.
// ============================================================================

import type { QuantyToolDescriptor } from '@quant/quanty-contracts';
import type { PermissionTier, ToolDefinition, ToolInputSchema } from '../types.js';

export interface McpJsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  description?: string;
  default?: unknown;
}

export interface McpJsonSchema {
  type: 'object';
  properties: Record<string, McpJsonSchemaProperty>;
  required: string[];
  additionalProperties: boolean;
}

/** Internal ToolInputSchema → JSON Schema (what MCP `tools/list` publishes). */
export function toMcpInputSchema(input: ToolInputSchema): McpJsonSchema {
  const properties: Record<string, McpJsonSchemaProperty> = {};
  const required: string[] = [];

  for (const [key, def] of Object.entries(input)) {
    properties[key] = {
      type: def.type,
      description: def.description,
      ...(def.default !== undefined ? { default: def.default } : {}),
    };
    if (def.required) {
      required.push(key);
    }
  }

  return { type: 'object', properties, required, additionalProperties: false };
}

/**
 * Internal PermissionTier (0–3) → canonical riskTier (0–4).
 * quant-tools maxes at tier 3 (destructive/admin); tier 4 (cross-tenant /
 * systemic) is reserved and currently unmapped — any future tier-4 tools map
 * 1:1.
 */
export function toRiskTier(tier: PermissionTier): 0 | 1 | 2 | 3 | 4 {
  return tier;
}

/** Canonical descriptor for one registry tool definition. */
export function toToolDescriptor(def: ToolDefinition): QuantyToolDescriptor {
  const riskTier = toRiskTier(def.permissionTier);

  return {
    toolId: def.id,
    ownerProduct: def.appId,
    version: '1.0.0',
    capability: def.id,
    resourceScope: [def.appId],
    inputSchema: toMcpInputSchema(def.inputSchema),
    outputSchema: def.outputSchema,
    riskTier,
    confirmationPolicy:
      riskTier >= 3 ? 'always' : riskTier >= 2 ? 'conditional' : 'never',
    timeoutMs: 20000,
    retryPolicy: { maxAttempts: 2, backoffMs: 500 },
    // Destructive/write calls must be retry-safe (plan P1-1); reads skip it.
    idempotencyPolicy: riskTier >= 2 ? 'required' : riskTier === 1 ? 'optional' : 'none',
    verificationStrategy: def.undoRecipe
      ? `compensation:${def.undoRecipe.toolId}`
      : riskTier >= 2
        ? 'read-back'
        : 'none',
    auditPolicy: riskTier >= 1 ? 'all' : 'sampled',
    ...(def.undoRecipe ? { compensationRef: def.undoRecipe.toolId } : {}),
  };
}
