'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@quant/shared-ui';
import type {
  CreditConfig,
  ModelRegistryEntry,
  PayoutRequest,
  RevenueStream,
} from '../../lib/domain';
import { ownerFetch } from '../../lib/api';

interface EconomyData {
  credit: CreditConfig;
  models: ModelRegistryEntry[];
  payouts: PayoutRequest[];
  revenue: RevenueStream[];
}

const PAYOUT_BADGE: Record<PayoutRequest['status'], 'warning' | 'info' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'info',
  paid: 'success',
  rejected: 'danger',
};

export default function EconomyPage() {
  const [data, setData] = useState<EconomyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ownerFetch<{ data: EconomyData }>('/api/economy');
      setData(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load economy');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchCredit = async (patch: Partial<CreditConfig>) => {
    try {
      await ownerFetch('/api/economy', { method: 'PATCH', body: JSON.stringify(patch) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update credit config');
    }
  };

  const setPayout = async (id: string, status: PayoutRequest['status']) => {
    try {
      await ownerFetch(`/api/economy/payouts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update payout');
    }
  };

  const monthlyRevenue = data?.revenue.reduce((s, r) => s + r.monthlyUsd, 0) ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">Economy</h1>
        <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
          Govern the Quant credit economy, creator payouts (UPI / Stripe / PayPal / crypto), the AI
          model registry, and revenue streams.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-600">{error}</p>
        </div>
      )}

      {/* Credit config */}
      <Card padding="none">
        <div className="border-b border-[var(--quant-border)] px-5 py-4">
          <h2 className="font-semibold text-[var(--quant-foreground)]">Credit configuration</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
          <Metric label="USD per credit" value={`$${data?.credit.usdPerCredit ?? 1}`} />
          <Metric label="Daily free credits" value={`${data?.credit.dailyFreeCredits ?? 5}`} />
          <Metric
            label="Commission"
            value={`${Math.round((data?.credit.commissionRate ?? 0.2) * 100)}%`}
          />
          <div>
            <p className="text-xs text-[var(--quant-muted-foreground)]">Overage billing</p>
            <div className="mt-2">
              <Button
                size="sm"
                variant={data?.credit.overageEnabled ? 'success' : 'secondary'}
                onClick={() => patchCredit({ overageEnabled: !data?.credit.overageEnabled })}
              >
                {data?.credit.overageEnabled ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 px-5 pb-5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              patchCredit({ dailyFreeCredits: (data?.credit.dailyFreeCredits ?? 5) + 1 })
            }
          >
            + Daily free
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              patchCredit({
                commissionRate: Math.min(0.5, (data?.credit.commissionRate ?? 0.2) + 0.05),
              })
            }
          >
            + Commission 5%
          </Button>
        </div>
      </Card>

      {/* Revenue + Payouts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card padding="none">
          <div className="border-b border-[var(--quant-border)] px-5 py-4 flex items-center justify-between">
            <h2 className="font-semibold text-[var(--quant-foreground)]">Revenue streams</h2>
            <span className="text-sm font-semibold text-green-500">
              ${monthlyRevenue.toLocaleString()}/mo
            </span>
          </div>
          <ul className="divide-y divide-[var(--quant-border)]">
            {data?.revenue.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--quant-foreground)]">{r.label}</p>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">{r.source}</p>
                </div>
                <span className="text-sm font-semibold text-[var(--quant-foreground)]">
                  ${r.monthlyUsd.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card padding="none">
          <div className="border-b border-[var(--quant-border)] px-5 py-4">
            <h2 className="font-semibold text-[var(--quant-foreground)]">Payout queue</h2>
          </div>
          <ul className="divide-y divide-[var(--quant-border)]">
            {data?.payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--quant-foreground)]">
                    {p.creatorName}
                  </p>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    {p.credits} cr ≈ ${p.credits} · {p.method.toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={PAYOUT_BADGE[p.status]} size="sm">
                    {p.status}
                  </Badge>
                  {p.status === 'pending' && (
                    <>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => setPayout(p.id, 'approved')}
                      >
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPayout(p.id, 'rejected')}>
                        Reject
                      </Button>
                    </>
                  )}
                  {p.status === 'approved' && (
                    <Button size="sm" variant="primary" onClick={() => setPayout(p.id, 'paid')}>
                      Mark paid
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Model registry */}
      <Card padding="none">
        <div className="border-b border-[var(--quant-border)] px-5 py-4">
          <h2 className="font-semibold text-[var(--quant-foreground)]">AI model registry</h2>
          <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
            Today via OpenRouter; migrate to local weights for margin.
          </p>
        </div>
        <ul className="divide-y divide-[var(--quant-border)]">
          {data?.models.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--quant-foreground)]">{m.label}</p>
                <p className="text-xs text-[var(--quant-muted-foreground)]">
                  {m.provider} · {m.creditPer1kTokens} cr / 1K tok
                </p>
              </div>
              <div className="flex items-center gap-2">
                {m.local && (
                  <Badge variant="info" size="sm">
                    local
                  </Badge>
                )}
                <Badge variant={m.enabled ? 'success' : 'default'} size="sm">
                  {m.enabled ? 'enabled' : 'disabled'}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--quant-muted-foreground)]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[var(--quant-foreground)]">{value}</p>
    </div>
  );
}
