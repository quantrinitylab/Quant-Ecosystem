'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface LinkPreviewCardProps {
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

export function LinkPreviewCard({ url, title, description, imageUrl }: LinkPreviewCardProps) {
  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  return (
    <motion.a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl overflow-hidden border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:bg-[var(--quant-muted)] transition-colors max-w-[280px]"
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', ...spring.snappy }}
    >
      {imageUrl && (
        <div className="w-full h-32 bg-[var(--quant-muted)]">
          <img src={imageUrl} alt={title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-3">
        <p className="text-xs text-[var(--quant-muted-foreground)] truncate mb-1">{hostname}</p>
        <p className="text-sm font-medium text-[var(--quant-foreground)] line-clamp-2">{title}</p>
        {description && (
          <p className="text-xs text-[var(--quant-muted-foreground)] line-clamp-2 mt-1">
            {description}
          </p>
        )}
      </div>
    </motion.a>
  );
}

export default LinkPreviewCard;
