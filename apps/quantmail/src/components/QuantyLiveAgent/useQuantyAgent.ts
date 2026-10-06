'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  QuantyStreamEvent,
  QuantySubmitResponse,
  QuantyTask,
  QuantyTaskStatus,
} from './types';

export interface UseQuantyAgentOptions {
  /** Base path for the tasks API. Defaults to /api/quanty/tasks. */
  apiBase?: string;
}

export interface UseQuantyAgent {
  /** The currently active (or last finished) task. Null before the first command. */
  task: QuantyTask | null;
  /** True while the task is thinking/working/waiting-confirm. */
  running: boolean;
  /** Submit a command; returns the new task id. Rejects on network/API error. */
  submitCommand: (command: string) => Promise<string>;
  /** Stop the running task immediately. */
  interrupt: () => Promise<void>;
  /** Approve a destructive step that is waiting-confirm. */
  confirmStep: (stepId: string) => Promise<void>;
  /** Skip a destructive step that is waiting-confirm. */
  cancelStep: (stepId: string) => Promise<void>;
  /** Undo a reversible finished task. */
  undoTask: (taskId: string) => Promise<void>;
  /** Clear the current task (back to idle). */
  reset: () => void;
  /** Last transport-level error (not task failure — that lives on task.error). */
  error: string | null;
}

const RUNNING_STATUSES: ReadonlySet<QuantyTaskStatus> = new Set([
  'thinking',
  'working',
  'waiting-confirm',
]);

/**
 * Client for the Quanty agentic backend.
 *
 * Contract (backend lands separately):
 * - POST {apiBase}              { command }            -> { taskId }
 * - GET  {apiBase}/{id}/stream                        -> SSE: task|step|done|error
 * - POST {apiBase}/{id}/interrupt                     -> 204
 * - POST {apiBase}/{id}/steps/{stepId}/confirm        -> 204
 * - POST {apiBase}/{id}/steps/{stepId}/cancel         -> 204
 * - POST {apiBase}/{id}/undo                          -> 204
 *
 * The SSE subscription is the single source of truth for task state: every
 * event carries either a full task snapshot or a step patch, and the hook
 * merges patches immutably. EventSource auto-reconnects on drop; the `done`
 * and `error` events close the stream.
 */
export function useQuantyAgent(options: UseQuantyAgentOptions = {}): UseQuantyAgent {
  const apiBase = options.apiBase ?? '/api/quanty/tasks';
  const [task, setTask] = useState<QuantyTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const taskIdRef = useRef<string | null>(null);

  const closeStream = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const applyEvent = useCallback((event: QuantyStreamEvent) => {
    switch (event.type) {
      case 'task':
      case 'done':
        setTask(event.task);
        break;
      case 'step':
        setTask((prev) => {
          if (!prev) return prev;
          const idx = prev.steps.findIndex((s) => s.id === event.step.id);
          const steps =
            idx >= 0
              ? prev.steps.map((s, i) => (i === idx ? event.step : s))
              : [...prev.steps, event.step];
          return { ...prev, steps, updatedAt: event.step.updatedAt };
        });
        break;
      case 'error':
        setError(event.error);
        break;
    }
  }, []);

  const openStream = useCallback(
    (taskId: string) => {
      closeStream();
      taskIdRef.current = taskId;
      const source = new EventSource(`${apiBase}/${encodeURIComponent(taskId)}/stream`);
      sourceRef.current = source;

      source.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as QuantyStreamEvent;
          applyEvent(event);
          if (event.type === 'done' || event.type === 'error') {
            closeStream();
          }
        } catch {
          /* A malformed frame must not kill the stream; the next one heals it. */
        }
      };

      source.onerror = () => {
        // EventSource retries automatically; only surface if the task looks stuck.
        // We keep quiet here — a transient blip shouldn't alarm the user.
      };
    },
    [apiBase, applyEvent, closeStream],
  );

  const submitCommand = useCallback(
    async (command: string): Promise<string> => {
      const trimmed = command.trim();
      if (!trimmed) throw new Error('Command khaali hai');
      setError(null);
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: trimmed }),
      });
      if (!res.ok) {
        const message = `Quanty se baat nahi ho payi (HTTP ${res.status})`;
        setError(message);
        throw new Error(message);
      }
      const { taskId } = (await res.json()) as QuantySubmitResponse;
      // Optimistic shell so the UI responds instantly; the stream fills it in.
      const now = new Date().toISOString();
      setTask({
        id: taskId,
        command: trimmed,
        status: 'thinking',
        steps: [],
        createdAt: now,
        updatedAt: now,
      });
      openStream(taskId);
      return taskId;
    },
    [apiBase, openStream],
  );

  const postAction = useCallback(
    async (path: string, failureMessage: string): Promise<void> => {
      const taskId = taskIdRef.current;
      if (!taskId) return;
      const res = await fetch(`${apiBase}/${encodeURIComponent(taskId)}${path}`, { method: 'POST' });
      if (!res.ok) {
        const message = `${failureMessage} (HTTP ${res.status})`;
        setError(message);
        throw new Error(message);
      }
    },
    [apiBase],
  );

  const interrupt = useCallback(() => postAction('/interrupt', 'Rokne me dikkat hui'), [postAction]);

  const confirmStep = useCallback(
    (stepId: string) => postAction(`/steps/${encodeURIComponent(stepId)}/confirm`, 'Confirm nahi ho paya'),
    [postAction],
  );

  const cancelStep = useCallback(
    (stepId: string) => postAction(`/steps/${encodeURIComponent(stepId)}/cancel`, 'Cancel nahi ho paya'),
    [postAction],
  );

  const undoTask = useCallback(
    (taskId: string) =>
      fetch(`${apiBase}/${encodeURIComponent(taskId)}/undo`, { method: 'POST' }).then((res) => {
        if (!res.ok) {
          const message = `Undo nahi ho paya (HTTP ${res.status})`;
          setError(message);
          throw new Error(message);
        }
      }),
    [apiBase],
  );

  const reset = useCallback(() => {
    closeStream();
    taskIdRef.current = null;
    setTask(null);
    setError(null);
  }, [closeStream]);

  // Unmount: stop the stream. The backend task keeps running unless the user
  // hit interrupt — closing the tab shouldn't nuke a long-running job.
  useEffect(() => {
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  return {
    task,
    running: task != null && RUNNING_STATUSES.has(task.status),
    submitCommand,
    interrupt,
    confirmStep,
    cancelStep,
    undoTask,
    reset,
    error,
  };
}
