'use client';

import type { AdminDlpPolicy, AdminAuditLogEntry } from '../../services/api-client';
import type { AuditLogPage } from '../../hooks/useAdminDlpAudit';
import { SectionCard } from './AdminStates';

/**
 * M20 Admin DLP/Audit — presentational components.
 *
 * DLP policies come from `GET /admin/mail/dlp/policies` (read-only,
 * `EnterpriseMailComplianceRule` rows). Audit entries come from the
 * staff-gated `GET /admin/audit/logs` — a read-only viewer; writes are
 * server-side only, so there is intentionally no "add entry" affordance.
 */

const ACTION_TONES: Record<string, string> = {
  BLOCK: 'bg-red-400/15 text-red-300',
  QUARANTINE: 'bg-amber-400/15 text-amber-300',
  ENCRYPT: 'bg-sky-400/15 text-sky-300',
  AUDIT_LOG: 'bg-[var(--quant-muted-foreground)]/15 text-[var(--quant-muted-foreground)]',
};

export function DlpPoliciesTable({ policies }: { policies: AdminDlpPolicy[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--quant-border)] text-[var(--quant-muted-foreground)]">
            <th className="pb-2 pr-4 font-medium">Policy</th>
            <th className="pb-2 pr-4 font-medium">Type</th>
            <th className="pb-2 pr-4 font-medium">Action</th>
            <th className="pb-2 pr-4 font-medium">Severity</th>
            <th className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((policy) => (
            <tr key={policy.id} className="border-b border-[var(--quant-border)]/50 last:border-0">
              <td className="py-3 pr-4">
                <div className="font-semibold text-[var(--quant-foreground)]">{policy.name}</div>
                {policy.description && (
                  <div className="mt-0.5 max-w-sm text-[11px] text-[var(--quant-muted-foreground)]">
                    {policy.description}
                  </div>
                )}
                <div className="mt-0.5 font-mono text-[10px] text-[var(--quant-muted-foreground)]/70">
                  {policy.id}
                </div>
              </td>
              <td className="py-3 pr-4 font-mono text-[11px] text-[var(--quant-foreground)]">
                {policy.ruleType}
              </td>
              <td className="py-3 pr-4">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    ACTION_TONES[policy.action] ?? ACTION_TONES.AUDIT_LOG
                  }`}
                >
                  {policy.action}
                </span>
              </td>
              <td className="py-3 pr-4 text-[var(--quant-foreground)]">{policy.severity}</td>
              <td className="py-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--quant-foreground)]">
                  <span
                    className={`inline-flex h-1.5 w-1.5 rounded-full ${
                      policy.enabled ? 'bg-emerald-400' : 'bg-[var(--quant-muted-foreground)]/50'
                    }`}
                  />
                  {policy.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface AuditFilters {
  action: string;
  resource: string;
  userId: string;
  from: string;
  to: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  action: '',
  resource: '',
  userId: '',
  from: '',
  to: '',
};

export function AuditLogFilters({
  filters,
  onChange,
  onApply,
  onClear,
}: {
  filters: AuditFilters;
  onChange: (filters: AuditFilters) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const set = (key: keyof AuditFilters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...filters, [key]: e.target.value });
  const inputClass =
    'w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-2 text-xs text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)]/60';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
    >
      <input aria-label="Filter by action" placeholder="Action contains…" value={filters.action} onChange={set('action')} className={inputClass} />
      <input aria-label="Filter by resource" placeholder="Resource contains…" value={filters.resource} onChange={set('resource')} className={inputClass} />
      <input aria-label="Filter by user" placeholder="User ID…" value={filters.userId} onChange={set('userId')} className={inputClass} />
      <input aria-label="From date" type="date" value={filters.from} onChange={set('from')} className={inputClass} />
      <input aria-label="To date" type="date" value={filters.to} onChange={set('to')} className={inputClass} />
      <div className="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-5">
        <button
          type="submit"
          className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-xs font-medium text-white hover:opacity-90"
        >
          Apply filters
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-lg border border-[var(--quant-border)] px-4 py-2 text-xs font-medium text-[var(--quant-muted-foreground)] hover:opacity-90"
        >
          Clear
        </button>
      </div>
    </form>
  );
}

export function AuditLogTable({ entries }: { entries: AdminAuditLogEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--quant-border)] text-[var(--quant-muted-foreground)]">
            <th className="pb-2 pr-4 font-medium">Time</th>
            <th className="pb-2 pr-4 font-medium">Action</th>
            <th className="pb-2 pr-4 font-medium">Resource</th>
            <th className="pb-2 pr-4 font-medium">Actor</th>
            <th className="pb-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-[var(--quant-border)]/50 align-top last:border-0">
              <td className="whitespace-nowrap py-2.5 pr-4 font-mono text-[11px] text-[var(--quant-muted-foreground)]">
                {new Date(entry.timestamp).toLocaleString()}
              </td>
              <td className="py-2.5 pr-4 font-mono text-[11px] font-semibold text-[var(--quant-foreground)]">
                {entry.action}
              </td>
              <td className="py-2.5 pr-4 font-mono text-[11px] text-[var(--quant-foreground)]">
                {entry.resource}
                {entry.resourceId && (
                  <div className="text-[10px] text-[var(--quant-muted-foreground)]">
                    {entry.resourceId}
                  </div>
                )}
              </td>
              <td className="py-2.5 pr-4 font-mono text-[11px] text-[var(--quant-muted-foreground)]">
                {entry.userId}
                {entry.orgId && <div className="text-[10px]">org {entry.orgId}</div>}
              </td>
              <td className="max-w-xs py-2.5 font-mono text-[10px] text-[var(--quant-muted-foreground)]">
                <span className="line-clamp-2 break-all">
                  {JSON.stringify(entry.metadata ?? {})}
                </span>
                {(entry.ip || entry.userAgent) && (
                  <div className="mt-0.5 truncate">
                    {[entry.ip, entry.userAgent].filter(Boolean).join(' · ')}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AuditPagination({
  page,
  onPrev,
  onNext,
}: {
  page: AuditLogPage;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { pagination, nextCursor } = page;
  return (
    <div className="flex items-center justify-between pt-3">
      <div className="font-mono text-[11px] text-[var(--quant-muted-foreground)]">
        Page {pagination.page} of {pagination.totalPages} · {pagination.total} total entries
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={pagination.page <= 1}
          className="rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-foreground)] hover:opacity-90 disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!nextCursor && pagination.page >= pagination.totalPages}
          className="rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-foreground)] hover:opacity-90 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export { SectionCard };
