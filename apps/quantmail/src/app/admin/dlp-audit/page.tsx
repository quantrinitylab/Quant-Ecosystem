'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { resolveApp } from '@quant/app-registry';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { useAuth } from '../../../providers/auth-provider';
import { useAdminOrganizations } from '../../../hooks/useAdminMailDomains';
import { useAdminDlpPolicies, useAdminAuditLogs } from '../../../hooks/useAdminDlpAudit';
import { OrgSelector } from '../../../components/admin/OrgSelector';
import {
  LoadingBlock,
  ErrorBlock,
  EmptyBlock,
  SectionCard,
} from '../../../components/admin/AdminStates';
import {
  DlpPoliciesTable,
  AuditLogFilters,
  AuditLogTable,
  AuditPagination,
  EMPTY_AUDIT_FILTERS,
  type AuditFilters,
} from '../../../components/admin/DlpAuditView';
import type { AdminAuditLogQuery } from '../../../services/api-client';

/**
 * M20 — Admin DLP / Audit.
 *
 * Two read-only staff surfaces in one screen:
 * - DLP policies: the organization's mail compliance rules
 *   (`EnterpriseMailComplianceRule`) — list only, real rows.
 * - Audit log: a filterable viewer over the append-only audit trail.
 *   Audit records are written server-side by trusted backend paths only
 *   (the client-writable POST /audit-logs was closed in K9), so this tab
 *   deliberately has no "add entry" affordance.
 */

const app = resolveApp('quantmail');

type Tab = 'policies' | 'audit';

const PAGE_SIZE = 25;

export default function AdminDlpAuditPage() {
  const { user } = useAuth();
  const orgs = useAdminOrganizations();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('policies');

  const policies = useAdminDlpPolicies(tab === 'policies' ? organizationId : null);

  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [page, setPage] = useState(1);

  const auditQuery: AdminAuditLogQuery = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      action: appliedFilters.action.trim() || undefined,
      resource: appliedFilters.resource.trim() || undefined,
      userId: appliedFilters.userId.trim() || undefined,
      from: appliedFilters.from || undefined,
      to: appliedFilters.to || undefined,
    }),
    [page, appliedFilters],
  );

  const audit = useAdminAuditLogs(auditQuery);

  const applyFilters = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const tabButton = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      className={`rounded-lg px-4 py-2 text-xs font-medium ${
        tab === id
          ? 'bg-[var(--brand-primary)] text-white'
          : 'border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:opacity-90'
      }`}
    >
      {label}
    </button>
  );

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="flex h-full flex-col overflow-hidden bg-[var(--quant-background)]">
        <header className="shrink-0 border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-4 pb-5 pt-6 sm:px-8">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="flex size-11 items-center justify-center rounded-xl border text-sm font-bold"
                style={{
                  borderColor: `${app.color}55`,
                  backgroundColor: `${app.color}1a`,
                  color: app.color,
                }}
              >
                QM
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-[var(--quant-foreground)] sm:text-2xl">
                  Admin · DLP & Audit
                </h1>
                <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
                  Screen M20 · DLP policies and the append-only audit trail · signed in as{' '}
                  {user?.email ?? '—'}
                </p>
              </div>
            </div>
            <Link
              href="/admin"
              className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-2 text-xs font-medium text-[var(--quant-foreground)] hover:opacity-90"
            >
              ← Admin console
            </Link>
          </div>
        </header>

        <div className="mx-auto w-full max-w-5xl flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8">
          <OrgSelector
            organizations={orgs.organizations}
            state={orgs.state}
            error={orgs.error}
            value={organizationId}
            onChange={setOrganizationId}
          />

          {!organizationId && orgs.state === 'ready' && (
            <EmptyBlock
              title="Select an organization above"
              hint="DLP policies are per-organization. The audit viewer below can also run unscoped for staff."
            />
          )}

          {organizationId && (
            <>
              <div className="flex gap-2">
                {tabButton('policies', 'DLP policies')}
                {tabButton('audit', 'Audit log')}
              </div>

              {tab === 'policies' && (
                <SectionCard
                  title="DLP policies"
                  hint="Mail compliance rules for this organization — keyword, regex, and detector rules with block, quarantine, encrypt, or audit actions."
                  action={
                    <button
                      type="button"
                      onClick={policies.refresh}
                      className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-2 text-xs font-medium text-[var(--quant-foreground)] hover:opacity-90"
                    >
                      Refresh
                    </button>
                  }
                >
                  {policies.state === 'loading' && <LoadingBlock text="Loading DLP policies…" />}
                  {policies.state === 'error' && (
                    <ErrorBlock
                      message={policies.error ?? 'Failed to load DLP policies.'}
                      onRetry={policies.refresh}
                    />
                  )}
                  {policies.state === 'ready' &&
                    (policies.policies && policies.policies.length > 0 ? (
                      <DlpPoliciesTable policies={policies.policies} />
                    ) : (
                      <EmptyBlock
                        title="No DLP policies configured"
                        hint="This organization has no mail compliance rules yet. Policies are created through the compliance API — nothing is shown here until one exists."
                      />
                    ))}
                </SectionCard>
              )}

              {tab === 'audit' && (
                <SectionCard
                  title="Audit log"
                  hint="Append-only trail. Entries are written server-side by trusted backend paths — this viewer is read-only by design."
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        setPage(1);
                        audit.refetch();
                      }}
                      className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-2 text-xs font-medium text-[var(--quant-foreground)] hover:opacity-90"
                    >
                      Refresh
                    </button>
                  }
                >
                  <div className="mb-4">
                    <AuditLogFilters
                      filters={filters}
                      onChange={setFilters}
                      onApply={applyFilters}
                      onClear={() => {
                        setFilters(EMPTY_AUDIT_FILTERS);
                        setAppliedFilters(EMPTY_AUDIT_FILTERS);
                        setPage(1);
                      }}
                    />
                  </div>
                  {audit.state === 'loading' && <LoadingBlock text="Loading audit entries…" />}
                  {audit.state === 'error' && (
                    <ErrorBlock
                      message={audit.error ?? 'Failed to load audit entries.'}
                      onRetry={audit.refetch}
                    />
                  )}
                  {audit.state === 'ready' &&
                    (audit.page && audit.page.items.length > 0 ? (
                      <>
                        <AuditLogTable entries={audit.page.items} />
                        <AuditPagination
                          page={audit.page}
                          onPrev={() => setPage((p) => Math.max(1, p - 1))}
                          onNext={() => setPage((p) => p + 1)}
                        />
                      </>
                    ) : (
                      <EmptyBlock
                        title="No audit entries match"
                        hint="No records found for the current filters. Widen the date range or clear the filters."
                      />
                    ))}
                </SectionCard>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
