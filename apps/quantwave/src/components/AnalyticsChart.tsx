'use client';

// ============================================================================
// QuantSync - AnalyticsChart Component
// Line/bar chart with data points, hover tooltip, date range, comparison
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { FadeIn } from '@quant/shared-ui';

interface DataPoint {
  date: string;
  value: number;
  label?: string;
}

interface AnalyticsChartProps {
  data: DataPoint[];
  comparisonData?: DataPoint[];
  type: 'line' | 'bar';
  title: string;
  color?: string;
  comparisonColor?: string;
  height?: number;
  showLabels?: boolean;
  dateRanges?: { value: string; label: string }[];
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
  formatValue?: (value: number) => string;
  responsive?: boolean;
}

interface TooltipData {
  x: number;
  y: number;
  value: number;
  date: string;
  comparisonValue?: number;
}

const AnalyticsChart: React.FC<AnalyticsChartProps> = ({
  data,
  comparisonData,
  type,
  title,
  color = '#3b82f6',
  comparisonColor = '#9ca3af',
  height = 200,
  showLabels = true,
  dateRanges,
  selectedRange,
  onRangeChange,
  formatValue,
  responsive = true,
}) => {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const maxValue = useMemo(() => {
    const allValues = [...data.map((d) => d.value), ...(comparisonData || []).map((d) => d.value)];
    return Math.max(...allValues, 1);
  }, [data, comparisonData]);

  const minValue = useMemo(() => {
    return Math.min(...data.map((d) => d.value), 0);
  }, [data]);

  const valueRange = maxValue - minValue || 1;

  const getY = useCallback(
    (value: number): number => {
      return height - ((value - minValue) / valueRange) * (height - 20) - 10;
    },
    [height, minValue, valueRange],
  );

  const defaultFormatValue = useCallback(
    (value: number): string => {
      if (formatValue) return formatValue(value);
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
      return value.toString();
    },
    [formatValue],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, index: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setTooltip({
        x,
        y,
        value: data[index]!.value,
        date: data[index]!.date,
        comparisonValue: comparisonData?.[index]?.value,
      });
      setHoveredIndex(index);
    },
    [data, comparisonData],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setHoveredIndex(null);
  }, []);

  const totalValue = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);
  const avgValue = useMemo(
    () => (data.length > 0 ? totalValue / data.length : 0),
    [totalValue, data.length],
  );
  const trend = useMemo(() => {
    if (data.length < 2) return 0;
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    const firstAvg = firstHalf.reduce((s, d) => s + d.value, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, d) => s + d.value, 0) / secondHalf.length;
    return firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
  }, [data]);

  const renderLineChart = () => {
    if (data.length === 0) return null;
    const width = 100;
    const stepX = data.length > 1 ? width / (data.length - 1) : width;

    const createPath = (points: DataPoint[]): string => {
      return points
        .map((point, idx) => {
          const x = idx * stepX;
          const y = getY(point.value);
          return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ');
    };

    const areaPath =
      data
        .map((point, idx) => {
          const x = idx * stepX;
          const y = getY(point.value);
          return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
        })
        .join(' ') + ` L ${(data.length - 1) * stepX} ${height} L 0 ${height} Z`;

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height: `${height}px` }}
      >
        <defs>
          <linearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#gradient-${title})`} />
        <path
          d={createPath(data)}
          fill="none"
          stroke={color}
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {comparisonData && comparisonData.length > 0 && (
          <path
            d={createPath(comparisonData)}
            fill="none"
            stroke={comparisonColor}
            strokeWidth="0.3"
            strokeDasharray="1 1"
          />
        )}
        {hoveredIndex !== null && (
          <>
            <line
              x1={hoveredIndex * stepX}
              y1="0"
              x2={hoveredIndex * stepX}
              y2={height}
              stroke={color}
              strokeWidth="0.2"
              strokeDasharray="1 1"
            />
            <circle
              cx={hoveredIndex * stepX}
              cy={getY(data[hoveredIndex]!.value)}
              r="1.5"
              fill={color}
              stroke="white"
              strokeWidth="0.5"
            />
          </>
        )}
      </svg>
    );
  };

  const renderBarChart = () => {
    if (data.length === 0) return null;

    return (
      <div className="flex items-end gap-[2px] w-full" style={{ height: `${height}px` }}>
        {data.map((point, idx) => {
          const barHeight = (point.value / maxValue) * 100;
          const isHovered = hoveredIndex === idx;
          return (
            <div
              key={idx}
              className="flex-1 relative group cursor-pointer"
              onMouseEnter={(e) => handleMouseMove(e, idx)}
              onMouseLeave={handleMouseLeave}
            >
              <div
                className="w-full rounded-t transition-all"
                style={{
                  height: `${barHeight}%`,
                  backgroundColor: isHovered ? color : `${color}cc`,
                  minHeight: '2px',
                }}
              />
              {comparisonData && comparisonData[idx] && (
                <div
                  className="absolute bottom-0 w-full rounded-t opacity-30"
                  style={{
                    height: `${(comparisonData[idx].value / maxValue) * 100}%`,
                    backgroundColor: comparisonColor,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <FadeIn>
      <div
        className={`bg-white dark:bg-[var(--quant-card)] rounded-xl border dark:border-gray-700 p-4 ${responsive ? 'w-full' : ''}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-gray-100">{title}</h3>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {defaultFormatValue(totalValue)}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${trend >= 0 ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}
              >
                {trend >= 0 ? '+' : ''}
                {trend.toFixed(1)}%
              </span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Avg: {defaultFormatValue(Math.round(avgValue))}/day
            </span>
          </div>
          {dateRanges && (
            <div className="flex gap-1">
              {dateRanges.map((range) => (
                <button
                  key={range.value}
                  onClick={() => onRangeChange?.(range.value)}
                  className={`px-2 py-1 rounded text-xs min-h-[44px] ${selectedRange === range.value ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative" onMouseLeave={handleMouseLeave}>
          {type === 'line' ? (
            <div
              onMouseMove={(e) => {
                if (data.length === 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const idx = Math.round((x / rect.width) * (data.length - 1));
                if (idx >= 0 && idx < data.length) {
                  handleMouseMove(e, idx);
                }
              }}
            >
              {renderLineChart()}
            </div>
          ) : (
            renderBarChart()
          )}

          {tooltip && (
            <div
              className="absolute bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg pointer-events-none z-10"
              style={{
                left: `${Math.min(tooltip.x, 200)}px`,
                top: `${Math.max(tooltip.y - 50, 0)}px`,
              }}
            >
              <p className="font-medium">{defaultFormatValue(tooltip.value)}</p>
              <p className="text-gray-400">{tooltip.date}</p>
              {tooltip.comparisonValue !== undefined && (
                <p className="text-gray-400">
                  Previous: {defaultFormatValue(tooltip.comparisonValue)}
                </p>
              )}
            </div>
          )}
        </div>

        {showLabels && data.length > 0 && (
          <div className="flex justify-between mt-2 text-xs text-gray-400 dark:text-gray-500">
            <span>{data[0]?.date}</span>
            {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.date}</span>}
            <span>{data[data.length - 1]?.date}</span>
          </div>
        )}

        {comparisonData && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t dark:border-gray-700">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-500 dark:text-gray-400">Current</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-3 h-0.5 rounded border-dashed"
                style={{ backgroundColor: comparisonColor }}
              />
              <span className="text-xs text-gray-500 dark:text-gray-400">Previous</span>
            </div>
          </div>
        )}
      </div>
    </FadeIn>
  );
};

export default AnalyticsChart;
