// ============================================================================
// QuantCooks CP-1 — OpenAPI generation (§2.4). The document is GENERATED
// from the registry at runtime (zod → JSON Schema via the local
// converter), served at GET /tools/openapi.json, and covers the /tools +
// /jobs surface. The pre-existing UI REST routes are documented by the
// P0-2 contract inventory, not retro-documented here. A test pins the
// tool-name set (§13.8) so adding/removing a tool is a deliberate diff.
// ============================================================================

import type { ToolRegistry } from './registry';
import { pricingRuleFor } from './pricing';
import { zodToJsonSchema } from './json-schema';

export function buildOpenApiDocument(registry: ToolRegistry) {
  const tools = registry.list().map((def) => {
    const summary = registry.summary(def);
    return {
      name: def.name,
      group: def.group,
      description: def.description,
      mode: def.mode,
      tier: def.tier,
      permissionTier: def.permissionTier,
      availability: summary.availability,
      ...(summary.notConfiguredReason
        ? { notConfiguredReason: summary.notConfiguredReason }
        : {}),
      pricing: pricingRuleFor(def.name),
      inputSchema: zodToJsonSchema(def.inputSchema),
      outputSchema: zodToJsonSchema(def.outputSchema),
    };
  });

  return {
    openapi: '3.1.0',
    info: {
      title: 'QuantCooks Tools API',
      version: '1.0.0',
      description:
        'The QuantAI-facing surface of QuantCooks: every registered tool with its schemas, pricing rule and availability, plus the unified job reads. One registry generates this document, the REST endpoints, the quant-tools definitions and the MCP tools/list — no second catalogue exists.',
    },
    paths: {
      '/tools': {
        get: {
          summary: 'List all registered tools with availability',
          operationId: 'listTools',
        },
      },
      '/tools/openapi.json': {
        get: { summary: 'This document', operationId: 'getOpenApiDocument' },
      },
      '/tools/{name}': {
        get: {
          summary: 'One tool: full input/output JSON Schema, pricing rule, examples',
          operationId: 'getTool',
        },
      },
      '/tools/{name}/quote': {
        post: {
          summary: 'Quote a tool’s exact params (never executes, never reserves)',
          operationId: 'quoteTool',
        },
      },
      '/tools/{name}/invoke': {
        post: {
          summary:
            'Invoke a tool: { params, quoteId?, idempotencyKey? } → sync result or { job }',
          operationId: 'invokeTool',
        },
      },
      '/jobs': {
        get: {
          summary: 'The caller’s unified jobs, newest first (?projectId=&kind=&status=)',
          operationId: 'listJobs',
        },
      },
      '/jobs/{id}': {
        get: { summary: 'One unified job (owner-scoped)', operationId: 'getJob' },
      },
      '/jobs/{id}/cancel': {
        post: {
          summary: 'Cancel a QUEUED job (→ FAILED, USER_CANCELLED)',
          operationId: 'cancelJob',
        },
      },
    },
    'x-quantcooks-tools': tools,
  };
}
