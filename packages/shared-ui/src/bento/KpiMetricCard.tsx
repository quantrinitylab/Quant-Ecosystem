import React from 'react';

export interface KpiMetricCardProps {
  title: string;
  value: string | number;
  change: number; // e.g. 14.2 for +14.2%, -3.1 for -3.1%
  changeLabel?: string;
  timePeriod?: string;
  sparklineData?: number[];
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  className?: string;
}

export const KpiMetricCard: React.FC<KpiMetricCardProps> = ({
  title,
  value,
  change,
  changeLabel,
  timePeriod = 'vs last 30 days',
  sparklineData,
  trend,
  icon,
  className = '',
}) => {
  const isPositive = trend ? trend === 'up' : change >= 0;
  const formattedChange = changeLabel || `${isPositive ? '+' : ''}${change.toFixed(1)}%`;

  // Generate SVG sparkline path if data provided
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;
    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;
    const width = 120;
    const height = 40;

    const points = sparklineData
      .map((val, idx) => {
        const x = (idx / (sparklineData.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 8) - 4;
        return `${x},${y}`;
      })
      .join(' ');

    const strokeColor = isPositive ? '#238636' : '#f85149';

    return (
      <div className="relative w-[120px] h-[40px]">
        <svg width={width} height={height} className="overflow-visible">
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
      </div>
    );
  };

  return (
    <div
      className={`relative flex flex-col justify-between bg-[#161B22] border border-white/10 rounded-xl p-6 text-white hover:border-[#58A6FF]/40 transition-all shadow-lg ${className}`}
      data-testid="kpi-metric-card"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-400">{title}</span>
        {icon && <div className="text-[#58A6FF]">{icon}</div>}
      </div>

      <div className="flex items-baseline justify-between gap-4 my-2">
        <div className="text-3xl font-bold tracking-tight text-white" data-testid="kpi-value">
          {value}
        </div>
        {sparklineData && renderSparkline()}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-white/5 text-xs">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
            isPositive
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}
          data-testid="kpi-change-pill"
        >
          {isPositive ? '↑' : '↓'} {formattedChange}
        </span>
        <span className="text-gray-400">{timePeriod}</span>
      </div>
    </div>
  );
};
