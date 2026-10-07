// ============================================================================
// QuantAI — Fastify Routes: Autonomous Scheduled Agents & Background Crons
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  ScheduledTasksService,
  parseNaturalLanguageTrigger,
  type ScheduledTaskStatus,
} from '../services/scheduled-tasks.service';

const createScheduledTaskSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    description: z.string().max(1000).optional(),
    cronExpression: z.string().optional(),
    nlPrompt: z.string().min(3).max(1000).optional(),
    agentId: z.string().optional(),
    actionPrompt: z.string().min(1).max(10000).optional(),
    targetApp: z.string().optional(),
    targetApps: z.array(z.string()).optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((data) => !!(data.cronExpression || data.nlPrompt), {
    message: 'Either cronExpression or nlPrompt must be provided',
  });

const updateScheduledTaskSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional(),
  cronExpression: z.string().optional(),
  actionPrompt: z.string().min(1).max(10000).optional(),
  targetApp: z.string().optional(),
  targetApps: z.array(z.string()).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']).optional(),
  config: z.record(z.unknown()).optional(),
});

const queryScheduledTasksSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']).optional(),
  agentId: z.string().optional(),
  targetApp: z.string().optional(),
});

const parseNlTriggerSchema = z.object({
  nlPrompt: z.string().min(3).max(1000),
});

export default async function scheduledTasksRoutes(fastify: FastifyInstance) {
  function getService(): ScheduledTasksService {
    let service = (fastify as unknown as { scheduledTasksService?: ScheduledTasksService })
      .scheduledTasksService;
    if (!service) {
      service = new ScheduledTasksService();
      (
        fastify as unknown as { scheduledTasksService: ScheduledTasksService }
      ).scheduledTasksService = service;
    }
    return service;
  }

  function getAuthenticatedUserId(request: FastifyRequest): string {
    const auth = (request as unknown as { auth?: { userId?: string } }).auth;
    if (!auth?.userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }
    return auth.userId;
  }

  // POST /agents/scheduled/parse - Parse and preview natural language schedule trigger
  fastify.post('/parse', async (request, reply) => {
    const parseResult = parseNlTriggerSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const parsed = parseNaturalLanguageTrigger(parseResult.data.nlPrompt);
    return reply.send({ success: true, data: parsed });
  });

  // GET /agents/scheduled - List scheduled agent tasks
  fastify.get('/', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const queryResult = queryScheduledTasksSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const tasks = getService().listScheduledTasks(
      userId,
      queryResult.data as {
        status?: ScheduledTaskStatus;
        agentId?: string;
        targetApp?: string;
      },
    );

    return reply.send({ success: true, data: tasks });
  });

  // POST /agents/scheduled - Create a new recurring agent task
  fastify.post('/', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const parseResult = createScheduledTaskSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const task = await getService().createScheduledTask({
        userId,
        ...parseResult.data,
      });
      return reply.status(201).send({ success: true, data: task });
    } catch (err) {
      throw createAppError((err as Error).message, 400, 'INVALID_SCHEDULE_TASK');
    }
  });

  // GET /agents/scheduled/:id - Get a specific scheduled task
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const task = getService().getScheduledTask(request.params.id, userId);
    if (!task) {
      throw createAppError(`Scheduled task ${request.params.id} not found`, 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: task });
  });

  // PATCH /agents/scheduled/:id - Update scheduled task
  fastify.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const parseResult = updateScheduledTaskSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    try {
      const updated = getService().updateScheduledTask(
        request.params.id,
        userId,
        parseResult.data as any,
      );
      return reply.send({ success: true, data: updated });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw createAppError(msg, 404, 'NOT_FOUND');
      }
      throw createAppError(msg, 400, 'UPDATE_FAILED');
    }
  });

  // DELETE /agents/scheduled/:id - Delete or cancel scheduled task
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    const deleted = getService().deleteScheduledTask(request.params.id, userId);
    if (!deleted) {
      throw createAppError(`Scheduled task ${request.params.id} not found`, 404, 'NOT_FOUND');
    }

    return reply.send({ success: true, data: { message: 'Scheduled task deleted' } });
  });

  // POST /agents/scheduled/:id/trigger - Manually trigger immediate execution
  fastify.post<{ Params: { id: string } }>('/:id/trigger', async (request, reply) => {
    const userId = getAuthenticatedUserId(request);
    try {
      const run = await getService().triggerTask(request.params.id, userId, 'MANUAL');
      return reply.send({ success: true, data: run });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('not found')) {
        throw createAppError(msg, 404, 'NOT_FOUND');
      }
      throw createAppError(msg, 400, 'TRIGGER_FAILED');
    }
  });

  // GET /agents/scheduled/:id/runs - Get execution ledger history
  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/:id/runs',
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      const limit = request.query?.limit ? parseInt(request.query.limit, 10) : 20;
      const task = getService().getScheduledTask(request.params.id, userId);
      if (!task) {
        throw createAppError(`Scheduled task ${request.params.id} not found`, 404, 'NOT_FOUND');
      }

      const runs = getService().getExecutionHistory(request.params.id, userId, limit);
      return reply.send({ success: true, data: runs });
    },
  );

  // GET /agents/scheduled/:id/runs/:runId - Get specific execution ledger run
  fastify.get<{ Params: { id: string; runId: string } }>(
    '/:id/runs/:runId',
    async (request, reply) => {
      const userId = getAuthenticatedUserId(request);
      const run = getService().getExecutionRun(request.params.id, request.params.runId, userId);
      if (!run) {
        throw createAppError(`Execution run ${request.params.runId} not found`, 404, 'NOT_FOUND');
      }

      return reply.send({ success: true, data: run });
    },
  );
}
