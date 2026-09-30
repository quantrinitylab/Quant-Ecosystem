'use client';

import { resolveApp } from '@quant/app-registry';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { useAuth } from '../../providers/auth-provider';
import { useAdminKpis, type KpiCell } from '../../hooks/useAdminKpis';

/**
 * QuantMail Admin Console — the per-app admin surface (restructure Phase 1 pilot).
 *
 * Identity (name / category / maturity / surfaces / accent color) is pulled LIVE
 * from `@quant/app-registry` so this console can never drift from the canonical
 * catalog. Operational metrics are fetched from the per-app admin API
 * (`backend/routes/admin.ts`) via `useAdminKpis`; any card whose metric is not
 * yet reachable falls back to an honest "awaiting/unavailable" state instead of
 * inventing a number.
 */

const app = resolveApp('quantmail');

const SURFACE_LABELS: Record<string, string> = {
  web: 'Web',
  backend: 'Backend API',
  desktop: 'Desktop',
  mobile: 'Mobile',
  marketing: 'Marketing',
  admin: 'Admin',
};

interface Kpi {
  key: string;
  label: string;
  hint: string;
}

const KPIS: Kpi[] = [
  { key: 'accounts', label: 'Total accounts', hint: 'GET /admin/accounts/count' },
  { key: 'sessions', label: 'Active sessions · 24h', hint: 'GET /admin/sessions/active' },
  { key: 'storage', label: 'Drive storage used', hint: 'GET /admin/storage/summary' },
  { key: 'delivery', label: 'Mail delivery success', hint: 'GET /admin/mail/deliverability' },
];

interface ServiceStatus {
  name: string;
  detail: string;
}

const SERVICES: ServiceStatus[] = [
  { name: 'SMTP inbound', detail: 'smtp-inbound service' },
  { name: 'Search index', detail: 'search-indexer · Meilisearch + Qdrant' },
  { name: 'Realtime gateway', detail: 'ws-gateway' },
  { name: 'Git / CodeHub', detail: 'git-server + ci-runner' },
];

function StatCard({ kpi, cell }: { kpi: Kpi; cell: KpiCell }) {
  // A cell can succeed yet still carry no number: a deliverability response with
  // no *resolved* attempts formats to an em dash. Treat that em dash as "no data
  // yet", not a live value, so it never shows a green "Live" dot over a blank.
  const isReady = cell.state === 'ready' && cell.value !== null && cell.value !== '—';
  const isError = cell.state === 'error';
  const footnote = isReady
    ? `Live · ${kpi.hint}`
    : isError
      ? `Unavailable · ${kpi.hint}`
      : `Awaiting ${kpi.hint}`;
  return (
    <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-5">
      <div className="text-xs font-medium text-[var(--quant-muted-foreground)]">{kpi.label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-[var(--quant-foreground)]">
          {isReady ? cell.value : '—'}
        </span>
        {cell.state === 'loading' && (
          <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[var(--brand-primary)]/60" />
        )}
        {isReady && <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />}
        {isError && <span className="inline-flex h-2 w-2 rounded-full bg-amber-400/70" />}
      </div>
      <div className="mt-1 font-mono text-[10px] text-[var(--quant-muted-foreground)]">
        {footnote}
      </div>
    </div>
  );
}

function SurfaceChip({ surface }: { surface: string }) {
  const label = SURFACE_LABELS[surface] ?? surface;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-1 text-xs font-medium text-[var(--quant-foreground)]">
      <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      {label}
    </span>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const kpis = useAdminKpis();
  const cellByKey: Record<string, KpiCell> = {
    accounts: kpis.accounts,
    sessions: kpis.sessions,
    storage: kpis.storage,
    delivery: kpis.delivery,
  };
  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="flex h-full flex-col overflow-hidden bg-[var(--quant-background)]">
        {/* Console header */}
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
                  {app.name} Admin
                </h1>
                <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
                  Per-app admin console · route {app.route} · category {app.category} ·{' '}
                  {app.maturity.toUpperCase()}
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 py-2 text-right">
              <div className="text-[11px] text-[var(--quant-muted-foreground)]">Signed in as</div>
              <div className="text-xs font-semibold text-[var(--quant-foreground)]">
                {user?.email ?? '—'}
              </div>
              <div className="font-mono text-[10px] text-[var(--brand-primary)]">
                role: {user?.role ?? 'UNKNOWN'}
              </div>
            </div>
          </div>
        </header>

        {/* Body */}
        <div className="mx-auto w-full max-w-5xl flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8">
          {/* Platform presence — the restructure proof */}
          <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                Platform presence
              </h2>
              <span className="font-mono text-[10px] text-[var(--quant-muted-foreground)]">
                @quant/app-registry
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
              Surfaces this product owns inside{' '}
              <code className="font-mono">apps/quantmail/</code>. This console is the new{' '}
              <strong className="text-[var(--quant-foreground)]">admin</strong> surface.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {app.surfaces.map((s) => (
                <SurfaceChip key={s} surface={s} />
              ))}
            </div>
          </section>

          {/* KPIs */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-[var(--quant-foreground)]">
              Operational metrics
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {KPIS.map((k) => (
                <StatCard
                  key={k.key}
                  kpi={k}
                  cell={cellByKey[k.key] ?? { value: null, state: 'loading' }}
                />
              ))}
            </div>
          </section>

          {/* Moderation + system health */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
              <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                Moderation queue
              </h2>
              <div className="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-4 py-10 text-center">
                <div className="text-sm font-medium text-[var(--quant-muted-foreground)]">
                  Moderation feed not yet wired
                </div>
                <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
                  Reports from the moderation-worker pipeline will surface here once connected.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6">
              <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">System health</h2>
              <ul className="mt-4 space-y-2">
                {SERVICES.map((svc) => (
                  <li
                    key={svc.name}
                    className="flex items-center justify-between rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-4 py-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-[var(--quant-foreground)]">
                        {svc.name}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--quant-muted-foreground)]">
                        {svc.detail}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--quant-muted-foreground)]">
                      <span className="inline-flex h-2 w-2 rounded-full bg-[var(--quant-muted-foreground)]/50" />
                      probe pending
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
