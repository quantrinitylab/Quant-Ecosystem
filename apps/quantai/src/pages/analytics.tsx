// ============================================================================
// QuantAI - Analytics Page
// Real usage analytics backed by GET /api/usage/daily (persisted AI sessions).
// ============================================================================

import { useState } from 'react';
import { useUsageAnalytics } from '../hooks/useUsageAnalytics';
import { UsageAnalyticsChart } from '../components/UsageAnalyticsChart';

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

const METRICS = [
  { key: 'tokens', label: 'Tokens' },
  { key: 'cost', label: 'Cost' },
  { key: 'sessions', label: 'Conversations' },
] as const;

export function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<'tokens' | 'cost' | 'sessions'>('tokens');
  const { series, totals, isLoading, error, refresh } = useUsageAnalytics(days);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">Usage Analytics</h1>
          <p className="text-sm text-[var(--foreground-secondary)]">
            Your AI activity over the last {days} days.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                days === r.days
                  ? 'bg-[var(--quant-accent)] text-white border-transparent'
                  : 'border-[var(--quant-border)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              metric === m.key
                ? 'bg-[var(--quant-surface-hover)] text-[var(--foreground)] border-[var(--quant-border)]'
                : 'border-transparent text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="text-sm text-[var(--foreground-secondary)]">Loading analytics…</p>
      )}

      {error && (
        <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-400">
          <p>Could not load analytics: {error}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-2 px-3 py-1 rounded-lg bg-red-500 text-white text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && (
        <UsageAnalyticsChart series={series} totals={totals} metric={metric} />
      )}
    </div>
  );
}

export default AnalyticsPage;
