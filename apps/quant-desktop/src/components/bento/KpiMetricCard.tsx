import React from 'react';
import type { KpiMetricCardProps } from '../../types';

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

  // Render SVG sparkline path
  const renderSparkline = () => {
    if (!sparklineData || sparklineData.length < 2) return null;
    const min = Math.min(...sparklineData);
    const max = Math.max(...sparklineData);
    const range = max - min || 1;
    const width = 110;
    const height = 36;

    const points = sparklineData
      .map((val, idx) => {
        const x = (idx / (sparklineData.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

    const strokeColor = isPositive ? '#10b981' : '#f43f5e';

    return (
      <div className="bento-sparkline-wrapper">
        <svg
          width={width}
          height={height}
          className="bento-sparkline-svg"
          aria-label="KPI Trend Sparkline"
        >
          <polyline
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
      </div>
    );
  };

  return (
    <div className={`bento-kpi-card ${className}`} data-testid="kpi-metric-card">
      <div className="bento-kpi-header">
        <span className="bento-kpi-title">{title}</span>
        {icon && <div className="bento-kpi-icon">{icon}</div>}
      </div>

      <div className="bento-kpi-body">
        <div className="bento-kpi-value" data-testid="kpi-value">
          {value}
        </div>
        {sparklineData && renderSparkline()}
      </div>

      <div className="bento-kpi-footer">
        <span
          className={`bento-kpi-pill ${isPositive ? 'bento-pill-positive' : 'bento-pill-negative'}`}
          data-testid="kpi-change-pill"
        >
          {isPositive ? '↑' : '↓'} {formattedChange}
        </span>
        <span className="bento-kpi-period">{timePeriod}</span>
      </div>
    </div>
  );
};
