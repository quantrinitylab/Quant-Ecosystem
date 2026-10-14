'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface LinkPreviewCardProps {
  // QC-F-309: only the URL is known. Title/description/image props are
  // gone — they were only ever filled with fabricated text. They return
  // only when the verified unfurl contract (Slice 2) supplies real values.
  url: string;
}

export function LinkPreviewCard({ url }: LinkPreviewCardProps) {
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
      <div className="p-3">
        <p className="text-xs text-[var(--quant-muted-foreground)] truncate mb-1">{hostname}</p>
        <p className="text-sm font-medium text-[var(--quant-foreground)] truncate">{url}</p>
      </div>
    </motion.a>
  );
}

export default LinkPreviewCard;
