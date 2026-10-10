'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { browserAuthSession } from '../../services/browser-auth-session';
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
  const streamAbortRef = useRef<AbortController | null>(null);
  const taskIdRef = useRef<string | null>(null);
  // Mirror of the task for the stream loop: reconnect decisions must read the
  // latest status without re-creating the stream callback.
  const taskRef = useRef<QuantyTask | null>(null);
  taskRef.current = task;

  const closeStream = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
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

  /**
   * Authenticated SSE reader over fetch.
   *
   * EventSource cannot send an Authorization header, and this backend reads
   * `request.auth?.userId` and answers 401 without one — so the old
   * EventSource stream could never authenticate (the voice panel's typed
   * commands failed with "Quanty se baat nahi ho payi (HTTP 401)" for the same
   * reason on POST). This reader sends the in-memory access token like every
   * other authenticated call, refreshes once on 401, and reconnects a bounded
   * number of times when the stream drops mid-task (the old EventSource
   * auto-reconnect contract).
   */
  const openStream = useCallback(
    (taskId: string) => {
      closeStream();
      taskIdRef.current = taskId;
      const controller = new AbortController();
      streamAbortRef.current = controller;
      const url = `${apiBase}/${encodeURIComponent(taskId)}/stream`;

      const readOnce = async (allowRefreshRetry: boolean): Promise<'closed' | 'reconnect'> => {
        const token = browserAuthSession.getAccessToken();
        const res = await fetch(url, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Accept: 'text/event-stream',
          },
          credentials: 'include',
          signal: controller.signal,
        });
        if (res.status === 401 && allowRefreshRetry) {
          const refreshed = await browserAuthSession.refresh();
          if (refreshed.success) return readOnce(false);
        }
        if (!res.ok || !res.body) {
          setError(`Live updates nahi mil paye (HTTP ${res.status})`);
          return 'closed';
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';
          for (const frame of frames) {
            for (const line of frame.split('\n')) {
              if (!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if (!payload) continue;
              try {
                const event = JSON.parse(payload) as QuantyStreamEvent;
                applyEvent(event);
                if (event.type === 'done' || event.type === 'error') {
                  return 'closed';
                }
              } catch {
                /* A malformed frame must not kill the stream; the next one heals it. */
              }
            }
          }
          if (controller.signal.aborted) return 'closed';
        }
        // Server closed the stream without a done/error frame: a dropped
        // connection, not a finished task.
        return 'reconnect';
      };

      const pump = async () => {
        let attempts = 0;
        for (;;) {
          if (controller.signal.aborted) return;
          try {
            const outcome = await readOnce(attempts === 0);
            if (outcome === 'closed') return;
          } catch (err) {
            if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
            // Network blip — fall through to the reconnect check below.
          }
          const status = taskRef.current?.status;
          if (!status || !RUNNING_STATUSES.has(status) || attempts >= 5) return;
          attempts += 1;
          await new Promise((r) => setTimeout(r, 1500));
        }
      };
      void pump();
    },
    [apiBase, applyEvent, closeStream],
  );

  const submitCommand = useCallback(
    async (command: string): Promise<string> => {
      const trimmed = command.trim();
      if (!trimmed) throw new Error('Command khaali hai');
      setError(null);
      // Authenticated: the backend reads request.auth?.userId and answers 401
      // without an Authorization header (this is why voice-panel commands
      // failed while the chat drawer — which uses authenticatedFetch — worked).
      const res = await browserAuthSession.authenticatedFetch(apiBase, {
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
      const res = await browserAuthSession.authenticatedFetch(
        `${apiBase}/${encodeURIComponent(taskId)}${path}`,
        { method: 'POST' },
      );
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
      browserAuthSession
        .authenticatedFetch(`${apiBase}/${encodeURIComponent(taskId)}/undo`, { method: 'POST' })
        .then((res) => {
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
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
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
