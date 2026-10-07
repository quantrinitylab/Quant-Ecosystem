'use client';

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToolCallCard } from './ToolCallCard';
import { WorkflowProgressCard } from './WorkflowProgressCard';
import { VoiceToggle } from './VoiceToggle';
import type { ToolCall } from '../types/tool-calls';
import type { WorkflowStep } from './WorkflowProgressCard';

interface AskQuantPanelProps {
  className?: string;
}

interface PlanPreview {
  id: string;
  description?: string;
  steps: Array<{ stepId: string; toolId: string; params?: Record<string, unknown> }>;
}

interface StreamState {
  isStreaming: boolean;
  toolCalls: ToolCall[];
  workflowSteps: WorkflowStep[];
  planDescription?: string;
  error?: string;
  completed: boolean;
  confirmationRequired?: { stepId: string; toolId: string };
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
  // Last non-dry-run request body, so the confirmation dialog can re-send
  // it with explicit confirmation (Accept) or abort it (Reject).
  const lastRequestRef = useRef<Record<string, unknown> | null>(null);

  const sendRequest = useCallback(
    async (requestBody: Record<string, unknown>) => {
      // Remember the last real (non-dry-run) request so a confirmation
      // dialog can re-send it with explicit user confirmation.
      if (!requestBody.dryRun) {
        lastRequestRef.current = requestBody;
      }

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
        const response = await fetch('/api/ask', {
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
    [],
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

    // The user reviewed the dry-run plan and clicked Execute — this is the
    // explicit confirmation. The server only runs confirmation-gated tools
    // when it sees confirmed: true.
    await sendRequest({ input: trimmed, dryRun: false, confirmed: true });
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
        const stepId = data.stepId as string;
        const toolId = data.toolId as string;
        setStreamState((prev) => ({
          ...prev,
          confirmationRequired: { stepId, toolId },
        }));
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

  const handleConfirmation = useCallback(
    (accepted: boolean) => {
      const pending = streamState.confirmationRequired;
      // Always dismiss the dialog first.
      setStreamState((prev) => ({ ...prev, confirmationRequired: undefined }));
      if (!pending) return;

      if (accepted) {
        // User accepted: re-send the original request with this step
        // explicitly confirmed. The server will only run the gated tool
        // when it sees the step ID in confirmedSteps.
        const base = lastRequestRef.current ?? { input: input.trim(), dryRun: false };
        const prevSteps = Array.isArray(base.confirmedSteps) ? base.confirmedSteps : [];
        void sendRequest({
          ...base,
          dryRun: false,
          confirmed: true,
          confirmedSteps: [...prevSteps, pending.stepId],
        });
      } else {
        // User rejected: abort the in-flight stream so nothing else runs.
        abortRef.current?.abort();
        setStreamState((prev) => ({
          ...prev,
          isStreaming: false,
          error: `Step ${pending.stepId} was rejected by the user. Execution stopped.`,
        }));
      }
    },
    [streamState.confirmationRequired, input, sendRequest],
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
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-3">
              Step {streamState.confirmationRequired.stepId} wants to execute{' '}
              <strong>{streamState.confirmationRequired.toolId}</strong>. This action requires elevated permissions.
            </p>
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
