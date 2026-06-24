'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { Card } from '@quant/shared-ui';

export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  accent?: 'violet' | 'green' | 'amber' | 'blue';
  delay?: number;
}

const ACCENT: Record<NonNullable<StatTileProps['accent']>, string> = {
  violet: 'text-[var(--brand-app-color)]',
  green: 'text-green-500',
  amber: 'text-amber-500',
  blue: 'text-blue-500',
};

export function StatTile({ label, value, hint, accent = 'violet', delay = 0 }: StatTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle, delay }}
    >
      <Card>
        <div className="p-5">
          <p className="text-sm text-[var(--quant-muted-foreground)]">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${ACCENT[accent]}`}>{value}</p>
          {hint && <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">{hint}</p>}
        </div>
      </Card>
    </motion.div>
  );
}
