/**
 * quanty-agent.ts — Fastify plugin: Quanty Agentic Engine HTTP API.
 *
 *   POST /api/quanty/tasks              — submit a natural-language command, returns taskId
 *   GET  /api/quanty/tasks/:id          — task status + steps
 *   GET  /api/quanty/tasks/:id/stream   — SSE stream of live progress
 *   POST /api/quanty/tasks/:id/interrupt — cancel a running task
 *   POST /api/quanty/tasks/:id/confirm  — approve the pending destructive step
 *   POST /api/quanty/tasks/:id/undo     — reverse a finished task's reversible steps
 *   GET  /api/quanty/popup              — combined popup dashboard data
 *
 * Auth: request.auth.userId (same convention as the rest of the backend).
 * SSE framing follows the repo convention: `data: <JSON>\n\n`, terminator `data: [DONE]`.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { AIEngine } from '@quant/ai';
import { EmailService } from '../services/email.service';
import { ThreadService } from '../services/thread.service';
import {
  buildActivityFeed,
  buildPopupData,
  createPlanner,
  createTask,
  getSchedule,
  getTool,
  InMemoryTaskStore,
  listTools,
  materializeSteps,
  persistAuditEvent,
  PrismaQuantyTaskStore,
  QuantyExecutor,
  quantyAgentState,
  recoverInterruptedTasks,
  recordApproval,
  listApprovals as listDurableApprovals,
  registerRealTools,
  undoTaskSteps,
  type QuantyActivityFeed,
  type QuantyExecutorCallbacks,
  type QuantyLiveStatus,
  type QuantyProgressEvent,
  type QuantyTask,
  type QuantyTaskStore,
  type QuantyToolApp,
  type QuantyToolContext,
} from '../services/quanty-agent';

// ---------------------------------------------------------------------------
// Module singletons — one executor + store + event bus per process.
// ---------------------------------------------------------------------------

let booted = false;
let store: QuantyTaskStore;
let executor: QuantyExecutor;

/**
 * Honest degradation: the durable Prisma store when the prisma client carries
 * the Quanty delegates, otherwise the in-memory store (e.g. a prisma mock in
 * tests, or a DB that has not been migrated yet). The Prisma store's
 * constructor throws a clear error when the delegates are absent — that throw
 * is the fallback signal, never a fatal boot failure.
 */
function durableTaskStore(prisma: unknown): QuantyTaskStore {
  try {
    return new PrismaQuantyTaskStore(prisma);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[quanty-agent] durable task store unavailable, using in-memory store:',
      err instanceof Error ? err.message : err,
    );
    return new InMemoryTaskStore();
  }
}

/** taskId → live SSE listeners. */
const subscribers = new Map<string, Set<(event: QuantyProgressEvent) => void>>();

function toolAppOf(toolName: string): QuantyToolApp | undefined {
  return getTool(toolName)?.app;
}

function boot(fastify: FastifyInstance): void {
  if (booted) return;
  const prisma = (fastify as unknown as { prisma: PrismaClient }).prisma;
  // Stable worker identity for this boot. Stamped onto every task this
  // process runs; the boot sweep uses it to tell a live replica's tasks
  // apart from a dead worker's orphans.
  const workerId = randomUUID();
  // REAL tools: mail + git handlers backed by the scoped backend services,
  // drive handlers backed by the real Drive AI services (QM-M39-011),
  // calendar handlers backed by CalendarService + prisma.event rows.
  // No stubs — registerRealTools throws on duplicate registration, so this
  // runs exactly once per process.
  registerRealTools({
    prisma,
    emailService: new EmailService(prisma),
    threadService: new ThreadService(prisma),
    summarizeService: null,
    aiEngine: new AIEngine(),
  });
  store = durableTaskStore(prisma);
  executor = new QuantyExecutor({
    store,
    workerId,
    // Durable approval sink: persist each grant with the task's owner so
    // /api/quanty/approvals can serve it per-user (never the process-global
    // list). The in-memory mirror is kept for the live popup. A persistence
    // failure must not break confirm() — it already resolved the waiter.
    approvalSink: async (input) => {
      quantyAgentState.logApproval(input);
      try {
        const task = input.taskId ? await store.get(input.taskId) : null;
        const userId = task?.userId;
        if (userId) {
          await recordApproval(prisma, {
            userId,
            taskId: input.taskId,
            toolName: input.toolName ?? 'unknown-tool',
            label: input.description,
            scope: input.scope,
          });
        }
      } catch {
        // Best-effort only.
      }
    },
  });
  // Boot sweep: tasks orphaned by a dead worker are honestly marked
  // interrupted (never faked as done), with plan/steps/receipts kept.
  // Only rows untouched for 15+ min and not owned by this worker qualify —
  // a live replica's tasks are never touched.
  void recoverInterruptedTasks(prisma, workerId).catch(() => {
    // Durability sweep is best-effort at boot; the store still works if it fails.
  });
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

function callbacks(prisma: unknown): QuantyExecutorCallbacks {
  return {
    onEvent: (event) => broadcast(event),
    onAudit: (entry) => {
      // Durable audit trail: append-only quanty_task_events; the SSE stream
      // replays it for late joiners. Fire-and-forget — a persistence failure
      // must never break the task itself.
      void persistAuditEvent(prisma, entry).catch(() => {});
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
  boot(fastify);

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
    void executor.run(task, prisma, callbacks(prisma)).catch(() => {
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

    // Hijack AFTER the auth/ownership checks above: from here on the raw
    // response is ours and Fastify must skip its post-handler send path
    // (repo SSE convention — see sse-transport.ts / ai-streaming.ts).
    // Without hijack this endpoint only worked by accident: Fastify's
    // wrap-thenable skips send when the handler resolves undefined with
    // headers already sent.
    reply.hijack();

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

  // POST /api/quanty/tasks/:id/background — the user's explicit intent to keep
  // this task running when the UI closes. Sets background=true durably and
  // emits task.backgrounded on the audit trail. 409 when the task is already
  // terminal — backgrounding a finished task is meaningless.
  fastify.post<{ Params: { id: string } }>('/api/quanty/tasks/:id/background', async (request, reply) => {
    const userId = reqUserId(request);
    const task = await loadTaskOwnedBy(request.params.id, userId);
    if (['done', 'failed', 'interrupted'].includes(task.status)) {
      throw createAppError('Task is already terminal', 409, 'TASK_TERMINAL');
    }
    task.background = true;
    await store.save(task);
    await persistAuditEvent(prisma, {
      taskId: task.id,
      userId,
      timestamp: new Date().toISOString(),
      kind: 'task.backgrounded',
    });
    return reply.send({ success: true, data: { background: true } });
  });

  // POST /api/quanty/tasks/:id/resume — real resume for an interrupted task.
  // Re-runs the SAME task (same ids), so completed steps replay from their
  // receipts instead of re-invoking tools — this is what "resume from the last
  // completed step" actually means. Only interrupted tasks can resume; steps
  // left 'running' by the crash go through the atomic claim path (replay if
  // a receipt exists, take over a stale claim, or execute once).
  fastify.post<{ Params: { id: string } }>('/api/quanty/tasks/:id/resume', async (request, reply) => {
    const userId = reqUserId(request);
    const task = await loadTaskOwnedBy(request.params.id, userId);
    if (task.status !== 'interrupted') {
      throw createAppError('Only interrupted tasks can be resumed', 409, 'TASK_NOT_INTERRUPTED');
    }
    for (const step of task.steps) {
      if (step.status === 'running' || step.status === 'pending') {
        step.status = 'pending';
        step.startedAt = undefined;
      }
    }
    task.status = 'running';
    task.outcome = undefined;
    task.pendingToolName = undefined;
    await store.save(task);
    await persistAuditEvent(prisma, {
      taskId: task.id,
      userId,
      timestamp: new Date().toISOString(),
      kind: 'task.resumed',
      detail: 'Resumed by user — completed steps replay from receipts.',
    });
    void executor.run(task, prisma, callbacks(prisma)).catch(() => {
      // run() records its own terminal state; the stream just ends here.
    });
    return reply.send({ success: true, data: { resumed: true, taskId: task.id } });
  });

  // POST /api/quanty/tasks/:id/undo — reverse a finished task's reversible steps.
  // Only steps the tools themselves marked reversible (with an undoToken) are
  // reversed, newest first. 409 when there is nothing reversible — an honest
  // "nothing to undo", never a fabricated success.
  fastify.post<{ Params: { id: string } }>('/api/quanty/tasks/:id/undo', async (request, reply) => {
    const userId = reqUserId(request);
    const task = await loadTaskOwnedBy(request.params.id, userId);
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const buildCtx = (): QuantyToolContext => ({
      userId,
      taskId: task.id,
      prisma,
      signal: new AbortController().signal,
      audit: () => {},
    });
    const outcome = await undoTaskSteps(task, buildCtx);
    if (outcome.undone === 0) {
      throw createAppError('Nothing reversible to undo for this task', 409, 'NOT_REVERSIBLE');
    }
    await store.save(task);
    return reply.send({ success: true, data: { undone: outcome.undone, details: outcome.details } });
  });

  // -----------------------------------------------------------------------
  // Agentic popup surface (mirrors the Muse app's deep agentic interface)
  // -----------------------------------------------------------------------

  // GET /api/quanty/activity — activity feed grouped Today / Yesterday / Older.
  fastify.get('/api/quanty/activity', async (request, reply) => {
    const userId = reqUserId(request);
    const tasks = await store.listByUser(userId, 100);
    const feed: QuantyActivityFeed = buildActivityFeed(tasks, toolAppOf);
    return reply.send({ success: true, data: feed });
  });

  // GET /api/quanty/schedule — scheduled tasks grouped Daily / Interval / Weekly.
  fastify.get('/api/quanty/schedule', async (request, reply) => {
    reqUserId(request);
    return reply.send({ success: true, data: getSchedule() });
  });

  // GET /api/quanty/approvals — approval history, scoped to the caller.
  // Served from the durable per-user grant log (never the process-global
  // in-memory list, which mixes users on shared deployments).
  fastify.get('/api/quanty/approvals', async (request, reply) => {
    const userId = reqUserId(request);
    return reply.send({ success: true, data: await listDurableApprovals(prisma, userId, 50) });
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

  // GET /api/quanty/popup — combined popup dashboard data in one call.
  // Backed by the real agent-core stores (task history, approval log, the real
  // cron registry, identity cards). Arrays are empty when there is no data —
  // never fabricated. The Next.js layer maps this onto the frontend
  // QuantyPopupData contract.
  fastify.get('/api/quanty/popup', async (request, reply) => {
    const userId = reqUserId(request);
    const data = await buildPopupData({ userId, store, executor, toolAppOf });
    return reply.send({ success: true, data });
  });
}
