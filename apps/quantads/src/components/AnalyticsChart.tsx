// ============================================================================
// QuantAds - AnalyticsChart Component
// Charts with spring entrance animation and responsive sizing
// ============================================================================

'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface DataPoint {
  date: string;
  value: number;
}

interface AnalyticsChartProps {
  title: string;
  type: 'line' | 'bar' | 'area' | 'pie';
  data: DataPoint[];
  color?: string;
  showTrend?: boolean;
  height?: number;
}

export function AnalyticsChart({
  title,
  type,
  data,
  color = 'var(--brand-app-color)',
  showTrend = true,
  height = 300,
}: AnalyticsChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const avg = data.length > 0 ? total / data.length : 0;

  // Calculate trend
  const midpoint = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, midpoint).reduce((s, d) => s + d.value, 0) / (midpoint || 1);
  const secondHalf =
    data.slice(midpoint).reduce((s, d) => s + d.value, 0) / (data.length - midpoint || 1);
  const trendPercent = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;
  const trendDirection = trendPercent >= 0 ? 'up' : 'down';

  return (
    <motion.div
      className={`relative flex flex-col rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4 shadow-sm chart-${type}`}
      style={{ height: `${height}px` }}
      role="figure"
      aria-label={`${title} analytics chart`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--quant-card-foreground)]">{title}</h4>
        {showTrend && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              trendDirection === 'up'
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
            }`}
            aria-label={`Trend ${trendDirection} ${Math.abs(trendPercent).toFixed(1)} percent`}
          >
            {trendPercent >= 0 ? '+' : ''}
            {trendPercent.toFixed(1)}%
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="mb-3 flex gap-4">
        <span className="text-xs text-[var(--quant-muted-foreground)]">
          Total:{' '}
          <span className="font-medium text-[var(--quant-card-foreground)]">
            {formatValue(total)}
          </span>
        </span>
        <span className="text-xs text-[var(--quant-muted-foreground)]">
          Avg:{' '}
          <span className="font-medium text-[var(--quant-card-foreground)]">
            {formatValue(avg)}
          </span>
        </span>
      </div>

      {/* Chart Canvas */}
      <div
        className="relative flex flex-1 items-end gap-px overflow-hidden rounded-md"
        role="img"
        aria-label={`Bar chart showing ${data.length} data points`}
      >
        {data.map((point, i) => (
          <div
            key={`${point.date}-${i}`}
            className="flex-1 rounded-t-sm transition-all hover:opacity-80"
            style={{
              height: `${(point.value / maxValue) * 100}%`,
              backgroundColor: color,
              minWidth: '2px',
            }}
            title={`${point.date}: ${formatValue(point.value)}`}
            aria-label={`${point.date}: ${formatValue(point.value)}`}
          />
        ))}
      </div>

      {/* X-Axis */}
      <div className="mt-2 flex justify-between">
        {data.length > 0 && (
          <span className="text-xs text-[var(--quant-muted-foreground)]">{data[0]?.date}</span>
        )}
        {data.length > 1 && (
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            {data[data.length - 1]?.date}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function formatValue(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toFixed(0);
}

export default AnalyticsChart;
