// ============================================================================
// QuantAds - ABTestResults Component
// A/B test with spring entrance and brand colors
// ============================================================================

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface Variant {
  id: string;
  name: string;
  label: string;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  ctr: number;
  conversionRate: number;
  costPerConversion: number;
  roas: number;
  isControl: boolean;
  isWinner?: boolean;
}

interface StatisticalResult {
  confidence: number;
  pValue: number;
  effect: number;
  lowerBound: number;
  upperBound: number;
  sampleSizeAdequate: boolean;
  daysRemaining?: number;
}

interface ABTest {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'paused' | 'inconclusive';
  primaryMetric: 'ctr' | 'conversion_rate' | 'roas' | 'cpc';
  variants: Variant[];
  statistics: StatisticalResult;
  startDate: string;
  endDate?: string;
  trafficSplit: number[];
  minimumConfidence: number;
}

interface ABTestResultsProps {
  testId: string;
  onApplyWinner?: (variantId: string) => void;
  onStopTest?: (testId: string) => void;
  compact?: boolean;
}

const ABTestResults: React.FC<ABTestResultsProps> = ({
  testId,
  onApplyWinner,
  onStopTest,
  compact = false,
}) => {
  const [test, setTest] = useState<ABTest | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>('ctr');
  const [showDetails, setShowDetails] = useState<boolean>(false);

  const fetchTestData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/campaigns/ab-tests/${testId}`);
      if (!response.ok) throw new Error('Failed to load A/B test data');
      const data = await response.json();
      setTest(data);
      setSelectedMetric(data.primaryMetric || 'ctr');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load test results';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    fetchTestData();
    const interval = setInterval(fetchTestData, 30000);
    return () => clearInterval(interval);
  }, [fetchTestData]);

  const getMetricValue = (variant: Variant, metric: string): number => {
    switch (metric) {
      case 'ctr':
        return variant.ctr;
      case 'conversion_rate':
        return variant.conversionRate;
      case 'roas':
        return variant.roas;
      case 'cpc':
        return variant.costPerConversion;
      default:
        return variant.ctr;
    }
  };

  const formatMetricValue = (value: number, metric: string): string => {
    switch (metric) {
      case 'ctr':
        return `${value.toFixed(2)}%`;
      case 'conversion_rate':
        return `${value.toFixed(2)}%`;
      case 'roas':
        return `${value.toFixed(2)}x`;
      case 'cpc':
        return `$${value.toFixed(2)}`;
      default:
        return value.toFixed(2);
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 95) return 'text-[var(--quant-success)]';
    if (confidence >= 80) return 'text-[var(--quant-warning)]';
    return 'text-[var(--quant-destructive)]';
  };

  if (loading && !test) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--brand-app-color)]" />
        <span className="ml-3 text-[var(--quant-muted-foreground)]">Loading test results...</span>
      </div>
    );
  }

  if (error && !test) {
    return (
      <div className="text-center p-8">
        <p className="text-[var(--quant-destructive)] mb-2">{error}</p>
        <button
          onClick={fetchTestData}
          className="text-sm text-[var(--brand-app-color)] hover:underline min-h-[44px]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="text-center p-8 text-[var(--quant-muted-foreground)]">
        No test data available
      </div>
    );
  }

  const control = test.variants.find((v) => v.isControl) ?? test.variants[0];
  const winner = test.variants.find((v) => v.isWinner);
  const maxMetricValue = Math.max(
    ...test.variants.map((v) => getMetricValue(v, selectedMetric)),
    0.01,
  );

  const getImprovement = (variant: Variant, ctrl: Variant, metric: string): number => {
    const controlValue = getMetricValue(ctrl, metric);
    const variantValue = getMetricValue(variant, metric);
    if (controlValue === 0) return 0;
    return ((variantValue - controlValue) / controlValue) * 100;
  };

  return (
    <motion.div
      className={`bg-[var(--quant-card)] rounded-xl shadow-sm border border-[var(--quant-border)] ${compact ? 'p-4' : 'p-6'}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3
            className={`font-semibold text-[var(--quant-card-foreground)] ${compact ? 'text-sm' : 'text-lg'}`}
          >
            {test.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                test.status === 'running'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : test.status === 'completed'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : test.status === 'paused'
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              {test.status === 'running'
                ? 'Running'
                : test.status === 'completed'
                  ? 'Completed'
                  : test.status === 'paused'
                    ? 'Paused'
                    : 'Inconclusive'}
            </span>
            <span className="text-xs text-[var(--quant-muted-foreground)]">
              Started {new Date(test.startDate).toLocaleDateString()}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {test.status === 'running' && onStopTest && (
            <button
              onClick={() => onStopTest(test.id)}
              className="px-3 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
            >
              Stop Test
            </button>
          )}
          {winner && onApplyWinner && (
            <button
              onClick={() => onApplyWinner(winner.id)}
              className="px-3 py-1 text-xs bg-[var(--quant-success)] text-white rounded hover:bg-[var(--quant-success)]/90 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
            >
              Apply Winner
            </button>
          )}
        </div>
      </div>

      {/* Confidence */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-[var(--quant-card-foreground)]">
            Statistical Confidence:
          </span>
          <span className={`text-lg font-bold ${getConfidenceColor(test.statistics.confidence)}`}>
            {test.statistics.confidence.toFixed(1)}%
          </span>
        </div>
        <div className="h-3 bg-[var(--quant-muted)] rounded-full overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${test.statistics.confidence >= 95 ? 'bg-[var(--quant-success)]' : test.statistics.confidence >= 80 ? 'bg-[var(--quant-warning)]' : 'bg-[var(--quant-destructive)]'}`}
            animate={{ width: `${test.statistics.confidence}%` }}
            transition={{ type: 'spring', ...spring.snappy }}
          />
        </div>
      </div>

      {/* Metric Selector */}
      {!compact && (
        <div className="flex gap-2 mb-4">
          {['ctr', 'conversion_rate', 'roas', 'cpc'].map((metric) => (
            <button
              key={metric}
              onClick={() => setSelectedMetric(metric)}
              className={`px-3 py-1 rounded text-xs min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] ${selectedMetric === metric ? 'bg-[var(--brand-app-color)]/10 text-[var(--brand-app-color)] font-medium' : 'text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)]'}`}
            >
              {metric === 'ctr'
                ? 'CTR'
                : metric === 'conversion_rate'
                  ? 'Conv. Rate'
                  : metric === 'roas'
                    ? 'ROAS'
                    : 'CPC'}
            </button>
          ))}
        </div>
      )}

      {/* Variants */}
      <div className="space-y-3">
        {test.variants.map((variant, idx) => {
          const metricVal = getMetricValue(variant, selectedMetric);
          const barWidth = (metricVal / maxMetricValue) * 100;
          const improvement =
            !variant.isControl && control ? getImprovement(variant, control, selectedMetric) : 0;

          return (
            <motion.div
              key={variant.id}
              className={`p-3 rounded-lg border ${variant.isWinner ? 'border-[var(--quant-success)] bg-green-50 dark:bg-green-900/10' : variant.isControl ? 'border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-900/10' : 'border-[var(--quant-border)]'}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', ...spring.gentle, delay: idx * 0.05 }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${idx === 0 ? 'bg-[var(--brand-app-color)]' : idx === 1 ? 'bg-purple-500' : 'bg-orange-500'}`}
                  >
                    {variant.label || String.fromCharCode(65 + idx)}
                  </span>
                  <span className="font-medium text-sm text-[var(--quant-card-foreground)]">
                    {variant.name}
                  </span>
                  {variant.isControl && (
                    <span className="text-xs bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded">
                      Control
                    </span>
                  )}
                  {variant.isWinner && (
                    <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded">
                      Winner
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-bold text-sm text-[var(--quant-card-foreground)]">
                    {formatMetricValue(metricVal, selectedMetric)}
                  </span>
                  {!variant.isControl && (
                    <span
                      className={`ml-2 text-xs font-medium ${improvement >= 0 ? 'text-[var(--quant-success)]' : 'text-[var(--quant-destructive)]'}`}
                    >
                      {improvement >= 0 ? '+' : ''}
                      {improvement.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 bg-[var(--quant-muted)] rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${variant.isWinner ? 'bg-[var(--quant-success)]' : idx === 0 ? 'bg-[var(--brand-app-color)]' : 'bg-purple-400'}`}
                  animate={{ width: `${barWidth}%` }}
                  transition={{ type: 'spring', ...spring.snappy }}
                />
              </div>
              {!compact && (
                <div className="flex gap-4 mt-2 text-xs text-[var(--quant-muted-foreground)]">
                  <span>{variant.impressions.toLocaleString()} imp</span>
                  <span>{variant.clicks.toLocaleString()} clicks</span>
                  <span>{variant.conversions} conv</span>
                  <span>${variant.revenue.toFixed(0)} rev</span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {!compact && (
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="mt-4 text-xs text-[var(--brand-app-color)] hover:underline min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
        >
          {showDetails ? 'Hide details' : 'Show statistical details'}
        </button>
      )}

      {showDetails && (
        <div className="mt-3 p-3 bg-[var(--quant-muted)] rounded-lg text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-[var(--quant-muted-foreground)]">P-value:</span>
            <span className="font-mono">{test.statistics.pValue.toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--quant-muted-foreground)]">Effect size:</span>
            <span>{test.statistics.effect.toFixed(2)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--quant-muted-foreground)]">95% CI:</span>
            <span>
              [{test.statistics.lowerBound.toFixed(2)}%, {test.statistics.upperBound.toFixed(2)}%]
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--quant-muted-foreground)]">Sample adequate:</span>
            <span
              className={
                test.statistics.sampleSizeAdequate
                  ? 'text-[var(--quant-success)]'
                  : 'text-[var(--quant-destructive)]'
              }
            >
              {test.statistics.sampleSizeAdequate ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--quant-muted-foreground)]">Traffic split:</span>
            <span>{test.trafficSplit.map((t) => `${t}%`).join(' / ')}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ABTestResults;
