// ============================================================================
// QuantAds - BudgetOptimizer Component
// AI budget optimization widget with spring animations
// ============================================================================

'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface BudgetOptimizerProps {
  currentBudget: number;
  recommendedBudget?: number;
  expectedResults?: { impressions: number; clicks: number; conversions: number };
  reasoning?: string;
  onApply?: (amount: number) => void;
}

export function BudgetOptimizer({
  currentBudget,
  recommendedBudget,
  expectedResults,
  reasoning,
  onApply,
}: BudgetOptimizerProps) {
  const change = recommendedBudget
    ? ((recommendedBudget - currentBudget) / currentBudget) * 100
    : 0;
  const direction = change > 0 ? 'increase' : change < 0 ? 'decrease' : 'maintain';

  return (
    <motion.div
      className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-5 shadow-sm"
      role="region"
      aria-label="AI budget recommendation"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--quant-card-foreground)]">
          AI Budget Recommendation
        </h4>
        <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
          AI
        </span>
      </div>

      {/* Budget Comparison */}
      <div className="mb-4 flex items-center gap-4">
        <div className="flex flex-col items-center rounded-lg bg-[var(--quant-muted)] px-4 py-3">
          <span className="text-xs text-[var(--quant-muted-foreground)]">Current</span>
          <span className="text-lg font-bold text-[var(--quant-card-foreground)]">
            ${currentBudget.toFixed(2)}/day
          </span>
        </div>

        <span className="text-lg text-[var(--quant-muted-foreground)]" aria-hidden="true">
          {direction === 'increase' ? '\u2192' : direction === 'decrease' ? '\u2190' : '='}
        </span>

        {recommendedBudget != null && (
          <div
            className={`flex flex-col items-center rounded-lg px-4 py-3 ${
              direction === 'increase'
                ? 'bg-green-50 dark:bg-green-900/20'
                : direction === 'decrease'
                  ? 'bg-red-50 dark:bg-red-900/20'
                  : 'bg-[var(--quant-muted)]'
            }`}
          >
            <span className="text-xs text-[var(--quant-muted-foreground)]">Recommended</span>
            <span className="text-lg font-bold text-[var(--quant-card-foreground)]">
              ${recommendedBudget.toFixed(2)}/day
            </span>
            <span
              className={`text-xs font-medium ${change >= 0 ? 'text-[var(--quant-success)]' : 'text-[var(--quant-destructive)]'}`}
            >
              {change >= 0 ? '+' : ''}
              {change.toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {/* Expected Results */}
      {expectedResults && (
        <div className="mb-4 rounded-lg bg-[var(--brand-app-color)]/10 p-3">
          <h5 className="mb-2 text-xs font-semibold text-[var(--quant-card-foreground)]">
            Expected Daily Results
          </h5>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[var(--brand-app-color)]">
                {expectedResults.impressions.toLocaleString()}
              </span>
              <span className="text-xs text-[var(--quant-muted-foreground)]">impressions</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[var(--brand-app-color)]">
                {expectedResults.clicks.toLocaleString()}
              </span>
              <span className="text-xs text-[var(--quant-muted-foreground)]">clicks</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-[var(--brand-app-color)]">
                {expectedResults.conversions.toLocaleString()}
              </span>
              <span className="text-xs text-[var(--quant-muted-foreground)]">conversions</span>
            </div>
          </div>
        </div>
      )}

      {/* Reasoning */}
      {reasoning && (
        <p className="mb-4 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
          {reasoning}
        </p>
      )}

      {/* Apply Button */}
      {recommendedBudget != null && onApply && (
        <motion.button
          type="button"
          onClick={() => onApply(recommendedBudget)}
          className="min-h-[44px] w-full rounded-lg bg-[var(--brand-app-color)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-app-color)]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)] focus-visible:ring-offset-2"
          aria-label="Apply AI budget recommendation"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', ...spring.snappy }}
        >
          Apply Recommendation
        </motion.button>
      )}
    </motion.div>
  );
}

export default BudgetOptimizer;
