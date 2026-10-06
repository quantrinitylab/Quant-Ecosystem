/**
 * quanty-agent.ts — Fastify plugin: Quanty Agentic Engine HTTP API.
 *
 *   POST /api/quanty/tasks              — submit a natural-language command, returns taskId
 *   GET  /api/quanty/tasks/:id          — task status + steps
 *   GET  /api/quanty/tasks/:id/stream   — SSE stream of live progress
 *   POST /api/quanty/tasks/:id/interrupt — cancel a running task
 *   POST /api/quanty/tasks/:id/confirm  — approve the pending destructive step
 *
 * Auth: request.auth.userId (same convention as the rest of the backend).
 * SSE framing follows the repo convention: `data: <JSON>\n\n`, terminator `data: [DONE]`.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  createPlanner,
  createTask,
  getSchedule,
  getTool,
  InMemoryTaskStore,
  listTools,
  materializeSteps,
  QuantyExecutor,
  quantyAgentState,
  registerBuiltinTools,
  type QuantyActivityFeed,
  type QuantyActivityItem,
  type QuantyExecutorCallbacks,
  type QuantyLiveStatus,
  type QuantyProgressEvent,
  type QuantyTask,
  type QuantyTaskStore,
  type QuantyToolApp,
} from '../services/quanty-agent';

// ---------------------------------------------------------------------------
// Module singletons — one executor + store + event bus per process.
// ---------------------------------------------------------------------------

let booted = false;
let store: QuantyTaskStore;
let executor: QuantyExecutor;

/** taskId → live SSE listeners. */
const subscribers = new Map<string, Set<(event: QuantyProgressEvent) => void>>();

function boot(): void {
  if (booted) return;
  registerBuiltinTools();
  store = new InMemoryTaskStore();
  executor = new QuantyExecutor({ store });
  booted = true;
}

function broadcast(event: QuantyProgressEvent): void {
  const taskId = 'taskId' in event ? event.taskId : event.task.id;
  const subs = subscribers.get(taskId);
  if (!subs) return;
  for (const fn of subs) {
    try {
      fn(event);
    } catch {
      // A broken listener must not break the task.
    }
  }
}

function callbacks(): QuantyExecutorCallbacks {
  return {
    onEvent: (event) => broadcast(event),
    onAudit: () => {
      // Audit entries are emitted; persistence of the audit trail lands
      // with the DB-backed task store in the next phase.
    },
  };
}

function reqUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

async function loadTaskOwnedBy(taskId: string, userId: string): Promise<QuantyTask> {
  const task = await store.get(taskId);
  if (!task) {
    throw createAppError('Task not found', 404, 'NOT_FOUND');
  }
  if (task.userId !== userId) {
    throw createAppError('Forbidden', 403, 'FORBIDDEN');
  }
  return task;
}

const submitSchema = z.object({
  command: z.string().min(1).max(2000),
});

const confirmSchema = z.object({
  approved: z.boolean(),
});

export default async function quantyAgentRoutes(fastify: FastifyInstance) {
  boot();

  // POST /api/quanty/tasks — submit a command.
  fastify.post('/api/quanty/tasks', async (request, reply) => {
    const userId = reqUserId(request);
    const body = submitSchema.safeParse(request.body);
    if (!body.success) {
      throw createAppError('command is required (1-2000 chars)', 400, 'BAD_REQUEST');
    }

    const planner = createPlanner('rule');
    const plan = planner.plan(body.data.command);

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const steps = materializeSteps(plan, listTools());
    const task = createTask(userId, body.data.command, plan.summary, steps);
    task.needsConfirmation = steps.some((s) => getTool(s.toolName)?.destructive === true);
    await store.save(task);

    if (plan.unmatched) {
      task.status = 'failed';
      task.outcome = plan.summary;
      task.updatedAt = new Date().toISOString();
      await store.save(task);
      return reply.send({ success: true, data: { taskId: task.id, status: task.status, outcome: task.outcome } });
    }

    // Run in the background; progress flows through SSE + polling.
    void executor.run(task, prisma, callbacks()).catch(() => {
      // run() never rejects (it captures failures into the task), this is belt-and-braces.
    });

    return reply.send({
      success: true,
      data: { taskId: task.id, status: task.status, planSummary: task.planSummary, needsConfirmation: task.needsConfirmation },
    });
  });

  // GET /api/quanty/tasks/:id — status + steps.
  fastify.get<{ Params: { id: string } }>('/api/quanty/tasks/:id', async (request, reply) => {
    const userId = reqUserId(request);
    const task = await loadTaskOwnedBy(request.params.id, userId);
    return reply.send({ success: true, data: task });
  });

  // GET /api/quanty/tasks/:id/stream — SSE live progress.
  // Auth + existence checks happen BEFORE hijack (repo SSE convention).
  fastify.get<{ Params: { id: string } }>('/api/quanty/tasks/:id/stream', async (request, reply) => {
    const userId = reqUserId(request);
    const task = await loadTaskOwnedBy(request.params.id, userId);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const write = (obj: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    // Send current snapshot first so late joiners see the full state.
    write({ type: 'task', task });

    const listener = (event: QuantyProgressEvent) => write(event);
    let subs = subscribers.get(task.id);
    if (!subs) {
      subs = new Set();
      subscribers.set(task.id, subs);
    }
    subs.add(listener);

    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 15_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      subscribers.get(task.id)?.delete(listener);
    };
    request.raw.on('close', cleanup);

    // If the task already reached a terminal state, close immediately.
    const terminal = task.status === 'done' || task.status === 'failed' || task.status === 'interrupted';
    if (terminal) {
      write({ type: 'task', task });
      reply.raw.write('data: [DONE]\n\n');
      cleanup();
      reply.raw.end();
      return;
    }

    // Otherwise hold the connection; completion is signaled by the executor
    // broadcasting a terminal event — the client closes, or it times out.
    const terminalListener = (event: QuantyProgressEvent) => {
      if (event.type === 'task.done' || event.type === 'task.failed' || event.type === 'task.interrupted') {
        reply.raw.write('data: [DONE]\n\n');
        cleanup();
        reply.raw.end();
      }
    };
    subs.add(terminalListener);
    const originalCleanup = cleanup;
    request.raw.on('close', () => subs?.delete(terminalListener));
    void originalCleanup;
  });

  // POST /api/quanty/tasks/:id/interrupt — cancel a running task.
  fastify.post<{ Params: { id: string } }>('/api/quanty/tasks/:id/interrupt', async (request, reply) => {
    const userId = reqUserId(request);
    await loadTaskOwnedBy(request.params.id, userId);
    const ok = await executor.interrupt(request.params.id);
    return reply.send({ success: true, data: { interrupted: ok } });
  });

  // POST /api/quanty/tasks/:id/confirm — approve/deny the pending destructive step.
  fastify.post<{ Params: { id: string } }>('/api/quanty/tasks/:id/confirm', async (request, reply) => {
    const userId = reqUserId(request);
    await loadTaskOwnedBy(request.params.id, userId);
    const body = confirmSchema.safeParse(request.body);
    if (!body.success) {
      throw createAppError('approved (boolean) is required', 400, 'BAD_REQUEST');
    }
    const ok = await executor.confirm(request.params.id, body.data.approved);
    return reply.send({ success: true, data: { confirmed: ok, approved: body.data.approved } });
  });

  // -----------------------------------------------------------------------
  // Agentic popup surface (mirrors the Muse app's deep agentic interface)
  // -----------------------------------------------------------------------

  const APP_ICONS: Record<QuantyToolApp, string> = {
    mail: '📧',
    git: '📦',
    calendar: '📅',
    drive: '💾',
    contacts: '👥',
    core: '🤖',
  };

  function taskIcon(task: QuantyTask): string {
    const first = task.steps[0]?.toolName;
    const tool = first ? getTool(first) : undefined;
    return APP_ICONS[tool?.app ?? 'core'];
  }

  // GET /api/quanty/activity — activity feed grouped Today / Yesterday / Older.
  fastify.get('/api/quanty/activity', async (request, reply) => {
    const userId = reqUserId(request);
    const tasks = await store.listByUser(userId, 100);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const feed: QuantyActivityFeed = { today: [], yesterday: [], older: [] };
    for (const task of tasks) {
      if (task.status !== 'done' && task.status !== 'failed' && task.status !== 'interrupted') continue;
      const item: QuantyActivityItem = {
        id: task.id,
        icon: taskIcon(task),
        title: task.command,
        description: task.outcome ?? task.planSummary,
        timestamp: task.updatedAt,
      };
      const ts = new Date(task.updatedAt).getTime();
      if (ts >= startOfToday.getTime()) feed.today.push(item);
      else if (ts >= startOfYesterday.getTime()) feed.yesterday.push(item);
      else feed.older.push(item);
    }
    return reply.send({ success: true, data: feed });
  });

  // GET /api/quanty/schedule — scheduled tasks grouped Daily / Interval / Weekly.
  fastify.get('/api/quanty/schedule', async (request, reply) => {
    reqUserId(request);
    return reply.send({ success: true, data: getSchedule() });
  });

  // GET /api/quanty/approvals — approval history.
  fastify.get('/api/quanty/approvals', async (request, reply) => {
    reqUserId(request);
    return reply.send({ success: true, data: quantyAgentState.listApprovals(50) });
  });

  // GET /api/quanty/browser-tasks — browser task history.
  fastify.get('/api/quanty/browser-tasks', async (request, reply) => {
    reqUserId(request);
    return reply.send({ success: true, data: quantyAgentState.listBrowserTasks(50) });
  });

  // GET /api/quanty/identity — soul + memory cards (placeholder for now).
  fastify.get('/api/quanty/identity', async (request, reply) => {
    reqUserId(request);
    return reply.send({ success: true, data: quantyAgentState.getIdentity() });
  });

  // GET /api/quanty/status — live status text for the popup header.
  fastify.get('/api/quanty/status', async (request, reply) => {
    reqUserId(request);
    const live = executor.liveStatus();
    // A running browser task also counts as active ("browsing").
    const browsing = quantyAgentState.listBrowserTasks(5).some((t) => t.status === 'running');
    const status: QuantyLiveStatus =
      live.status === 'is working' ? live : browsing ? { status: 'browsing', detail: 'Browsing the web' } : live;
    return reply.send({ success: true, data: status });
  });
}
