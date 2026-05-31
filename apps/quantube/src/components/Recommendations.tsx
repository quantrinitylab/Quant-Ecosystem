// ============================================================================
// QuantTube - Recommendations Component
// AI recommendation sidebar with personalized content suggestions
// ============================================================================

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import type { Recommendation } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

interface RecommendationsProps {
  recommendations: Recommendation[];
  title: string;
  loading: boolean;
  onItemClick: (contentId: string) => void;
  onRefresh: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: 12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring', ...spring.gentle },
  },
};

export function Recommendations({
  recommendations,
  title,
  loading,
  onItemClick,
  onRefresh,
}: RecommendationsProps) {
  if (loading) {
    return (
      <aside
        className="flex flex-col gap-3 p-4"
        aria-label="Loading recommendations"
        aria-busy="true"
      >
        <LoadingSkeleton variant="sidebar" count={5} />
      </aside>
    );
  }

  if (recommendations.length === 0) {
    return (
      <aside
        className="flex flex-col items-center justify-center py-12 px-4 text-center"
        aria-label="No recommendations"
      >
        <div className="text-4xl mb-3">🎬</div>
        <p className="text-sm font-medium text-[var(--quant-foreground)]">No recommendations yet</p>
        <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
          Watch more content to get personalized suggestions
        </p>
        <button
          onClick={onRefresh}
          className="mt-4 px-4 py-2 text-sm font-medium bg-[var(--brand-primary)] text-white rounded-lg hover:bg-[var(--brand-primary-hover)] transition-colors min-h-[44px]"
        >
          Refresh
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-3" aria-label="Recommendations">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <h3 className="text-base font-semibold text-[var(--quant-foreground)]">{title}</h3>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 text-xs font-medium text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] hover:bg-[var(--surface-hover)] rounded transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Refresh recommendations"
        >
          Refresh
        </button>
      </div>

      {/* List */}
      <motion.div
        className="flex flex-col gap-2 px-2"
        role="list"
        aria-label="Recommended content"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {recommendations.map((rec) => (
          <motion.div
            key={rec.contentId}
            role="listitem"
            className="flex gap-3 p-2 rounded-lg hover:bg-[var(--surface-hover)] cursor-pointer transition-colors"
            data-id={rec.contentId}
            data-score={rec.score.toFixed(3)}
            onClick={() => onItemClick(rec.contentId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onItemClick(rec.contentId);
            }}
            tabIndex={0}
            aria-label={`${rec.contentId} - ${rec.reason}`}
            variants={itemVariants}
            whileHover={{ x: 4, transition: { type: 'spring', ...spring.snappy } }}
          >
            <div
              className="w-40 h-24 bg-[var(--surface-elevated)] rounded flex-shrink-0"
              aria-hidden="true"
            />
            <div className="flex-1 flex flex-col gap-1 min-w-0">
              <p className="text-sm font-medium text-[var(--quant-foreground)] truncate">
                {rec.contentId}
              </p>
              <span className="text-xs text-[var(--quant-muted-foreground)] line-clamp-2">
                {rec.reason}
              </span>
              <span className="inline-flex self-start px-1.5 py-0.5 text-xs bg-[var(--surface-elevated)] text-[var(--quant-muted-foreground)] rounded">
                {rec.contentType}
              </span>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </aside>
  );
}

export default Recommendations;
