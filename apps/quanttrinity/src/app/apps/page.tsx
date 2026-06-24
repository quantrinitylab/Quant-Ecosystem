'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@quant/shared-ui';
import type { EcosystemApp } from '../../lib/domain';
import { ownerFetch } from '../../lib/api';

const STATUS_BADGE: Record<EcosystemApp['status'], 'success' | 'warning' | 'danger'> = {
  live: 'success',
  maintenance: 'warning',
  disabled: 'danger',
};

const NEXT_STATUS: Record<EcosystemApp['status'], EcosystemApp['status']> = {
  live: 'maintenance',
  maintenance: 'disabled',
  disabled: 'live',
};

export default function AppControlPage() {
  const [apps, setApps] = useState<EcosystemApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ownerFetch<{ data: EcosystemApp[] }>('/api/apps');
      setApps(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load apps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await ownerFetch('/api/apps', { method: 'PATCH', body: JSON.stringify({ id, ...body }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update app');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">App Control</h1>
        <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
          Cross-app control plane — set maintenance/disable, the default AI model, and toggle the
          QuantAI sidekick per app.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-600">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--quant-muted-foreground)]">Loading apps…</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {apps.map((a) => (
            <Card key={a.id} padding="none">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--quant-foreground)]">{a.name}</span>
                  <Badge variant={STATUS_BADGE[a.status]} size="sm" dot>
                    {a.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">{a.category}</p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => patch(a.id, { status: NEXT_STATUS[a.status] })}
                  >
                    Set: {NEXT_STATUS[a.status]}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => patch(a.id, { sidekickEnabled: !a.sidekickEnabled })}
                  >
                    {a.sidekickEnabled ? '👾 Sidekick ON' : 'Sidekick OFF'}
                  </Button>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    model: {a.modelId}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
