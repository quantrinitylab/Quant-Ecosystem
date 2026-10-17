// ============================================================================
// QuantCalendar — RSVP scope confirmation (v1 occurrence-vs-series contract).
//
// After an RSVP succeeds, the backend reports exactly what the write covered
// (rsvpScope: occurrence vs event id, series vs single event). This renders
// that scope inline under "Your response" so the user is never left guessing
// whether their RSVP hit one occurrence or the whole series.
//
// Pure-black, no divider lines, Calendar blue accent (#4285F4).
// ============================================================================

import {
  buildRsvpScopeCopy,
  formatOccurrenceLabel,
  type RsvpScopeInfo,
  type RsvpStatus,
} from './event-detail-utils';

export function RsvpScopeConfirmation({
  status,
  scope,
  timeZone,
}: {
  status: RsvpStatus;
  scope: RsvpScopeInfo;
  timeZone?: string;
}) {
  const occurrenceLabel = scope.fromOccurrence
    ? formatOccurrenceLabel(scope.fromOccurrence, timeZone)
    : null;
  const copy = buildRsvpScopeCopy(status, scope, occurrenceLabel);
  return (
    <p
      role="status"
      className="mt-3 flex items-start gap-2 rounded-xl border border-[#4285F4]/30 bg-[#4285F4]/10 px-3.5 py-2.5 text-sm text-[#a8c7fa]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="mt-0.5 h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8.5l3.2 3.2L13 5" />
      </svg>
      <span>{copy}</span>
    </p>
  );
}
