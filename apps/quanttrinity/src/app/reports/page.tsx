'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card } from '@quant/shared-ui';
import { SECTOR_LABEL, type OwnerReport } from '../../lib/domain';
import { ownerFetch } from '../../lib/api';

const SEV_BADGE: Record<OwnerReport['severity'], 'default' | 'warning' | 'danger'> = {
  low: 'default',
  medium: 'warning',
  high: 'warning',
  critical: 'danger',
};
const STATUS_BADGE: Record<OwnerReport['status'], 'warning' | 'info' | 'success'> = {
  open: 'warning',
  'in-review': 'info',
  resolved: 'success',
};

export default function ReportsPage() {
  const [reports, setReports] = useState<OwnerReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ownerFetch<{ data: OwnerReport[] }>('/api/reports');
      setReports(res.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (id: string, status: OwnerReport['status']) => {
    try {
      await ownerFetch('/api/reports', { method: 'PATCH', body: JSON.stringify({ id, status }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update report');
    }
  };

  const open = reports.filter((r) => r.status !== 'resolved');
  const resolved = reports.filter((r) => r.status === 'resolved');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">Reports</h1>
        <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
          User reports routed by sector. AI employees in the reporting sector triage and resolve
          these automatically within their autonomy level.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-600">{error}</p>
        </div>
      )}

      <Section
        title={`Open (${open.length})`}
        reports={open}
        setStatus={setStatus}
        sevBadge={SEV_BADGE}
        statusBadge={STATUS_BADGE}
      />
      <Section
        title={`Resolved (${resolved.length})`}
        reports={resolved}
        setStatus={setStatus}
        sevBadge={SEV_BADGE}
        statusBadge={STATUS_BADGE}
      />
    </div>
  );
}

function Section({
  title,
  reports,
  setStatus,
  sevBadge,
  statusBadge,
}: {
  title: string;
  reports: OwnerReport[];
  setStatus: (id: string, status: OwnerReport['status']) => void;
  sevBadge: Record<OwnerReport['severity'], 'default' | 'warning' | 'danger'>;
  statusBadge: Record<OwnerReport['status'], 'warning' | 'info' | 'success'>;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
        {title}
      </h2>
      {reports.length === 0 && (
        <p className="text-sm text-[var(--quant-muted-foreground)]">Nothing here.</p>
      )}
      {reports.map((r) => (
        <Card key={r.id} padding="none">
          <div className="flex items-start justify-between gap-4 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--quant-foreground)]">{r.app}</span>
                <Badge variant={sevBadge[r.severity]} size="sm">
                  {r.severity}
                </Badge>
                <Badge variant={statusBadge[r.status]} size="sm">
                  {r.status}
                </Badge>
                {r.handledByAi && (
                  <Badge variant="info" size="sm">
                    👾 AI handled
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--quant-foreground)]">{r.reason}</p>
              <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
                {SECTOR_LABEL[r.sector]} · reporter {r.reporter}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {r.status === 'open' && (
                <Button size="sm" variant="secondary" onClick={() => setStatus(r.id, 'in-review')}>
                  Review
                </Button>
              )}
              {r.status !== 'resolved' && (
                <Button size="sm" variant="success" onClick={() => setStatus(r.id, 'resolved')}>
                  Resolve
                </Button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
