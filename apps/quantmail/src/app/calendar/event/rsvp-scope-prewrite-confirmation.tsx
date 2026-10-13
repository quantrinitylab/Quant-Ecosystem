// ============================================================================
// QuantCalendar — RSVP pre-write scope confirmation dialog.
//
// CODEX-REVIEW follow-up on #1100: the v1 contract writes every RSVP to the
// series-level attendee list, so BEFORE any request from a recurring series
// the user must see the authoritative effect and explicitly confirm it.
// Cancel/back produces zero mutation — the gate (createRsvpWriteGate) only
// posts on the Confirm path.
//
// Keyboard/focus: the dialog traps initial focus on Confirm, Escape cancels,
// and on unmount focus is restored to the RSVP button that opened it.
// Pure-black, no divider lines, Calendar blue accent (#4285F4).
// ============================================================================

import { useEffect, useRef } from 'react';
import {
  buildRsvpPreWriteCopy,
  formatOccurrenceLabel,
  RSVP_LABELS,
  type RsvpScopeInfo,
  type RsvpStatus,
} from './event-detail-utils';

export function RsvpScopePrewriteConfirmation({
  status,
  scope,
  timeZone,
  isPending,
  openerRef,
  onConfirm,
  onCancel,
}: {
  status: RsvpStatus;
  scope: RsvpScopeInfo;
  timeZone?: string;
  /** True while the RSVP mutation is in flight — locks both actions. */
  isPending: boolean;
  /** The RSVP button that opened the dialog; focus is restored here. */
  openerRef: React.RefObject<HTMLButtonElement | null>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const occurrenceLabel = scope.fromOccurrence
    ? formatOccurrenceLabel(scope.fromOccurrence, timeZone)
    : null;
  const copy = buildRsvpPreWriteCopy(status, scope, occurrenceLabel);

  useEffect(() => {
    // Initial focus on Confirm; Escape cancels. On unmount, restore focus
    // to the button that opened the dialog.
    confirmRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openerRef.current?.focus();
    };
  }, [onCancel, openerRef]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm your response"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#4285F4]/15"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-5 w-5 text-[#a8c7fa]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8.5l3.2 3.2L13 5" />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--quant-foreground)]">
              Respond {RSVP_LABELS[status]}?
            </h2>
            <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">{copy}</p>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="min-h-11 flex-1 rounded-lg bg-[#4285F4] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? 'Sending…' : `Confirm — ${RSVP_LABELS[status]}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="min-h-11 flex-1 rounded-lg border border-[var(--quant-border)] px-4 text-sm font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-muted)] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
