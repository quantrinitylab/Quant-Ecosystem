'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToolCallCard } from './ToolCallCard';
import { WorkflowProgressCard } from './WorkflowProgressCard';
import { VoiceToggle } from './VoiceToggle';
import type { ToolCall } from '../types/tool-calls';
import type { WorkflowStep } from './WorkflowProgressCard';
import { apiFetchRaw } from '@quant/api-client';

interface AskQuantPanelProps {
  className?: string;
}

interface PlanPreview {
  id: string;
  description?: string;
  steps: Array<{ stepId: string; toolId: string; params?: Record<string, unknown> }>;
}

interface HeldPlanInfo {
  planId: string;
  reason?: string;
  steps: Array<{ stepId: string; toolId: string }>;
}

interface StreamState {
  isStreaming: boolean;
  toolCalls: ToolCall[];
  workflowSteps: WorkflowStep[];
  planDescription?: string;
  error?: string;
  completed: boolean;
  confirmationRequired?: HeldPlanInfo;
  rollbackInProgress: boolean;
  planPreview?: PlanPreview;
}

export function AskQuantPanel({ className = '' }: AskQuantPanelProps) {
  const [input, setInput] = useState('');
  const [streamState, setStreamState] = useState<StreamState>({
    isStreaming: false,
    toolCalls: [],
    workflowSteps: [],
    completed: false,
    rollbackInProgress: false,
  });
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceProcessing, setVoiceProcessing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  /**
   * Map a failed HTTP response to an honest, actionable message (instead of
   * a generic "Failed to connect"). 401 means the backend's real JWT
   * verification rejected the session — the user must sign in again.
   */
  const describeRequestError = useCallback(async (response: Response): Promise<string> => {
    if (response.status === 401) {
      return 'Your session expired — please sign in again.';
    }
    try {
      const payload = (await response.clone().json()) as {
        error?: string | { message?: string };
      };
      const message =
        typeof payload.error === 'string'
          ? payload.error
          : payload.error?.message;
      if (typeof message === 'string' && message.trim()) {
        return response.status === 503
          ? `Agent backend unavailable: ${message}`
          : message;
      }
    } catch {
      // Fall through to the generic message below.
    }
    return 'Failed to connect';
  }, []);

  const sendRequest = useCallback(
    async (requestBody: Record<string, unknown>) => {
      setStreamState({
        isStreaming: true,
        toolCalls: [],
        workflowSteps: [],
        completed: false,
        rollbackInProgress: false,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await apiFetchRaw('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setStreamState((prev) => ({
            ...prev,
            isStreaming: false,
            error: 'Failed to connect',
          }));
          // Replace the generic message with the actionable one once parsed.
          describeRequestError(response).then((message) => {
            setStreamState((prev) => ({ ...prev, error: message }));
          });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7);
            } else if (line.startsWith('data: ') && eventType) {
              const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
              handleSSEEvent(eventType, data);
              eventType = '';
            }
          }
        }

        setStreamState((prev) => ({ ...prev, isStreaming: false, completed: true }));
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setStreamState((prev) => ({
            ...prev,
            isStreaming: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          }));
        }
      }
    },
    [describeRequestError],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || streamState.isStreaming) return;

      // First do a dry-run to preview the plan
      await sendRequest({ input: trimmed, dryRun: true });
    },
    [input, streamState.isStreaming, sendRequest],
  );

  const handleExecutePlan = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setStreamState((prev) => ({
      ...prev,
      planPreview: undefined,
      completed: false,
      error: undefined,
    }));

    // The user reviewed the dry-run plan and clicked Execute. Execution goes
    // through the backend's held-plan flow: tier-1 steps run immediately,
    // tier-2+ steps are held server-side and only resume via an explicit
    // POST /api/agentic/confirm/:planId after the user accepts the
    // confirmation dialog. No client-asserted `confirmed` flag is sent —
    // the server never trusts the client's word that a plan was reviewed.
    await sendRequest({ input: trimmed, dryRun: false });
  }, [input, sendRequest]);

  const handleSSEEvent = (eventType: string, data: Record<string, unknown>) => {
    switch (eventType) {
      case 'plan_created': {
        const plan = data.plan as
          | { id?: string; description?: string; steps?: Array<{ stepId: string; toolId: string; params?: Record<string, unknown> }> }
          | undefined;
        if (plan?.steps) {
          const steps: WorkflowStep[] = plan.steps.map((s) => ({
            stepId: s.stepId,
            toolId: s.toolId,
            status: 'pending' as const,
          }));
          setStreamState((prev) => ({
            ...prev,
            workflowSteps: steps,
            planDescription: plan.description,
            planPreview: {
              id: plan.id ?? '',
              description: plan.description,
              steps: plan.steps ?? [],
            },
          }));
        }
        break;
      }
      case 'step_start': {
        const stepId = data.stepId as string;
        const toolId = data.toolId as string;
        setStreamState((prev) => ({
          ...prev,
          workflowSteps: prev.workflowSteps.map((s) =>
            s.stepId === stepId ? { ...s, status: 'running' as const, startedAt: Date.now() } : s,
          ),
          toolCalls: [
            ...prev.toolCalls,
            {
              id: stepId,
              name: toolId,
              status: 'running' as const,
              arguments: {},
            },
          ],
        }));
        break;
      }
      case 'step_complete': {
        const stepId = data.stepId as string;
        const result = data.result as { latencyMs?: number; data?: unknown } | undefined;
        setStreamState((prev) => ({
          ...prev,
          workflowSteps: prev.workflowSteps.map((s) =>
            s.stepId === stepId
              ? {
                  ...s,
                  status: 'completed' as const,
                  completedAt: Date.now(),
                  result: result?.data,
                }
              : s,
          ),
          toolCalls: prev.toolCalls.map((tc) =>
            tc.id === stepId
              ? {
                  ...tc,
                  status: 'completed' as const,
                  duration: result?.latencyMs,
                  result: result?.data,
                }
              : tc,
          ),
        }));
        break;
      }
      case 'step_failed': {
        const stepId = data.stepId as string;
        const errorMsg = data.error as string | undefined;
        setStreamState((prev) => ({
          ...prev,
          workflowSteps: prev.workflowSteps.map((s) =>
            s.stepId === stepId
              ? { ...s, status: 'failed' as const, completedAt: Date.now(), error: errorMsg }
              : s,
          ),
          toolCalls: prev.toolCalls.map((tc) =>
            tc.id === stepId ? { ...tc, status: 'failed' as const, error: errorMsg } : tc,
          ),
        }));
        break;
      }
      case 'confirmation_required': {
        // The backend held a tier-2+ plan server-side and issued a planId.
        // Approval happens ONLY through POST /api/agentic/confirm/:planId —
        // never by re-sending the request with a client-asserted flag.
        const planId = typeof data.planId === 'string' ? data.planId : '';
        const reason = typeof data.reason === 'string' ? data.reason : undefined;
        const steps = Array.isArray(data.steps)
          ? (data.steps as Array<{ stepId?: string; toolId?: string }>)
              .filter((s) => typeof s.stepId === 'string' && typeof s.toolId === 'string')
              .map((s) => ({ stepId: s.stepId as string, toolId: s.toolId as string }))
          : [];
        if (planId) {
          setStreamState((prev) => ({
            ...prev,
            confirmationRequired: { planId, reason, steps },
          }));
        }
        break;
      }
      case 'rollback_start': {
        setStreamState((prev) => ({
          ...prev,
          rollbackInProgress: true,
        }));
        break;
      }
      case 'rollback_complete': {
        setStreamState((prev) => ({
          ...prev,
          rollbackInProgress: false,
        }));
        break;
      }
      case 'error': {
        setStreamState((prev) => ({
          ...prev,
          error: data.error as string,
        }));
        break;
      }
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setStreamState((prev) => ({ ...prev, isStreaming: false }));
  };

  const handleVoiceToggle = useCallback(async () => {
    if (voiceActive) {
      // Stop recording
      setVoiceActive(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } else {
      // Start recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          setVoiceProcessing(true);
          stream.getTracks().forEach((track) => track.stop());

          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const arrayBuffer = await audioBlob.arrayBuffer();
          const base64 = btoa(
            String.fromCharCode(...new Uint8Array(arrayBuffer)),
          );

          await sendRequest({ voice: true, audio: base64 });
          setVoiceProcessing(false);
        };

        mediaRecorder.start();
        setVoiceActive(true);
      } catch {
        setStreamState((prev) => ({
          ...prev,
          error: 'Could not access microphone',
        }));
      }
    }
  }, [voiceActive, sendRequest]);

  /**
   * Resolve the held plan via the explicit confirm round-trip. Accepting
   * resumes the server-held plan (single-use planId, owner-bound on the
   * backend); rejecting tells the backend to drop it. Nothing executes
   * unless the backend's /agentic/confirm/:planId says so.
   */
  const handleConfirmation = useCallback(
    async (accepted: boolean) => {
      const pending = streamState.confirmationRequired;
      // Always dismiss the dialog first.
      setStreamState((prev) => ({ ...prev, confirmationRequired: undefined }));
      if (!pending) return;

      setStreamState((prev) => ({ ...prev, isStreaming: true, error: undefined }));

      let response: Response;
      try {
        response = await apiFetchRaw(
          `/api/agentic/confirm/${encodeURIComponent(pending.planId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approved: accepted }),
            signal: abortRef.current?.signal ?? undefined,
          },
        );
      } catch (err) {
        setStreamState((prev) => ({
          ...prev,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Confirmation request failed',
        }));
        return;
      }

      if (!response.ok) {
        const message = await describeRequestError(response);
        setStreamState((prev) => ({ ...prev, isStreaming: false, error: message }));
        return;
      }

      if (!accepted) {
        setStreamState((prev) => ({
          ...prev,
          isStreaming: false,
          completed: true,
          error: 'Plan rejected by the user. Nothing was executed.',
        }));
        return;
      }

      // Approved: the backend executed the held plan. Render the results as
      // completed tool calls so the user sees exactly what ran.
      try {
        const payload = (await response.json()) as {
          success?: boolean;
          data?: { results?: Array<{ toolId?: string; success?: boolean; data?: unknown; error?: string; latencyMs?: number }> };
        };
        const results = payload.data?.results ?? [];
        const toolCalls: ToolCall[] = results.map((r, i) => ({
          id: `confirmed-step-${i}`,
          name: typeof r.toolId === 'string' ? r.toolId : 'tool',
          status: r.success ? ('completed' as const) : ('failed' as const),
          arguments: {},
          result: r.data,
          duration: typeof r.latencyMs === 'number' ? r.latencyMs : undefined,
          error: r.error,
        }));
        const workflowSteps: WorkflowStep[] = results.map((r, i) => ({
          stepId: `confirmed-step-${i}`,
          toolId: typeof r.toolId === 'string' ? r.toolId : 'tool',
          status: r.success ? ('completed' as const) : ('failed' as const),
          completedAt: Date.now(),
          result: r.data,
          error: r.error,
        }));
        setStreamState((prev) => ({
          ...prev,
          isStreaming: false,
          completed: true,
          planPreview: undefined,
          toolCalls,
          workflowSteps,
        }));
      } catch {
        setStreamState((prev) => ({
          ...prev,
          isStreaming: false,
          error: 'Plan approved, but the result could not be read.',
        }));
      }
    },
    [streamState.confirmationRequired, describeRequestError],
  );

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Quant to do something..."
          aria-label="Ask Quant"
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--quant-border)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={streamState.isStreaming}
        />
        <VoiceToggle
          isActive={voiceActive}
          onToggle={handleVoiceToggle}
          isProcessing={voiceProcessing}
        />
        {streamState.isStreaming ? (
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
            aria-label="Cancel request"
          >
            Cancel
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Submit command"
          >
            Preview
          </button>
        )}
      </form>

      {/* Plan Preview (Dry Run) */}
      <AnimatePresence>
        {streamState.planPreview && streamState.completed && !streamState.error && (
          <motion.div
            key="plan-preview"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-4 rounded-lg border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20"
          >
            <h3 className="text-sm font-semibold mb-2 text-blue-700 dark:text-blue-300">
              Plan Preview
            </h3>
            {streamState.planPreview.description && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                {streamState.planPreview.description}
              </p>
            )}
            <ul className="text-xs space-y-1 mb-3">
              {streamState.planPreview.steps.map((step) => (
                <li key={step.stepId} className="text-[var(--quant-text-secondary)]">
                  {step.stepId}: {step.toolId}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={handleExecutePlan}
              className="px-3 py-1.5 rounded-md bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors"
            >
              Execute
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {streamState.confirmationRequired && (
          <motion.div
            key="confirmation"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-4 rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20"
          >
            <h3 className="text-sm font-semibold mb-1 text-yellow-700 dark:text-yellow-300">
              Confirmation Required
            </h3>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-2">
              This plan wants to run actions that need your approval.
              {streamState.confirmationRequired.reason && (
                <> Reason: <strong>{streamState.confirmationRequired.reason}</strong></>
              )}
            </p>
            {streamState.confirmationRequired.steps.length > 0 && (
              <ul className="text-xs text-yellow-600 dark:text-yellow-400 mb-3 space-y-1">
                {streamState.confirmationRequired.steps.map((step) => (
                  <li key={step.stepId}>
                    {step.stepId}: <strong>{step.toolId}</strong>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleConfirmation(true)}
                className="px-3 py-1.5 rounded-md bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-colors"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => handleConfirmation(false)}
                className="px-3 py-1.5 rounded-md bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors"
              >
                Reject
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rollback indicator */}
      <AnimatePresence>
        {streamState.rollbackInProgress && (
          <motion.div
            key="rollback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="p-3 rounded-lg border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20"
          >
            <p className="text-sm text-orange-600 dark:text-orange-400">
              Rolling back completed steps...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {streamState.workflowSteps.length > 0 && !streamState.planPreview && (
          <motion.div
            key="workflow"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <WorkflowProgressCard
              steps={streamState.workflowSteps}
              planDescription={streamState.planDescription}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {streamState.toolCalls.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            {streamState.toolCalls.map((tc) => (
              <motion.div
                key={tc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              >
                <ToolCallCard toolCall={tc} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {streamState.error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20"
        >
          <p className="text-sm text-red-600 dark:text-red-400">{streamState.error}</p>
        </motion.div>
      )}

      {streamState.completed && !streamState.error && !streamState.planPreview && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20"
        >
          <p className="text-sm text-green-600 dark:text-green-400">
            Command executed successfully
          </p>
        </motion.div>
      )}
    </div>
  );
}

export default AskQuantPanel;
