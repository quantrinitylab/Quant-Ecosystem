import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { CrossAppOrchestrator } from '@quant/quant-tools';
import {
  AutomationService,
  type ActionDispatcher,
  type AutomationAction,
} from '../services/automation.service';

const triggerSchema = z.object({
  type: z.enum(['schedule', 'event', 'condition', 'webhook', 'manual']),
  config: z.record(z.unknown()).default({}),
  schedule: z.string().optional(),
  event: z.string().optional(),
  condition: z.string().optional(),
  webhook: z.object({ url: z.string(), secret: z.string() }).optional(),
});

const actionSchema = z.object({
  id: z.string().optional(),
  type: z.string().min(1).max(100),
  app: z.string().max(100).optional(),
  params: z.record(z.unknown()).default({}),
  order: z.number().int().min(0).default(0),
  retryOnFail: z.boolean().default(false),
  timeout: z.number().int().positive().max(600000).default(30000),
});

const conditionSchema = z.object({
  field: z.string(),
  operator: z.enum(['equals', 'not-equals', 'contains', 'gt', 'lt', 'exists']),
  value: z.unknown(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  trigger: triggerSchema,
  actions: z.array(actionSchema).max(50).optional(),
  conditions: z.array(conditionSchema).max(50).optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  trigger: triggerSchema.optional(),
  actions: z.array(actionSchema).max(50).optional(),
  conditions: z.array(conditionSchema).max(50).optional(),
  isActive: z.boolean().optional(),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

/**
 * Build an ActionDispatcher backed by the cross-app tool orchestrator decorated
 * on the app at boot. Each automation action is dispatched as a single tool
 * execution (action.type -> toolId). When the orchestrator is unavailable the
 * dispatcher is omitted, and the service records steps as failed (NO_DISPATCHER)
 * rather than fabricating success.
 */
function buildDispatcher(fastify: FastifyInstance): ActionDispatcher | undefined {
  const orchestrator = (fastify as unknown as { quantTools?: CrossAppOrchestrator }).quantTools;
  if (!orchestrator) return undefined;

  return {
    async dispatch(action: AutomationAction, ctx) {
      const executor = orchestrator.getExecutor();
      const context = orchestrator.getContextManager().buildExecutionContext(ctx.userId, ctx.runId);
      const result = await executor.executeSingle(action.type, action.params, context);
      return {
        success: result.success,
        output: result.data,
        ...(result.error ? { error: result.error } : {}),
      };
    },
  };
}

/**
 * QuantAI automation routes (mounted under /automations). Persisted, per-user
 * automations backed by AutomationService -> AiAutomation, with durable
 * execution runs (AiAutomationRun). Previously this API had no backend at all.
 */
export default async function automationRoutes(fastify: FastifyInstance) {
  function getService(): AutomationService {
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    return new AutomationService(prisma as never, buildDispatcher(fastify));
  }

  // GET /automations - list the current user's automations
  fastify.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().list(userId);
    return reply.send({ success: true, data });
  });

  // GET /automations/:id - fetch a single automation
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().get(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // POST /automations - create a new automation
  fastify.post('/', async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().create(userId, parsed.data);
    return reply.status(201).send({ success: true, data });
  });

  // PUT /automations/:id - update an automation
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = getUserId(request);
    const data = await getService().update(request.params.id, userId, parsed.data);
    return reply.send({ success: true, data });
  });

  // POST /automations/:id/toggle - flip the active flag
  fastify.post<{ Params: { id: string } }>('/:id/toggle', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().toggle(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // POST /automations/:id/execute - run the automation now (durable run)
  fastify.post<{ Params: { id: string } }>('/:id/execute', async (request, reply) => {
    const userId = getUserId(request);
    const data = await getService().execute(request.params.id, userId);
    return reply.send({ success: true, data });
  });

  // DELETE /automations/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    await getService().delete(request.params.id, userId);
    return reply.send({ success: true });
  });
}
