// ============================================================================
// QuantTube - ContentGrid Component
// Responsive grid for videos/shows/music content cards with stagger animation
// ============================================================================

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface ContentItem {
  id: string;
  title: string;
  thumbnailUrl: string;
  duration?: number;
  views?: number;
  channelName?: string;
  artistName?: string;
  type: 'video' | 'track' | 'show' | 'short';
}

interface ContentGridProps {
  items: ContentItem[];
  layout: 'grid' | 'list' | 'compact';
  columns?: number;
  onItemClick?: (id: string) => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', ...spring.gentle },
  },
};

export function ContentGrid({ items, layout, columns = 4, onItemClick }: ContentGridProps) {
  const gridStyle =
    layout === 'grid' ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined;

  return (
    <motion.div
      className={`${layout === 'grid' ? 'grid gap-4 md:gap-6' : layout === 'list' ? 'flex flex-col gap-3' : 'grid grid-cols-2 gap-2'}`}
      style={gridStyle}
      role="list"
      aria-label="Content grid"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {items.map((item) =>
        layout === 'list' ? (
          <ListItem key={item.id} item={item} onItemClick={onItemClick} />
        ) : (
          <GridItem key={item.id} item={item} onItemClick={onItemClick} />
        ),
      )}
    </motion.div>
  );
}

function GridItem({
  item,
  onItemClick,
}: {
  item: ContentItem;
  onItemClick?: (id: string) => void;
}) {
  return (
    <motion.button
      type="button"
      role="listitem"
      className="flex flex-col rounded-xl overflow-hidden bg-[var(--quant-card)] border border-[var(--quant-border)] hover:border-[var(--brand-primary)]/30 transition-colors cursor-pointer text-left"
      data-id={item.id}
      onClick={() => onItemClick?.(item.id)}
      aria-label={`${item.title} - ${item.channelName || item.artistName || ''}`}
      variants={itemVariants}
      whileHover={{ scale: 1.02, transition: { type: 'spring', ...spring.snappy } }}
    >
      <div className="relative aspect-video">
        <img
          src={item.thumbnailUrl}
          alt={item.title}
          loading="lazy"
          className="w-full h-full object-cover"
        />
        {item.duration != null && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded">
            {formatDuration(item.duration)}
          </span>
        )}
        {item.type === 'short' && (
          <span className="absolute top-1 left-1 bg-[var(--brand-primary)] text-white text-xs font-bold px-1.5 py-0.5 rounded">
            SHORT
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1">
        <h3 className="text-sm font-medium text-[var(--quant-foreground)] line-clamp-2">
          {item.title}
        </h3>
        <p className="text-xs text-[var(--quant-muted-foreground)]">
          {item.channelName || item.artistName || ''}
        </p>
        {item.views != null && (
          <p className="text-xs text-[var(--quant-muted-foreground)]">
            {formatViews(item.views)} views
          </p>
        )}
      </div>
    </motion.button>
  );
}

function ListItem({
  item,
  onItemClick,
}: {
  item: ContentItem;
  onItemClick?: (id: string) => void;
}) {
  return (
    <motion.button
      type="button"
      role="listitem"
      className="flex items-center gap-3 p-2 rounded-lg bg-[var(--quant-card)] border border-[var(--quant-border)] hover:border-[var(--brand-primary)]/30 transition-colors cursor-pointer text-left min-h-[44px]"
      data-id={item.id}
      onClick={() => onItemClick?.(item.id)}
      aria-label={`${item.title} - ${item.channelName || item.artistName || ''}`}
      variants={itemVariants}
      whileHover={{ x: 4, transition: { type: 'spring', ...spring.snappy } }}
    >
      <img
        src={item.thumbnailUrl}
        alt={item.title}
        className="w-40 h-24 object-cover rounded flex-shrink-0"
      />
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <h3 className="text-sm font-medium text-[var(--quant-foreground)] truncate">
          {item.title}
        </h3>
        <p className="text-xs text-[var(--quant-muted-foreground)]">
          {item.channelName || item.artistName || ''}
        </p>
        {item.views != null && (
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            {formatViews(item.views)} views
          </span>
        )}
      </div>
      {item.duration != null && (
        <span className="text-xs text-[var(--quant-muted-foreground)] flex-shrink-0">
          {formatDuration(item.duration)}
        </span>
      )}
    </motion.button>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatViews(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
  return views.toString();
}

export default ContentGrid;
