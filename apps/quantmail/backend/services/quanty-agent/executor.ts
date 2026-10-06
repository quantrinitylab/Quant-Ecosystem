/**
 * quanty-agent/executor.ts — Runs a QuantyTask step by step.
 *
 * - Executes steps sequentially, streaming progress events via callbacks.
 * - Destructive tools pause the task (status 'waiting-confirm') until the user
 *   approves via confirm() or cancels via interrupt().
 * - interrupt() cancels mid-run; the in-flight step is marked skipped.
 * - Every action is audit-logged. Max-steps and per-step timeouts bound a run.
 */

import { randomUUID } from 'node:crypto';
import type {
  QuantyAuditEntry,
  QuantyExecutorCallbacks,
  QuantyLiveStatus,
  QuantyProgressEvent,
  QuantyStep,
  QuantyTask,
  QuantyTaskStatus,
  QuantyTaskStore,
  QuantyToolContext,
} from './types';
import { getTool } from './tool-registry';
import { quantyAgentState } from './agent-state';

export const MAX_STEPS_PER_TASK = 25;
export const STEP_TIMEOUT_MS = 120_000;

export interface ExecutorOptions {
  store: QuantyTaskStore;
  /** Per-step timeout; defaults to STEP_TIMEOUT_MS. */
  stepTimeoutMs?: number;
}

/** In-memory task store — the default; swap for a DB-backed store later. */
export class InMemoryTaskStore implements QuantyTaskStore {
  private tasks = new Map<string, QuantyTask>();

  async save(task: QuantyTask): Promise<void> {
    this.tasks.set(task.id, structuredClone(task));
  }

  async get(taskId: string): Promise<QuantyTask | null> {
    const t = this.tasks.get(taskId);
    return t ? structuredClone(t) : null;
  }

  async listByUser(userId: string, limit = 20): Promise<QuantyTask[]> {
    return [...this.tasks.values()]
      .filter((t) => t.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((t) => structuredClone(t));
  }
}

interface RunState {
  task: QuantyTask;
  interrupted: boolean;
  confirmWaiters: Array<{ toolName: string; label: string; resolve: (approved: boolean) => void }>;
  abortController: AbortController;
  /** Label of the currently executing step — powers the live status API. */
  currentStepLabel?: string;
}

export class QuantyExecutor {
  private runs = new Map<string, RunState>();
  private opts: ExecutorOptions;

  constructor(opts: ExecutorOptions) {
    this.opts = opts;
  }

  /** Start executing a task's steps. Resolves when the task reaches a terminal state. */
  async run(task: QuantyTask, prisma: unknown, cb: QuantyExecutorCallbacks): Promise<QuantyTask> {
    const now = () => new Date().toISOString();
    const runState: RunState = {
      task,
      interrupted: false,
      confirmWaiters: [],
      abortController: new AbortController(),
    };
    this.runs.set(task.id, runState);

    const audit = (entry: Omit<QuantyAuditEntry, 'taskId' | 'userId' | 'timestamp'>) => {
      const full: QuantyAuditEntry = {
        taskId: task.id,
        userId: task.userId,
        timestamp: now(),
        ...entry,
      };
      cb.onAudit(full);
    };

    const emit = (event: QuantyProgressEvent) => cb.onEvent(event);
    const persist = async () => {
      task.updatedAt = now();
      await this.opts.store.save(task);
    };
    const setStatus = async (status: QuantyTaskStatus) => {
      task.status = status;
      await persist();
    };

    try {
      if (task.steps.length > MAX_STEPS_PER_TASK) {
        throw new Error(`Task exceeds max steps (${MAX_STEPS_PER_TASK})`);
      }

      await setStatus('running');
      audit({ kind: 'task.planned', detail: task.planSummary });
      emit({ type: 'task', task: structuredClone(task) });

      for (const step of task.steps) {
        if (runState.interrupted) break;

        const tool = getTool(step.toolName);
        if (!tool) {
          step.status = 'failed';
          step.error = `Unknown tool "${step.toolName}"`;
          audit({ kind: 'step.failed', toolName: step.toolName, stepId: step.id, detail: step.error });
          emit({ type: 'step.failed', taskId: task.id, step, error: step.error });
          throw new Error(step.error);
        }

        // Destructive tools pause for user confirmation.
        if (tool.destructive) {
          await setStatus('waiting-confirm');
          task.pendingToolName = tool.name;
          await persist();
          audit({ kind: 'confirm.requested', toolName: tool.name, stepId: step.id });
          emit({ type: 'waiting-confirm', taskId: task.id, toolName: tool.name, label: step.label });

          const approved = await new Promise<boolean>((resolve) => {
            runState.confirmWaiters.push({ toolName: tool.name, label: step.label, resolve });
          });
          task.pendingToolName = undefined;

          if (runState.interrupted || !approved) {
            step.status = 'skipped';
            audit({ kind: 'confirm.granted', toolName: tool.name, stepId: step.id, detail: 'denied/interrupted — step skipped' });
            break;
          }
          audit({ kind: 'confirm.granted', toolName: tool.name, stepId: step.id });
          await setStatus('running');
        }

        // Execute the step with a timeout.
        step.status = 'running';
        step.startedAt = now();
        runState.currentStepLabel = step.label;
        await persist();
        audit({ kind: 'step.start', toolName: tool.name, stepId: step.id });
        emit({ type: 'step.start', taskId: task.id, step: structuredClone(step) });

        try {
          const ctx: QuantyToolContext = {
            userId: task.userId,
            taskId: task.id,
            prisma,
            signal: runState.abortController.signal,
            audit,
          };
          const result = await this.runWithTimeout(tool.handler(step.args, ctx), this.opts.stepTimeoutMs ?? STEP_TIMEOUT_MS);

          if (runState.interrupted) {
            step.status = 'skipped';
            break;
          }
          if (!result.ok) {
            throw new Error(result.summary || 'Tool reported failure');
          }
          step.status = 'done';
          step.result = result.data;
          step.endedAt = now();
          runState.currentStepLabel = undefined;
          await persist();
          audit({ kind: 'step.done', toolName: tool.name, stepId: step.id, detail: result.summary });
          emit({ type: 'step.done', taskId: task.id, step: structuredClone(step), summary: result.summary });
        } catch (err) {
          step.status = 'failed';
          step.error = err instanceof Error ? err.message : String(err);
          step.endedAt = now();
          runState.currentStepLabel = undefined;
          await persist();
          audit({ kind: 'step.failed', toolName: tool.name, stepId: step.id, detail: step.error });
          emit({ type: 'step.failed', taskId: task.id, step: structuredClone(step), error: step.error });
          throw err;
        }
      }

      if (runState.interrupted) {
        task.outcome = 'Interrupted by user.';
        await setStatus('interrupted');
        audit({ kind: 'task.interrupted' });
        emit({ type: 'task.interrupted', taskId: task.id });
      } else {
        const doneCount = task.steps.filter((s) => s.status === 'done').length;
        const skipped = task.steps.filter((s) => s.status === 'skipped').length;
        task.outcome = skipped > 0
          ? `Done with ${skipped} step(s) skipped. ${doneCount}/${task.steps.length} completed.`
          : `Done. ${doneCount}/${task.steps.length} steps completed.`;
        await setStatus('done');
        audit({ kind: 'task.done', detail: task.outcome });
        emit({ type: 'task.done', taskId: task.id, outcome: task.outcome });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (runState.interrupted) {
        // The in-flight step threw because of the abort (or raced with it).
        // An interrupt always wins over a step failure.
        task.outcome = 'Interrupted by user.';
        task.status = 'interrupted';
        await persist();
        audit({ kind: 'task.interrupted' });
        emit({ type: 'task.interrupted', taskId: task.id });
      } else {
        task.outcome = `Failed: ${message}`;
        task.status = 'failed';
        await persist();
        audit({ kind: 'task.failed', detail: message });
        emit({ type: 'task.failed', taskId: task.id, error: message });
      }
    } finally {
      this.runs.delete(task.id);
    }

    return task;
  }

  /** Approve (or deny) the currently pending destructive step. */
  async confirm(taskId: string, approved: boolean): Promise<boolean> {
    const run = this.runs.get(taskId);
    if (!run) return false;
    const waiter = run.confirmWaiters.shift();
    if (!waiter) return false;
    if (approved) {
      quantyAgentState.logApproval({
        icon: '⚠️',
        title: `Approved: ${waiter.toolName}`,
        description: waiter.label,
        scope: 'This task only',
      });
    }
    waiter.resolve(approved);
    return true;
  }

  /** Cancel a running task. The in-flight step finishes its handler or times out. */
  async interrupt(taskId: string): Promise<boolean> {
    const run = this.runs.get(taskId);
    if (!run) return false;
    run.interrupted = true;
    run.abortController.abort();
    // Release any confirmation waiter so run() can observe the interrupt.
    const waiter = run.confirmWaiters.shift();
    if (waiter) waiter.resolve(false);
    return true;
  }

  /**
   * Live status for the popup header: what Quanty is doing right now.
   * Returns the most recently started run's current step label.
   */
  liveStatus(): QuantyLiveStatus {
    const runs = [...this.runs.values()];
    if (runs.length === 0) {
      return { status: 'idle', detail: 'Waiting for your command' };
    }
    const latest = runs[runs.length - 1];
    return {
      status: 'is working',
      detail: latest.currentStepLabel ?? latest.task.planSummary,
    };
  }

  private runWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Step timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }
}

/** Create a fresh task shell from a plan — ids assigned, steps pending. */
export function createTask(userId: string, command: string, summary: string, steps: QuantyStep[]): QuantyTask {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    userId,
    command,
    status: 'planning',
    planSummary: summary,
    steps,
    needsConfirmation: false,
    createdAt: now,
    updatedAt: now,
  };
}
