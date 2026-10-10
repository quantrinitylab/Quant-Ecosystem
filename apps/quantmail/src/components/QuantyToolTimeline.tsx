'use client';

/**
 * Quanty visible agent mode (§9) — per-message activity timeline.
 *
 * Renders one step per `AiChatToolExecutionCard` on the assistant message that
 * produced it: the backend label, a status icon, and the run duration. Status
 * goes through the shared `QuantyStepStatus` vocabulary (done / error /
 * waiting-confirm) with the same icon language as `QuantyActivityFeed`.
 *
 * Honesty rules:
 *  - A `failed` step shows its failure plainly; an unwired-capability failure
 *    (unknown / disallowed / not-wired tool) shows the "not wired up yet"
 *    note — never a claim the action ran.
 *  - A `pending-confirmation` step is explicitly marked as NOT executed.
 *  - Per-step live streaming is out of scope here: ai/chat is a synchronous
 *    request/response, so this timeline renders from the response.
 */
import type { ReactNode } from 'react';
import type { QuantyStepStatus } from './QuantyLiveAgent/types';
import {
  formatToolDuration,
  isUnwiredToolFailure,
  toolExecutionToStepStatus,
  toolStepLabel,
  unwiredToolNote,
  type AiChatToolExecutionCard,
} from './quanty-agent-cards';

const STATUS_SR: Record<QuantyStepStatus, string> = {
  pending: 'pending',
  running: 'running',
  done: 'done',
  error: 'failed',
  'waiting-confirm': 'waiting for confirmation',
  skipped: 'skipped',
};

function StatusIcon({ status }: { status: QuantyStepStatus }): ReactNode {
  if (status === 'done') {
    return (
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M3 8.5l3.2 3.2L13 5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        aria-hidden="true"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  // waiting-confirm: the call is parked, NOT executed.
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 4.5V8l2 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    </span>
  );
}

function ToolStep({ execution }: { execution: AiChatToolExecutionCard }): ReactNode {
  const stepStatus = toolExecutionToStepStatus(execution.status);
  const duration = formatToolDuration(execution.durationMs);
  const unwired = isUnwiredToolFailure(execution);
  const ariaLabel = `${toolStepLabel(execution)} — ${STATUS_SR[stepStatus]}${
    duration ? ` — ${duration}` : ''
  }`;

  return (
    <li aria-label={ariaLabel} className="flex items-start gap-2 py-1">
      <StatusIcon status={stepStatus} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-snug text-[var(--quant-foreground)]">
          {toolStepLabel(execution)}
        </p>
        {execution.status === 'pending-confirmation' && (
          <p className="mt-0.5 text-[10px] leading-snug text-amber-300/90">
            Waiting for your approval — nothing has been executed.
          </p>
        )}
        {execution.status === 'failed' && (
          <p className="mt-0.5 text-[10px] leading-snug text-[var(--quant-muted-foreground)]">
            {unwired ? unwiredToolNote(execution.toolName) : (execution.error?.message ?? 'Failed.')}
          </p>
        )}
      </div>
      {duration && (
        <span className="shrink-0 text-[10px] tabular-nums text-[var(--quant-muted-foreground)]">
          {duration}
        </span>
      )}
    </li>
  );
}

/**
 * The activity timeline for one assistant turn. Renders nothing when the turn
 * carried no tool runs — a plain answer needs no action layer.
 */
export function QuantyToolTimeline({
  executions,
}: {
  executions: AiChatToolExecutionCard[];
}): ReactNode {
  if (!executions || executions.length === 0) return null;
  return (
    <div
      aria-label="Quanty actions"
      className="mt-2 rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-1"
    >
      <ul className="divide-y divide-white/[0.06]">{executions.map((e) => (
        <ToolStep key={e.callId || `${e.toolName}-${e.status}`} execution={e} />
      ))}</ul>
    </div>
  );
}
