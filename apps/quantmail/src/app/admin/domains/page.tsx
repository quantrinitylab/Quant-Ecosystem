'use client';

import { useState } from 'react';
import Link from 'next/link';
import { resolveApp } from '@quant/app-registry';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { useAuth } from '../../../providers/auth-provider';
import {
  useAdminOrganizations,
  useAdminMailDomains,
} from '../../../hooks/useAdminMailDomains';
import { OrgSelector } from '../../../components/admin/OrgSelector';
import {
  LoadingBlock,
  ErrorBlock,
  EmptyBlock,
  SectionCard,
} from '../../../components/admin/AdminStates';
import {
  AddDomainForm,
  DomainsTable,
  DnsInstructionsPanel,
  VerifyResultPanel,
} from '../../../components/admin/DomainsView';
import type {
  AdminMailDomain,
  AdminMailDomainRegistration,
  AdminMailDomainVerification,
} from '../../../services/api-client';

/**
 * M19 — Admin Domains.
 *
 * Staff-only mail-domain management: list, register, DNS-verify, and remove
 * accepted mail domains per organization. DNS status is real — registration
 * returns the exact TXT/MX/SPF/DKIM/DMARC records to publish, and "Verify DNS"
 * runs a live resolver lookup before persisting the verification stage.
 * Mutations are staff-gated and org-scoped on the backend and write
 * server-side audit records.
 */

const app = resolveApp('quantmail');

export default function AdminDomainsPage() {
  const { user } = useAuth();
  const orgs = useAdminOrganizations();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const domains = useAdminMailDomains(organizationId);

  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [registration, setRegistration] = useState<AdminMailDomainRegistration | null>(null);
  const [verifyResult, setVerifyResult] = useState<AdminMailDomainVerification | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRegister = async (domain: string) => {
    setFormBusy(true);
    setFormError(null);
    const r = await domains.register(domain);
    setFormBusy(false);
    if (r.ok && r.registration) {
      setRegistration(r.registration);
    } else {
      setFormError(r.message);
    }
  };

  const handleVerify = async (domain: AdminMailDomain) => {
    setBusyId(domain.id);
    setActionError(null);
    setVerifyResult(null);
    const r = await domains.verify(domain.id);
    setBusyId(null);
    if (r.ok && r.result) {
      setVerifyResult(r.result);
    } else {
      setActionError(r.message);
    }
  };

  const handleRemove = async (domain: AdminMailDomain) => {
    setBusyId(domain.id);
    setActionError(null);
    const r = await domains.remove(domain.id);
    setBusyId(null);
    if (!r.ok) setActionError(r.message);
  };

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
                  Admin · Domains
                </h1>
                <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
                  Screen M19 · accepted mail domains, DNS verification · signed in as{' '}
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
              hint="Domain management is scoped to one organization. Pick one to list, add, verify, or remove its mail domains."
            />
          )}

          {actionError && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-xs text-amber-300">
              {actionError}
            </div>
          )}

          {verifyResult && (
            <VerifyResultPanel result={verifyResult} onDismiss={() => setVerifyResult(null)} />
          )}

          {registration && (
            <DnsInstructionsPanel
              registration={registration}
              onDismiss={() => setRegistration(null)}
            />
          )}

          {organizationId && (
            <SectionCard
              title="Mail domains"
              hint="Domains this organization accepts mail for. Verification runs live DNS lookups — ownership TXT, MX, SPF, DKIM, DMARC."
              action={
                <AddDomainForm busy={formBusy} formError={formError} onSubmit={handleRegister} />
              }
            >
              {domains.state === 'loading' && <LoadingBlock text="Loading domains…" />}
              {domains.state === 'error' && (
                <ErrorBlock
                  message={domains.error ?? 'Failed to load domains.'}
                  onRetry={domains.refresh}
                />
              )}
              {domains.state === 'ready' &&
                (domains.domains && domains.domains.length > 0 ? (
                  <DomainsTable
                    domains={domains.domains}
                    busyId={busyId}
                    onVerify={handleVerify}
                    onRemove={handleRemove}
                  />
                ) : (
                  <EmptyBlock
                    title="No domains registered"
                    hint="Add the organization's first mail domain above. You'll get the exact DNS records to publish before verification."
                  />
                ))}
            </SectionCard>
          )}
        </div>
      </div>
    </AppShell>
  );
}
