'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { QuantyAvatar } from './QuantyAvatar';
import { QuantyModeChooser, type QuantyChooserSelection } from './QuantyModeChooser';
import { QuantyPopup } from './QuantyPopup';
import { QuantyCommandBar } from './QuantyCommandBar';
import { QuantyActivityFeed } from './QuantyActivityFeed';
import { QuantyResultCard } from './QuantyResultCard';
import { QuantyActionHighlight } from './QuantyActionHighlight';
import { useQuantyAgent } from './useQuantyAgent';
import type {
  QuantyAgentMode,
  QuantyLiveAgentHandle,
  QuantyStep,
  QuantyTaskStatus,
} from './types';

export interface QuantyLiveAgentProps {
  /** API base for the tasks backend. */
  apiBase?: string;
  /** API base for the popup dashboard data. */
  popupApiBase?: string;
  /**
   * Fires when the user picks Chat in the mode chooser. The parent wires the
   * existing Quanty chat drawer here; the chooser hides itself.
   */
  onChatSelect?: () => void;
  /** Edit SOUL / MEMORY from the Identity tab. */
  onEditIdentity?: (kind: 'soul' | 'memory') => void;
  className?: string;
}

/** Commands that end the voice session instead of going to the backend. */
const END_SESSION_PATTERN = /^(bye|alvida|band karo|bas karo|stop|khatm)\s*[.!]*$/i;

/** How long a manually re-shown spotlight stays up (ms). */
const MANUAL_HIGHLIGHT_MS = 2800;

interface Highlight {
  selector: string;
  label: string;
  key: string | number;
}

/**
 * QuantyLiveAgent — the contextual agentic surface.
 *
 *   1. User taps the Quanty AI button → `ref.open()` → mode chooser
 *      [Chat] [Voice Live Agent]
 *   2. Chat  → onChatSelect() (existing behavior), chooser hides.
 *      Voice → avatar animates to the front-camera position, voice session
 *              starts, live panel opens below it.
 *   3. TAP THE AVATAR → the 5-tab inspector popup opens
 *      (Activity / Approvals / Browser / Schedule / Identity). X or outside
 *      tap closes it; the avatar and session remain.
 *
 * VISIBLE LIVE OPERATION: every agent step carries an optional
 * `targetSelector`. While a step runs, QuantyActionHighlight puts a glowing
 * pulse ring on that UI element with the action label — the user watches the
 * email row highlight before it gets archived. Tapping a finished step
 * re-shows where it acted. Nothing happens silently.
 *
 * Mount once, high in the tree (next to AppShell), not per-route: the task
 * survives route changes while Quanty works.
 */
export const QuantyLiveAgent = forwardRef<QuantyLiveAgentHandle, QuantyLiveAgentProps>(
  function QuantyLiveAgent({ apiBase, popupApiBase, onChatSelect, onEditIdentity, className = '' }, ref) {
    const reduceMotion = useReducedMotion();
    const [mode, setMode] = useState<QuantyAgentMode>('hidden');
    const [popupOpen, setPopupOpen] = useState(false);
    const [panelExpanded, setPanelExpanded] = useState(true);
    const [feedCollapsed, setFeedCollapsed] = useState(false);
    const [manualHighlight, setManualHighlight] = useState<Highlight | null>(null);
    const agent = useQuantyAgent({ apiBase });
    const { task, running } = agent;

    const status: QuantyTaskStatus = task?.status ?? 'idle';
    const inVoice = mode === 'voice';
    const runningStep = task?.steps.find((s) => s.status === 'running');

    // Manual spotlight auto-clears; the live one takes over again.
    useEffect(() => {
      if (!manualHighlight) return;
      const t = window.setTimeout(() => setManualHighlight(null), MANUAL_HIGHLIGHT_MS);
      return () => window.clearTimeout(t);
    }, [manualHighlight]);

    const close = useCallback(() => {
      // Interrupt a running task so the backend doesn't keep working for a
      // session the user walked away from.
      if (task && (task.status === 'thinking' || task.status === 'working' || task.status === 'waiting-confirm')) {
        void agent.interrupt().catch(() => undefined);
      }
      agent.reset();
      setMode('hidden');
      setPopupOpen(false);
      setPanelExpanded(true);
      setFeedCollapsed(false);
      setManualHighlight(null);
    }, [agent, task]);

    const open = useCallback(() => setMode('chooser'), []);
    const startVoice = useCallback(() => {
      setPanelExpanded(true);
      setFeedCollapsed(false);
      setPopupOpen(false);
      setMode('voice');
    }, []);

    useImperativeHandle(ref, () => ({ open, startVoice, close }), [open, startVoice, close]);

    const handleChooserSelect = useCallback(
      (selection: QuantyChooserSelection) => {
        if (selection === 'chat') {
          setMode('hidden');
          onChatSelect?.();
        } else {
          startVoice();
        }
      },
      [onChatSelect, startVoice],
    );

    const handleSubmit = async (command: string) => {
      if (END_SESSION_PATTERN.test(command.trim())) {
        close();
        return;
      }
      try {
        await agent.submitCommand(command);
        setFeedCollapsed(false);
      } catch {
        /* submitCommand already surfaced the error on agent.error */
      }
    };

    const handleUndo = async (taskId: string) => {
      try {
        await agent.undoTask(taskId);
        agent.reset();
      } catch {
        /* undoTask already surfaced the error */
      }
    };

    const handleStepTap = useCallback((step: QuantyStep) => {
      if (!step.targetSelector) return;
      setManualHighlight({ selector: step.targetSelector, label: step.label, key: `manual-${step.id}-${Date.now()}` });
    }, []);

    // Spotlight: manual re-show wins; otherwise the running step's target.
    const highlight: Highlight | null =
      manualHighlight ??
      (runningStep?.targetSelector
        ? { selector: runningStep.targetSelector, label: runningStep.label, key: runningStep.id }
        : null);

    // Live status: the running step's label beats the generic status line.
    const liveStatus = runningStep?.label ?? (task && running ? task.command : undefined);

    return (
      <>
        <QuantyModeChooser
          open={mode === 'chooser'}
          onSelect={handleChooserSelect}
          onClose={() => setMode('hidden')}
        />

        {/* 5-tab inspector — avatar tap only, avatar stays visible behind */}
        <QuantyPopup
          open={inVoice && popupOpen}
          onClose={() => setPopupOpen(false)}
          liveStatus={liveStatus}
          busy={running}
          onEditIdentity={onEditIdentity}
          dataApiBase={popupApiBase}
        />

        <QuantyAvatar
          active={inVoice}
          status={status}
          actionLabel={liveStatus}
          onToggle={() => setPopupOpen((v) => !v)}
          className={className}
        />

        {/* Visible spotlight on whatever Quanty is acting on */}
        <QuantyActionHighlight
          selector={highlight?.selector}
          targetKey={highlight?.key}
          label={highlight?.label}
          active={!!highlight}
        />

        {/* Voice panel — part of the session, never standalone */}
        <AnimatePresence>
          {inVoice && panelExpanded && (
            <motion.div
              key="quanty-voice-panel"
              initial={reduceMotion ? undefined : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="pointer-events-auto fixed inset-x-0 top-[104px] z-[69] mx-auto flex w-full max-w-md flex-col gap-3 px-4"
              role="dialog"
              aria-label="Quanty voice live agent"
            >
              {/* Session header */}
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-amber-300 backdrop-blur-md">
                  <span aria-hidden="true" className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                  </span>
                  Voice Live Agent
                </span>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Voice session band karein"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-zinc-300 backdrop-blur-md transition hover:bg-black/80 hover:text-white"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2.5 2.5l9 9M11.5 2.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <QuantyCommandBar onSubmit={handleSubmit} busy={running} autoStartListening />

              {agent.error && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-500/25 bg-red-950/70 px-4 py-3 text-sm text-red-200 backdrop-blur-xl"
                >
                  {agent.error}
                </div>
              )}

              {task && (
                <QuantyActivityFeed
                  steps={task.steps}
                  running={running}
                  collapsed={feedCollapsed}
                  onToggleCollapse={() => setFeedCollapsed((c) => !c)}
                  onInterrupt={() => void agent.interrupt()}
                  onConfirmStep={(stepId) => void agent.confirmStep(stepId)}
                  onCancelStep={(stepId) => void agent.cancelStep(stepId)}
                  onStepTap={handleStepTap}
                />
              )}

              {task && (task.status === 'done' || task.status === 'failed') && (
                <QuantyResultCard
                  task={task}
                  onUndo={handleUndo}
                  onRetry={handleSubmit}
                  onDismiss={agent.reset}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  },
);
