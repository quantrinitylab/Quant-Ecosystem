'use client';

import { useState } from 'react';
import type {
  AdminMailDomain,
  AdminMailDomainDnsCheck,
  AdminMailDomainLiveCheck,
  AdminMailDomainRegistration,
  AdminMailDomainVerification,
} from '../../services/api-client';
import { SectionCard } from './AdminStates';

/**
 * M19 Admin Domains — presentational components.
 *
 * Every row is rendered from a real `GET /admin/mail/domains` response:
 * domain name, cumulative verification stage, and the per-record checklist
 * derived from that stage. No fake domains, no invented DNS status.
 */

const STAGE_LABELS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Pending', tone: 'bg-[var(--quant-muted-foreground)]/20 text-[var(--quant-muted-foreground)]' },
  DNS_VERIFIED: { label: 'Ownership verified', tone: 'bg-sky-400/15 text-sky-300' },
  MX_VERIFIED: { label: 'MX verified', tone: 'bg-sky-400/15 text-sky-300' },
  SPF_VERIFIED: { label: 'SPF verified', tone: 'bg-sky-400/15 text-sky-300' },
  DKIM_VERIFIED: { label: 'DKIM verified', tone: 'bg-sky-400/15 text-sky-300' },
  DMARC_VERIFIED: { label: 'DMARC verified', tone: 'bg-sky-400/15 text-sky-300' },
  FULLY_VERIFIED: { label: 'Fully verified', tone: 'bg-emerald-400/15 text-emerald-300' },
};

export function StageBadge({ stage }: { stage: string }) {
  const meta = STAGE_LABELS[stage] ?? STAGE_LABELS.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.tone}`}
    >
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

export function DnsChecklist({ checklist }: { checklist: AdminMailDomainDnsCheck[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="DNS verification checklist">
      {checklist.map((check) => (
        <li
          key={check.key}
          title={check.label}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] ${
            check.status === 'verified'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)]'
          }`}
        >
          <span aria-hidden>{check.status === 'verified' ? '✓' : '○'}</span>
          {check.label}
        </li>
      ))}
    </ul>
  );
}

export function AddDomainForm({
  busy,
  formError,
  onSubmit,
}: {
  busy: boolean;
  formError: string | null;
  onSubmit: (domain: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
      className="flex flex-col gap-2 sm:flex-row"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="example.com"
        aria-label="Domain to register"
        autoComplete="off"
        spellCheck={false}
        disabled={busy}
        className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-2 font-mono text-sm text-[var(--quant-foreground)] placeholder:text-[var(--quant-muted-foreground)]/60 disabled:opacity-50 sm:max-w-xs"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? 'Adding…' : 'Add domain'}
      </button>
      {formError && <p className="text-xs text-amber-300 sm:self-center">{formError}</p>}
    </form>
  );
}

export function DomainsTable({
  domains,
  busyId,
  onVerify,
  onRemove,
}: {
  domains: AdminMailDomain[];
  /** Domain id currently running verify/remove — disables its buttons. */
  busyId: string | null;
  onVerify: (domain: AdminMailDomain) => void;
  onRemove: (domain: AdminMailDomain) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  return (
    <ul className="space-y-3">
      {domains.map((domain) => (
        <li
          key={domain.id}
          className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-4 py-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-mono text-sm font-semibold text-[var(--quant-foreground)]">
                  {domain.domain}
                </span>
                <StageBadge stage={domain.verificationStatus} />
                {domain.isPrimary && (
                  <span className="rounded-full border border-[var(--quant-border)] px-2 py-0.5 text-[10px] font-medium text-[var(--quant-muted-foreground)]">
                    primary
                  </span>
                )}
              </div>
              <div className="mt-1 font-mono text-[10px] text-[var(--quant-muted-foreground)]">
                added {new Date(domain.createdAt).toLocaleString()}
                {domain.verifiedAt
                  ? ` · verified ${new Date(domain.verifiedAt).toLocaleString()}`
                  : ' · not yet verified'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busyId === domain.id}
                onClick={() => onVerify(domain)}
                className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-card)] px-3 py-1.5 text-xs font-medium text-[var(--quant-foreground)] hover:opacity-90 disabled:opacity-50"
              >
                {busyId === domain.id ? 'Checking DNS…' : 'Verify DNS'}
              </button>
              {confirmId === domain.id ? (
                <>
                  <button
                    type="button"
                    disabled={busyId === domain.id}
                    onClick={() => {
                      setConfirmId(null);
                      onRemove(domain);
                    }}
                    className="rounded-lg bg-red-500/90 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Confirm remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-muted-foreground)] hover:opacity-90"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={busyId === domain.id}
                  onClick={() => setConfirmId(domain.id)}
                  className="rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-400/10 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <div className="mt-3">
            <DnsChecklist checklist={domain.dnsChecklist} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * DNS setup instructions returned by a fresh registration — the exact TXT/MX/
 * SPF/DKIM/DMARC records the admin must publish before verification can pass.
 */
export function DnsInstructionsPanel({
  registration,
  onDismiss,
}: {
  registration: AdminMailDomainRegistration;
  onDismiss: () => void;
}) {
  const instructions = registration.instructions;
  if (!instructions) return null;
  return (
    <section className="rounded-2xl border border-sky-400/25 bg-sky-400/5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
            DNS records for <span className="font-mono">{instructions.domain}</span>
          </h2>
          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
            Publish these records at your DNS provider, then run “Verify DNS”.
            {registration.alreadyRegistered
              ? ' This domain was already registered — the records below still apply.'
              : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-muted-foreground)] hover:opacity-90"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-4 space-y-2 overflow-x-auto">
        {instructions.records.map((record, index) => (
          <div
            key={`${record.type}-${record.name}-${index}`}
            className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-card)] px-3 py-2 font-mono text-[11px]"
          >
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-bold text-sky-300">{record.type}</span>
              <span className="text-[var(--quant-foreground)]">{record.name}</span>
            </div>
            <div className="mt-1 break-all text-[var(--quant-muted-foreground)]">
              {record.value}
              {record.priority != null && <span> · priority {record.priority}</span>}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--quant-muted-foreground)]/80">
              {record.description}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Live DNS verification result — the fresh per-record check outcomes from a
 * "Verify DNS" run (real resolver data, not the stored stage).
 */
export function VerifyResultPanel({
  result,
  onDismiss,
}: {
  result: AdminMailDomainVerification;
  onDismiss: () => void;
}) {
  const passed = result.dnsChecks.filter((c) => c.valid).length;
  return (
    <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
            Verification result · <span className="font-mono">{result.domain.domain}</span>
          </h2>
          <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
            Live DNS lookup · {passed} of {result.dnsChecks.length} checks passed · stage{' '}
            <span className="font-mono">{result.domain.verificationStatus}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-[var(--quant-border)] px-3 py-1.5 text-xs font-medium text-[var(--quant-muted-foreground)] hover:opacity-90"
        >
          Dismiss
        </button>
      </div>
      <ul className="mt-4 space-y-2">
        {result.dnsChecks.map((check: AdminMailDomainLiveCheck) => (
          <li
            key={check.key}
            className={`rounded-lg border px-3 py-2 ${
              check.valid ? 'border-emerald-400/25 bg-emerald-400/5' : 'border-[var(--quant-border)] bg-[var(--quant-surface-elevated)]'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--quant-foreground)]">
              <span aria-hidden>{check.valid ? '✓' : '✗'}</span>
              {check.label}
            </div>
            {!check.valid && (
              <div className="mt-1 font-mono text-[11px] text-[var(--quant-muted-foreground)]">
                expected <span className="text-[var(--quant-foreground)]">{check.expected}</span>
                {check.error && <div className="text-amber-300/90">{check.error}</div>}
              </div>
            )}
            {check.valid && check.actual && (
              <div className="mt-1 break-all font-mono text-[11px] text-[var(--quant-muted-foreground)]">
                {Array.isArray(check.actual) ? check.actual.join(', ') : check.actual}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export { SectionCard };
