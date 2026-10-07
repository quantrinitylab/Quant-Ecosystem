// ============================================================================
// QuantAds - FunnelChart Component
// Animated funnel segments with brand colors
// ============================================================================

'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface FunnelStage {
  id: string;
  name: string;
  value: number;
  color: string;
  icon?: string;
  metadata?: Record<string, string | number>;
}

interface FunnelChartProps {
  stages: FunnelStage[];
  title?: string;
  showPercentages?: boolean;
  showDropOff?: boolean;
  orientation?: 'vertical' | 'horizontal';
  onStageClick?: (stage: FunnelStage) => void;
  height?: number;
  comparisonStages?: FunnelStage[];
  comparisonLabel?: string;
}

const FunnelChart: React.FC<FunnelChartProps> = ({
  stages,
  title = 'Conversion Funnel',
  showPercentages = true,
  showDropOff = true,
  orientation = 'vertical',
  onStageClick,
  height = 400,
  comparisonStages,
  comparisonLabel = 'Previous Period',
}) => {
  const [hoveredStage, setHoveredStage] = useState<string | null>(null);

  const maxValue = Math.max(...stages.map((s) => s.value), 1);

  const getDropOffRate = useCallback(
    (currentIndex: number): number => {
      if (currentIndex === 0) return 0;
      const prev = stages[currentIndex - 1]?.value ?? 0;
      const curr = stages[currentIndex]?.value ?? 0;
      if (prev === 0) return 0;
      return ((prev - curr) / prev) * 100;
    },
    [stages],
  );

  const getConversionRate = useCallback(
    (fromIndex: number, toIndex: number): number => {
      const fromVal = stages[fromIndex]?.value ?? 0;
      const toVal = stages[toIndex]?.value ?? 0;
      if (fromVal === 0) return 0;
      return (toVal / fromVal) * 100;
    },
    [stages],
  );

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const overallConversion = stages.length >= 2 ? getConversionRate(0, stages.length - 1) : 100;

  if (stages.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-[var(--quant-muted-foreground)]">
        <p>No funnel data available</p>
      </div>
    );
  }

  if (orientation === 'horizontal') {
    return (
      <div className="w-full">
        {title && (
          <h3 className="text-lg font-semibold text-[var(--quant-card-foreground)] mb-4">
            {title}
          </h3>
        )}
        <motion.div
          className="flex items-center gap-2 overflow-x-auto py-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'spring', ...spring.gentle }}
        >
          {stages.map((stage, idx) => {
            const percentage = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
            const isHovered = hoveredStage === stage.id;
            return (
              <React.Fragment key={stage.id}>
                <motion.div
                  className={`flex flex-col items-center min-w-[120px] p-3 rounded-xl cursor-pointer transition-colors ${isHovered ? 'bg-[var(--quant-muted)] shadow-md' : 'hover:bg-[var(--quant-muted)]'}`}
                  onMouseEnter={() => setHoveredStage(stage.id)}
                  onMouseLeave={() => setHoveredStage(null)}
                  onClick={() => onStageClick?.(stage)}
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', ...spring.snappy }}
                >
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg mb-2"
                    style={{
                      backgroundColor: stage.color,
                      transform: `scale(${0.5 + percentage / 200})`,
                    }}
                  >
                    {stage.icon || formatNumber(stage.value)}
                  </div>
                  <span className="text-sm font-medium text-[var(--quant-card-foreground)]">
                    {stage.name}
                  </span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    {formatNumber(stage.value)}
                  </span>
                  {showPercentages && (
                    <span className="text-xs font-medium" style={{ color: stage.color }}>
                      {percentage.toFixed(1)}%
                    </span>
                  )}
                </motion.div>
                {idx < stages.length - 1 && (
                  <div className="flex flex-col items-center">
                    <div className="text-[var(--quant-muted-foreground)] text-lg">&rarr;</div>
                    {showDropOff && (
                      <span className="text-xs text-[var(--quant-destructive)]">
                        -{getDropOffRate(idx + 1).toFixed(1)}%
                      </span>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </motion.div>
        <div className="mt-4 p-3 bg-[var(--brand-app-color)]/10 rounded-lg text-center">
          <span className="text-sm text-[var(--brand-app-color)] font-medium">
            Overall Conversion: {overallConversion.toFixed(2)}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="w-full"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--quant-card-foreground)]">{title}</h3>
          <span className="text-sm text-[var(--brand-app-color)] font-medium">
            Overall: {overallConversion.toFixed(2)}%
          </span>
        </div>
      )}

      <div className="space-y-2" style={{ maxHeight: height }}>
        {stages.map((stage, idx) => {
          const percentage = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
          const isHovered = hoveredStage === stage.id;
          const compStage = comparisonStages?.[idx];

          return (
            <div key={stage.id}>
              <div
                className={`relative transition-all duration-200 ${isHovered ? 'transform scale-[1.01]' : ''}`}
                onMouseEnter={() => setHoveredStage(stage.id)}
                onMouseLeave={() => setHoveredStage(null)}
                onClick={() => onStageClick?.(stage)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-32 flex items-center gap-2">
                    {stage.icon && <span className="text-lg">{stage.icon}</span>}
                    <span className="text-sm font-medium text-[var(--quant-card-foreground)] truncate">
                      {stage.name}
                    </span>
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-10 bg-[var(--quant-muted)] rounded-lg overflow-hidden relative cursor-pointer">
                      <motion.div
                        className="h-full rounded-lg flex items-center"
                        style={{ backgroundColor: stage.color, opacity: isHovered ? 1 : 0.85 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ type: 'spring', ...spring.snappy }}
                      >
                        <span className="text-white text-sm font-bold px-3 whitespace-nowrap">
                          {formatNumber(stage.value)}
                        </span>
                      </motion.div>
                      {compStage && (
                        <div
                          className="absolute inset-y-0 border-r-2 border-dashed border-[var(--quant-muted-foreground)]"
                          style={{ left: `${(compStage.value / maxValue) * 100}%` }}
                          title={`${comparisonLabel}: ${formatNumber(compStage.value)}`}
                        />
                      )}
                    </div>
                  </div>
                  <div className="w-20 text-right">
                    {showPercentages && (
                      <span className="text-sm font-medium" style={{ color: stage.color }}>
                        {percentage.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>

                {isHovered && stage.metadata && (
                  <div className="absolute right-0 top-full mt-1 bg-[var(--quant-foreground)] text-[var(--quant-background)] text-xs py-2 px-3 rounded-lg z-10 shadow-lg">
                    {Object.entries(stage.metadata).map(([key, val]) => (
                      <div key={key} className="flex gap-2">
                        <span className="opacity-70">{key}:</span>
                        <span>{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {showDropOff && idx < stages.length - 1 && (
                <div className="flex items-center gap-3 py-1">
                  <div className="w-32" />
                  <div className="flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                    <div className="w-4 h-4 flex items-center justify-center">&darr;</div>
                    <span className="text-[var(--quant-destructive)] font-medium">
                      -{getDropOffRate(idx + 1).toFixed(1)}% drop-off
                    </span>
                    <span className="text-[var(--quant-muted-foreground)]">
                      ({formatNumber((stages[idx]?.value ?? 0) - (stages[idx + 1]?.value ?? 0))}{' '}
                      lost)
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {comparisonStages && (
        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
          <span className="w-4 border-t-2 border-dashed border-[var(--quant-muted-foreground)]" />
          <span>{comparisonLabel}</span>
        </div>
      )}
    </motion.div>
  );
};

export default FunnelChart;
