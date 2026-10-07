// ============================================================================
// QuantAds - CreativePreview Component
// Ad creative preview with spring scale and dark mode
// ============================================================================

'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import type { Creative } from '../types';

interface CreativePreviewProps {
  creative: Creative;
  placement?: string;
  showMetrics?: boolean;
  isLoading?: boolean;
}

export function CreativePreview({
  creative,
  placement = 'feed',
  showMetrics = false,
  isLoading = false,
}: CreativePreviewProps) {
  const dimensions = getDimensions(placement);

  if (isLoading) {
    return (
      <div
        className="animate-pulse rounded-xl border border-[var(--quant-border)] bg-[var(--quant-muted)]"
        style={{
          maxWidth: `${dimensions.width}px`,
          aspectRatio: `${dimensions.width}/${dimensions.height}`,
        }}
      />
    );
  }

  return (
    <motion.div
      className="relative overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] shadow-sm"
      style={{ maxWidth: `${dimensions.width}px` }}
      role="article"
      aria-label={`Creative preview: ${creative.name}`}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', ...spring.snappy }}
    >
      {/* Preview Label */}
      <div className="border-b border-[var(--quant-border)] bg-[var(--quant-muted)] px-3 py-1.5">
        <span className="text-xs font-medium text-[var(--quant-muted-foreground)]">
          {creative.format} - {placement}
        </span>
      </div>

      {/* Preview Frame */}
      <div
        className="relative overflow-hidden bg-[var(--quant-muted)]"
        style={{ aspectRatio: `${dimensions.width}/${dimensions.height}` }}
      >
        {creative.assets.length > 0 && (
          <img
            src={creative.assets[0]?.url}
            alt={creative.headline}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent p-4">
          <span className="mb-1 inline-block w-fit rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
            Sponsored
          </span>
          <h3 className="mb-0.5 text-sm font-bold text-white line-clamp-2">{creative.headline}</h3>
          <p className="mb-2 text-xs text-white/80 line-clamp-2">{creative.description}</p>
          <button
            type="button"
            className="min-h-[44px] w-fit rounded-lg bg-[var(--brand-app-color)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--brand-app-color)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-ring)]"
            aria-label={creative.callToAction}
          >
            {creative.callToAction}
          </button>
        </div>
      </div>

      {/* Metrics */}
      {showMetrics && creative.performance && (
        <div className="flex gap-4 border-t border-[var(--quant-border)] px-3 py-2">
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            {creative.performance.impressions.toLocaleString()} imp
          </span>
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            {creative.performance.ctr.toFixed(2)}% CTR
          </span>
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            Quality: {(creative.performance.qualityScore * 10).toFixed(1)}/10
          </span>
        </div>
      )}

      {/* Status Badge */}
      <div className="border-t border-[var(--quant-border)] px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
            creative.status === 'approved'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : creative.status === 'rejected'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : creative.status === 'pending_review'
                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}
        >
          {creative.status.replace('_', ' ')}
        </span>
      </div>
    </motion.div>
  );
}

function getDimensions(placement: string): { width: number; height: number } {
  const dims: Record<string, { width: number; height: number }> = {
    feed: { width: 600, height: 400 },
    sidebar: { width: 300, height: 250 },
    banner: { width: 728, height: 90 },
    stories: { width: 360, height: 640 },
    'pre-roll': { width: 640, height: 360 },
  };
  return dims[placement] || { width: 600, height: 400 };
}

export default CreativePreview;
