'use client';

// ============================================================================
// FileScanBadge — QM-M39-009 (M39 screen 29: security/scanning state)
// ============================================================================
//
// Renders a file's security scan state as a small pill badge, plus a details
// row variant for file-details/preview contexts.
//
// HONESTY CONTRACT (standing user rule):
// - 'unknown' renders as "Not scanned" (neutral gray) — NEVER as safe.
// - A green "Scanned · clean" badge appears only when the backend honestly
//   reports scanStatus === 'clean', i.e. a real scan ran.

export type FileScanStatus = 'pending' | 'scanning' | 'clean' | 'quarantined' | 'unknown';

const VALID_STATUSES: readonly string[] = ['pending', 'scanning', 'clean', 'quarantined', 'unknown'];

/** Anything unexpected (missing field, garbage) is honestly 'unknown'. */
export function normalizeScanStatus(value: unknown): FileScanStatus {
  return VALID_STATUSES.includes(value as string) ? (value as FileScanStatus) : 'unknown';
}

const LABELS: Record<FileScanStatus, string> = {
  pending: 'Scan queued',
  scanning: 'Scanning',
  clean: 'Scanned · clean',
  quarantined: 'Quarantined',
  unknown: 'Not scanned',
};

const EXPLANATIONS: Record<FileScanStatus, string> = {
  pending: 'Waiting in the security scan queue.',
  scanning: 'A security scan is currently running on this file.',
  clean: 'A security scan completed and found no threats.',
  quarantined: 'Flagged by a security scan. Preview and download are disabled.',
  unknown: 'This file has not been security-scanned. Treat it with care.',
};

const STYLES: Record<FileScanStatus, string> = {
  pending:
    'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/30',
  scanning:
    'bg-[#38BDF8]/10 text-[#38BDF8] border-[#38BDF8]/30 animate-pulse',
  clean:
    'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/30',
  quarantined:
    'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/40',
  unknown:
    'bg-[#64748B]/10 text-[#94A3B8] border-[#64748B]/30',
};

export interface FileScanBadgeProps {
  status?: string | null;
  reason?: string | null;
  className?: string;
}

export function FileScanBadge({ status, reason, className = '' }: FileScanBadgeProps) {
  const normalized = normalizeScanStatus(status);
  const title = reason ? `${LABELS[normalized]} — ${reason}` : EXPLANATIONS[normalized];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-mono font-semibold border ${STYLES[normalized]} ${className}`}
      title={title}
      data-scan-status={normalized}
      role="status"
      aria-label={`Security scan status: ${LABELS[normalized]}`}
    >
      <span
        className={`size-1.5 rounded-full ${
          normalized === 'clean'
            ? 'bg-[#10B981]'
            : normalized === 'quarantined'
              ? 'bg-[#EF4444]'
              : normalized === 'unknown'
                ? 'bg-[#64748B]'
                : normalized === 'pending'
                  ? 'bg-[#F59E0B]'
                  : 'bg-[#38BDF8]'
        }`}
        aria-hidden="true"
      />
      {LABELS[normalized]}
    </span>
  );
}

/**
 * Details-context row: badge plus the honest one-line explanation. Used in
 * the preview modal and any future file-details panel (QM-M39-007).
 */
export function FileScanDetail({ status, reason }: { status?: string | null; reason?: string | null }) {
  const normalized = normalizeScanStatus(status);
  return (
    <div className="flex items-start gap-2" data-scan-status={normalized}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B] shrink-0 pt-0.5">
        Security
      </span>
      <div className="min-w-0">
        <FileScanBadge status={normalized} reason={reason} />
        <p className="text-[11px] text-[#94A3B8] mt-1">
          {EXPLANATIONS[normalized]}
          {normalized === 'quarantined' && reason ? ` Reason: ${reason}` : ''}
        </p>
      </div>
    </div>
  );
}
