'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card } from '@quant/shared-ui';
import { ownerFetch } from '../../lib/api';

type Cadence = 'manual' | 'hourly' | 'daily';

interface Entry {
  employeeId: string;
  name: string;
  sector: string;
  status: 'active' | 'suspended' | 'invited';
  cadence: Cadence;
  lastRunAt: string | null;
  nextRunAt: string | null;
  due: boolean;
}

interface RunResult {
  ranAt: string;
  dueCount: number;
  results: { employeeId: string; processed: number; note: string }[];
}

const STATUS_BADGE: Record<Entry['status'], 'success' | 'default' | 'warning'> = {
  active: 'success',
  suspended: 'default',
  invited: 'warning',
};

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function SchedulerPage() {
  const [enabled, setEnabled] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [lastRun, setLastRun] = useState<RunResult | null>(null);
  const [autopilot, setAutopilot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await ownerFetch<{ data: { enabled: boolean; entries: Entry[] } }>(
        '/api/scheduler',
      );
      setEnabled(res.data.enabled);
      setEntries(res.data.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load scheduler');
    }
  }, []);

  const run = useCallback(
    async (force: boolean) => {
      setBusy(true);
      try {
        const res = await ownerFetch<{ data: RunResult }>(
          `/api/scheduler/run${force ? '?force=1' : ''}`,
          { method: 'POST' },
        );
        setLastRun(res.data);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to run scheduler');
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const toggleEnabled = async () => {
    try {
      await ownerFetch('/api/scheduler', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !enabled }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle scheduler');
    }
  };

  const changeCadence = async (employeeId: string, cadence: Cadence) => {
    try {
      await ownerFetch('/api/scheduler', {
        method: 'PATCH',
        body: JSON.stringify({ employeeId, cadence }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set cadence');
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  // Autopilot: poll the scheduler so due shifts run on their own.
  useEffect(() => {
    if (autopilot) {
      timer.current = setInterval(() => void run(false), 15000);
      void run(false);
    } else if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [autopilot, run]);

  const dueCount = entries.filter((e) => e.due).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">
            AI Workforce Scheduler
          </h1>
          <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
            Give each AI employee a cadence and let them run their shifts automatically. Autopilot
            polls for due shifts so the workforce runs on its own.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={enabled ? 'success' : 'default'} dot>
            {enabled ? 'Scheduler ON' : 'Scheduler OFF'}
          </Badge>
          <Button size="sm" variant="ghost" onClick={toggleEnabled}>
            {enabled ? 'Disable' : 'Enable'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-600">{error}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={busy} onClick={() => run(false)}>
          Run due now ({dueCount})
        </Button>
        <Button variant="secondary" loading={busy} onClick={() => run(true)}>
          Run all now
        </Button>
        <button
          type="button"
          onClick={() => setAutopilot((v) => !v)}
          className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            autopilot
              ? 'border-[var(--brand-app-color)] bg-[var(--brand-app-color)]/10 text-[var(--brand-app-color)]'
              : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)]'
          }`}
        >
          {autopilot ? '🟢 Autopilot ON (polling 15s)' : '⚪ Autopilot OFF'}
        </button>
      </div>

      {lastRun && (
        <Card padding="none">
          <div className="px-5 py-3 text-sm">
            <span className="font-medium text-[var(--quant-foreground)]">
              Last run {fmt(lastRun.ranAt)}:
            </span>{' '}
            <span className="text-[var(--quant-muted-foreground)]">
              {lastRun.dueCount === 0
                ? 'nothing was due.'
                : lastRun.results.map((r) => `${r.processed} processed`).join(' · ')}
            </span>
          </div>
        </Card>
      )}

      <Card padding="none">
        <div className="border-b border-[var(--quant-border)] px-5 py-4">
          <h2 className="font-semibold text-[var(--quant-foreground)]">Workforce roster</h2>
        </div>
        {entries.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[var(--quant-muted-foreground)]">
            No AI employees yet. Deploy one from Teams &amp; AI Staff.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--quant-border)]">
            {entries.map((e) => (
              <li
                key={e.employeeId}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">👾</span>
                    <span className="font-medium text-[var(--quant-foreground)]">{e.name}</span>
                    <Badge variant={STATUS_BADGE[e.status]} size="sm">
                      {e.status}
                    </Badge>
                    {e.due && (
                      <Badge variant="warning" size="sm" dot>
                        due
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--quant-muted-foreground)]">
                    {e.sector} · last {fmt(e.lastRunAt)} · next {fmt(e.nextRunAt)}
                  </p>
                </div>
                <select
                  value={e.cadence}
                  onChange={(ev) => changeCadence(e.employeeId, ev.target.value as Cadence)}
                  className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-2 py-1.5 text-sm text-[var(--quant-foreground)]"
                >
                  <option value="manual">Manual</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                </select>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
