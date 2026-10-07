// ============================================================================
// QuantAI - UsageAnalyticsChart
// Dependency-free, accessible inline bar chart for the per-day usage series.
// Presentational only: receives the series + totals and renders bars + summary.
// ============================================================================

import type { DailyUsagePoint } from '../hooks/useUsageAnalytics';

export interface UsageAnalyticsChartProps {
  series: DailyUsagePoint[];
  totals: { tokens: number; cost: number; sessions: number };
  /** Which metric the bars represent. */
  metric?: 'tokens' | 'cost' | 'sessions';
}

const METRIC_LABEL: Record<NonNullable<UsageAnalyticsChartProps['metric']>, string> = {
  tokens: 'Tokens',
  cost: 'Cost (USD)',
  sessions: 'Conversations',
};

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function UsageAnalyticsChart({
  series,
  totals,
  metric = 'tokens',
}: UsageAnalyticsChartProps) {
  const max = series.reduce((m, p) => Math.max(m, p[metric]), 0);

  return (
    <div className="space-y-4" data-testid="usage-analytics-chart">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Tokens" value={formatNumber(totals.tokens)} />
        <SummaryTile label="Cost" value={`$${totals.cost.toFixed(2)}`} />
        <SummaryTile label="Conversations" value={formatNumber(totals.sessions)} />
      </div>

      {/* Bars */}
      <div
        className="flex items-end gap-1 h-40 w-full"
        role="img"
        aria-label={`${METRIC_LABEL[metric]} per day over the last ${series.length} days`}
      >
        {series.map((point) => {
          const heightPct = max > 0 ? Math.round((point[metric] / max) * 100) : 0;
          const value =
            metric === 'cost' ? `$${point.cost.toFixed(2)}` : formatNumber(point[metric]);
          return (
            <div
              key={point.date}
              className="flex-1 flex flex-col justify-end h-full group relative"
              data-testid="usage-bar"
              data-value={point[metric]}
            >
              <div
                className="w-full rounded-t bg-[var(--quant-accent)]/70 group-hover:bg-[var(--quant-accent)] transition-colors min-h-[2px]"
                style={{ height: `${heightPct}%` }}
                title={`${point.date}: ${value}`}
              />
            </div>
          );
        })}
      </div>

      {series.length === 0 && (
        <p className="text-sm text-[var(--foreground-secondary)]">No usage in this window yet.</p>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3">
      <div className="text-xs text-[var(--foreground-secondary)]">{label}</div>
      <div className="text-lg font-semibold text-[var(--foreground)] font-mono">{value}</div>
    </div>
  );
}

export default UsageAnalyticsChart;
