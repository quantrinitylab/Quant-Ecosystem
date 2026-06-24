'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Card } from '@quant/shared-ui';
import type { AuditEntry } from '../../lib/domain';
import { ownerFetch } from '../../lib/api';

function actionTone(action: string): 'danger' | 'warning' | 'success' | 'info' | 'default' {
  if (action.includes('suspend') || action.includes('rejected') || action.includes('disabled'))
    return 'danger';
  if (action.includes('approved') || action.includes('paid') || action.includes('resolved'))
    return 'success';
  if (action.includes('deployed') || action.includes('invited')) return 'info';
  if (action.includes('updated')) return 'warning';
  return 'default';
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ownerFetch<{ data: AuditEntry[] }>('/api/audit');
      setEntries(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit trail');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">Audit Trail</h1>
        <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
          Every owner control-plane action — by you or by an AI employee — is recorded here.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-600">{error}</p>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-[var(--quant-muted-foreground)]">No actions recorded yet.</p>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-[var(--quant-border)]">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                <Badge variant={actionTone(e.action)} size="sm">
                  {e.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--quant-foreground)]">
                    <span className="font-medium">{e.actor}</span>
                    {e.detail ? ` — ${e.detail}` : ''}
                  </p>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    target {e.target} · {new Date(e.at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
