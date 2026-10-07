// ============================================================================
// QuantAds - CampaignCard Component
// Campaign overview card with spring animations
// ============================================================================

'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import type { Campaign } from '../types';

interface CampaignCardProps {
  campaign: Campaign;
  onClick?: (id: string) => void;
}

export function CampaignCard({ campaign, onClick }: CampaignCardProps) {
  const statusColors: Record<string, string> = {
    active: 'bg-[var(--quant-success)]/10 text-[var(--quant-success)]',
    paused: 'bg-[var(--quant-warning)]/10 text-[var(--quant-warning)]',
    draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    pending_review: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  };

  const budgetPercent =
    campaign.budget.amount > 0 ? (campaign.budget.spent / campaign.budget.amount) * 100 : 0;

  return (
    <motion.article
      className="cursor-pointer rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-4 shadow-sm transition-shadow min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
      onClick={() => onClick?.(campaign.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(campaign.id);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Campaign: ${campaign.name}, status: ${campaign.status.replace('_', ' ')}`}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', ...spring.snappy }}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <h4 className="text-sm font-semibold text-[var(--quant-card-foreground)] line-clamp-1">
          {campaign.name}
        </h4>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
            statusColors[campaign.status] || 'bg-gray-100 text-gray-700'
          }`}
        >
          {campaign.status.replace('_', ' ')}
        </span>
      </div>

      {/* Metrics */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-xs text-[var(--quant-muted-foreground)]">Impressions</span>
          <span className="text-sm font-bold text-[var(--quant-card-foreground)]">
            {formatNum(campaign.metrics.impressions)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-[var(--quant-muted-foreground)]">Clicks</span>
          <span className="text-sm font-bold text-[var(--quant-card-foreground)]">
            {formatNum(campaign.metrics.clicks)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-[var(--quant-muted-foreground)]">CTR</span>
          <span className="text-sm font-bold text-[var(--quant-card-foreground)]">
            {campaign.metrics.ctr.toFixed(2)}%
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-[var(--quant-muted-foreground)]">Spend</span>
          <span className="text-sm font-bold text-[var(--quant-card-foreground)]">
            ${campaign.metrics.spend.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Budget Bar */}
      <div className="mb-3">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--quant-muted)]"
          role="progressbar"
          aria-label="Budget spent"
          aria-valuenow={budgetPercent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-[var(--brand-app-color)] transition-all"
            style={{ width: `${Math.min(budgetPercent, 100)}%` }}
          />
        </div>
        <span className="mt-1 block text-xs text-[var(--quant-muted-foreground)]">
          ${campaign.budget.spent.toFixed(0)} / ${campaign.budget.amount.toFixed(0)}
        </span>
      </div>

      {/* Objective */}
      <span className="inline-flex items-center rounded-full bg-[var(--brand-app-color)]/10 px-2.5 py-0.5 text-xs font-medium capitalize text-[var(--brand-app-color)]">
        {campaign.objective}
      </span>
    </motion.article>
  );
}

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default CampaignCard;
