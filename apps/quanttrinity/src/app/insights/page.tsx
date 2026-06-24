'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Card } from '@quant/shared-ui';
import { StatTile } from '../../components/StatTile';
import { ownerFetch } from '../../lib/api';

interface Insights {
  actions: {
    total: number;
    byActorClass: { human: number; ai: number; system: number };
    aiSharePct: number;
    byType: { type: string; count: number }[];
  };
  revenue: { monthlyTotalUsd: number; mix: { label: string; usd: number; pct: number }[] };
  payouts: {
    pending: number;
    approved: number;
    paid: number;
    rejected: number;
    pendingCredits: number;
  };
  reports: {
    open: number;
    inReview: number;
    resolved: number;
    bySeverity: { low: number; medium: number; high: number; critical: number };
    aiHandled: number;
  };
  workforce: { totalStaff: number; humans: number; aiStaff: number; activeAi: number };
}

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

function Bar({ pct, tone = 'violet' }: { pct: number; tone?: 'violet' | 'green' | 'amber' }) {
  const color =
    tone === 'green' ? '#22c55e' : tone === 'amber' ? '#f59e0b' : 'var(--brand-app-color)';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--quant-muted)]">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(2, pct))}%`, background: color }}
      />
    </div>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ownerFetch<{ data: Insights }>('/api/insights');
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load insights');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const maxType = data ? Math.max(1, ...data.actions.byType.map((t) => t.count)) : 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">Insights</h1>
        <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
          Owner intelligence — who does the work, where revenue comes from, and the moderation
          backlog, refreshed live.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-600">{error}</p>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Monthly revenue"
              value={usd(data.revenue.monthlyTotalUsd)}
              accent="green"
            />
            <StatTile
              label="Work done by AI"
              value={`${data.actions.aiSharePct}%`}
              hint={`${data.actions.byActorClass.ai} AI vs ${data.actions.byActorClass.human} human actions`}
              accent="violet"
            />
            <StatTile
              label="Active AI employees"
              value={`${data.workforce.activeAi}/${data.workforce.aiStaff}`}
              hint={`${data.workforce.totalStaff} total staff`}
              accent="amber"
            />
            <StatTile
              label="Open reports"
              value={`${data.reports.open + data.reports.inReview}`}
              hint={`${data.reports.resolved} resolved · ${data.reports.aiHandled} AI-handled`}
              accent="blue"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Revenue mix */}
            <Card padding="none">
              <div className="border-b border-[var(--quant-border)] px-5 py-4">
                <h2 className="font-semibold text-[var(--quant-foreground)]">Revenue mix</h2>
              </div>
              <div className="space-y-3 p-5">
                {data.revenue.mix.map((m) => (
                  <div key={m.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-[var(--quant-foreground)]">{m.label}</span>
                      <span className="text-[var(--quant-muted-foreground)]">
                        {usd(m.usd)} · {m.pct}%
                      </span>
                    </div>
                    <Bar pct={m.pct} tone="green" />
                  </div>
                ))}
              </div>
            </Card>

            {/* Action breakdown */}
            <Card padding="none">
              <div className="border-b border-[var(--quant-border)] px-5 py-4 flex items-center justify-between">
                <h2 className="font-semibold text-[var(--quant-foreground)]">Actions by type</h2>
                <Badge variant="info" size="sm">
                  {data.actions.total} logged
                </Badge>
              </div>
              <div className="space-y-3 p-5">
                {data.actions.byType.length === 0 && (
                  <p className="text-sm text-[var(--quant-muted-foreground)]">No actions yet.</p>
                )}
                {data.actions.byType.map((t) => (
                  <div key={t.type}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-mono text-[var(--quant-foreground)]">{t.type}</span>
                      <span className="text-[var(--quant-muted-foreground)]">{t.count}</span>
                    </div>
                    <Bar pct={(t.count / maxType) * 100} />
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Payout throughput */}
            <Card padding="none">
              <div className="border-b border-[var(--quant-border)] px-5 py-4">
                <h2 className="font-semibold text-[var(--quant-foreground)]">Payout throughput</h2>
              </div>
              <div className="grid grid-cols-4 gap-3 p-5 text-center">
                <Pill label="Pending" value={data.payouts.pending} tone="warning" />
                <Pill label="Approved" value={data.payouts.approved} tone="info" />
                <Pill label="Paid" value={data.payouts.paid} tone="success" />
                <Pill label="Rejected" value={data.payouts.rejected} tone="danger" />
                <div className="col-span-4 mt-1 text-xs text-[var(--quant-muted-foreground)]">
                  {data.payouts.pendingCredits} credits (~${data.payouts.pendingCredits}) awaiting
                  approval
                </div>
              </div>
            </Card>

            {/* Reports by severity */}
            <Card padding="none">
              <div className="border-b border-[var(--quant-border)] px-5 py-4">
                <h2 className="font-semibold text-[var(--quant-foreground)]">
                  Reports by severity
                </h2>
              </div>
              <div className="grid grid-cols-4 gap-3 p-5 text-center">
                <Pill label="Low" value={data.reports.bySeverity.low} tone="default" />
                <Pill label="Medium" value={data.reports.bySeverity.medium} tone="warning" />
                <Pill label="High" value={data.reports.bySeverity.high} tone="warning" />
                <Pill label="Critical" value={data.reports.bySeverity.critical} tone="danger" />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'default';
}) {
  return (
    <div className="rounded-lg border border-[var(--quant-border)] p-3">
      <p className="text-xl font-bold text-[var(--quant-foreground)]">{value}</p>
      <Badge variant={tone} size="sm">
        {label}
      </Badge>
    </div>
  );
}
