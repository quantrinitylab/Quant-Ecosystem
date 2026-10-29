// ============================================================================
// QuantCooks CP-1 — the /tools REST surface (§2.4). Thin: every handler
// resolves the app's ToolRegistry and calls quote/invoke; all policy
// (delegation, confirmation, consent, pricing) lives in the registry
// pipeline, so the REST surface cannot drift from the QuantAI/MCP/CLI
// surfaces. Auth is the standard JWT (requireUserId) — direct
// user-context invokes of Tier A tools work here; agent/delegated
// invokes refuse with DELEGATION_NOT_CONFIGURED until CP-3 (§8).
//
// Test seam: a decorated `toolRegistry` wins (fastify.toolRegistry);
// otherwise the registry is built once from the decorated prisma +
// storage port exactly as production does.
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createAppError } from '@quant/server-core';
import { buildToolRegistry, logToolAvailability } from '../tools/index';
import type { ToolRegistry } from '../tools/registry';
import { pricingRuleFor } from '../tools/pricing';
import { zodToJsonSchema } from '../tools/json-schema';
import { buildOpenApiDocument } from '../tools/openapi';
import { contextFromRequest } from '../tools/context';
import { resolveStoragePort } from './storage-port';

// Same local helper every route module carries (request.auth is populated
// by server-core's auth plugin): the caller's user id or a 401.
function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

export default async function toolsRoutes(fastify: FastifyInstance) {
  let cached: ToolRegistry | null = null;

  async function getRegistry(): Promise<ToolRegistry> {
    const decorated = (fastify as unknown as { toolRegistry?: ToolRegistry }).toolRegistry;
    if (decorated) return decorated;
    if (cached) return cached;
    const storage = await resolveStoragePort(fastify);
    const { registry } = buildToolRegistry({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma: (fastify as any).prisma,
      storage,
    });
    cached = registry;
    logToolAvailability(registry, (message) => fastify.log.info(message));
    return registry;
  }

  fastify.get('/', async () => {
    const registry = await getRegistry();
    return { tools: registry.summaries() };
  });

  // Declared before '/:name' so 'openapi.json' is not read as a tool name.
  fastify.get('/openapi.json', async () => {
    const registry = await getRegistry();
    return buildOpenApiDocument(registry);
  });

  fastify.get('/:name', async (request: FastifyRequest) => {
    requireUserId(request);
    const registry = await getRegistry();
    const { name } = request.params as { name: string };
    const def = registry.get(name);
    if (!def) {
      throw createAppError(`Unknown tool: ${name}`, 404, 'TOOL_NOT_FOUND');
    }
    return {
      ...registry.summary(def),
      description: def.description,
      inputSchema: zodToJsonSchema(def.inputSchema),
      outputSchema: zodToJsonSchema(def.outputSchema),
      pricing: pricingRuleFor(def.name),
      ...(def.notConfiguredCode ? { notConfiguredCode: def.notConfiguredCode } : {}),
      example: def.example?.input ?? null,
    };
  });

  fastify.post('/:name/quote', async (request: FastifyRequest) => {
    const userId = requireUserId(request);
    const registry = await getRegistry();
    const { name } = request.params as { name: string };
    const params =
      request.body && typeof request.body === 'object' ? (request.body as unknown) : {};
    return registry.quote(name, params, contextFromRequest(request, 'ui', userId));
  });

  fastify.post('/:name/invoke', async (request: FastifyRequest, reply) => {
    const userId = requireUserId(request);
    const registry = await getRegistry();
    const { name } = request.params as { name: string };
    const body = (request.body ?? {}) as {
      params?: unknown;
      quoteId?: string;
      idempotencyKey?: string;
    };
    const params = 'params' in body ? body.params : body;
    const result = await registry.invoke(
      name,
      params,
      contextFromRequest(request, 'ui', userId),
      {
        ...(body.quoteId ? { quoteId: body.quoteId } : {}),
        ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      },
    );
    // Async invokes create a job → 201; sync results → 200.
    const created = typeof result === 'object' && result !== null && 'job' in result;
    return reply.code(created ? 201 : 200).send(result);
  });
}
