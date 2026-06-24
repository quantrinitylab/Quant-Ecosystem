'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { Badge, Card } from '@quant/shared-ui';
import { StatTile } from '../components/StatTile';
import { ownerFetch } from '../lib/api';

interface Overview {
  users: { total: number; activeToday: number; dbConnected: boolean };
  apps: { total: number; live: number; maintenance: number; disabled: number };
  team: { total: number; humans: number; aiStaff: number };
  economy: {
    monthlyRevenueUsd: number;
    usdPerCredit: number;
    dailyFreeCredits: number;
    commissionRate: number;
  };
}

interface Brief {
  headline: string;
  observations: { id: string; severity: 'info' | 'warn' | 'critical'; text: string }[];
  suggestedActions: { id: string; label: string; href: string }[];
}

const DEFAULT_OVERVIEW: Overview = {
  users: { total: 0, activeToday: 0, dbConnected: false },
  apps: { total: 13, live: 13, maintenance: 0, disabled: 0 },
  team: { total: 3, humans: 2, aiStaff: 1 },
  economy: { monthlyRevenueUsd: 413400, usdPerCredit: 1, dailyFreeCredits: 5, commissionRate: 0.2 },
};

function usd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString()}`;
}

const SEV_BADGE: Record<Brief['observations'][number]['severity'], 'info' | 'warning' | 'danger'> =
  {
    info: 'info',
    warn: 'warning',
    critical: 'danger',
  };

export default function CommandCenterPage() {
  const [overview, setOverview] = useState<Overview>(DEFAULT_OVERVIEW);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [ov, br] = await Promise.all([
        ownerFetch<Overview>('/api/overview'),
        ownerFetch<{ data: Brief }>('/api/ai/brief'),
      ]);
      setOverview(ov);
      setBrief(br.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load command center');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">Command Center</h1>
          <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
            Owner-tier overview of the entire Quant Ecosystem
          </p>
        </div>
        <Badge variant={overview.users.dbConnected ? 'success' : 'warning'} dot>
          {overview.users.dbConnected ? 'DB connected' : 'DB offline (seed)'}
        </Badge>
      </div>

      {error && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm text-yellow-600">Showing seed data: {error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Monthly revenue"
          value={usd(overview.economy.monthlyRevenueUsd)}
          hint="Across all revenue streams"
          accent="green"
          delay={0}
        />
        <StatTile
          label="Total users"
          value={overview.users.total.toLocaleString()}
          hint={`${overview.users.activeToday.toLocaleString()} active today`}
          accent="blue"
          delay={0.05}
        />
        <StatTile
          label="Apps live"
          value={`${overview.apps.live}/${overview.apps.total}`}
          hint={`${overview.apps.maintenance} maintenance · ${overview.apps.disabled} disabled`}
          accent="violet"
          delay={0.1}
        />
        <StatTile
          label="AI employees on duty"
          value={`${overview.team.aiStaff}`}
          hint={`${overview.team.humans} humans · ${overview.team.total} total staff`}
          accent="amber"
          delay={0.15}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', ...spring.gentle, delay: 0.2 }}
      >
        <Card padding="none">
          <div className="border-b border-[var(--quant-border)] px-6 py-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">👾</span>
              <h2 className="text-lg font-semibold text-[var(--quant-foreground)]">
                Owner QuantAI · Daily Brief
              </h2>
            </div>
            {brief && (
              <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">{brief.headline}</p>
            )}
          </div>
          <div className="space-y-3 p-6">
            {!brief && (
              <p className="text-sm text-[var(--quant-muted-foreground)]">Synthesizing brief…</p>
            )}
            {brief?.observations.map((o) => (
              <div key={o.id} className="flex items-start gap-3">
                <Badge variant={SEV_BADGE[o.severity]} size="sm">
                  {o.severity}
                </Badge>
                <p className="text-sm text-[var(--quant-foreground)]">{o.text}</p>
              </div>
            ))}
            {brief && brief.suggestedActions.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {brief.suggestedActions.map((a) => (
                  <a
                    key={a.id}
                    href={a.href}
                    className="rounded-lg bg-[var(--brand-app-color)]/10 px-3 py-1.5 text-sm font-medium text-[var(--brand-app-color)] hover:bg-[var(--brand-app-color)]/20"
                  >
                    {a.label} →
                  </a>
                ))}
              </div>
            )}
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
