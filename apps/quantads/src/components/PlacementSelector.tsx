// ============================================================================
// QuantAds - PlacementSelector Component
// Select ad placements with spring stagger and 44px targets
// ============================================================================

'use client';

import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface PlacementSelectorProps {
  selected: string[];
  onChange?: (placements: string[]) => void;
}

const ECOSYSTEM_APPS = [
  {
    id: 'quantsync',
    name: 'QuantSync',
    icon: '\u{1F504}',
    placements: ['feed', 'sidebar', 'stories', 'banner'],
  },
  {
    id: 'quantchat',
    name: 'QuantChat',
    icon: '\u{1F4AC}',
    placements: ['stories', 'discover', 'banner'],
  },
  {
    id: 'quantube',
    name: 'QuantTube',
    icon: '\u{1F3AC}',
    placements: ['pre-roll', 'mid-roll', 'sidebar', 'banner'],
  },
  {
    id: 'quantneon',
    name: 'QuantNeon',
    icon: '\u{1F4F7}',
    placements: ['feed', 'stories', 'explore', 'banner'],
  },
  {
    id: 'quantmax',
    name: 'QuantMax',
    icon: '\u{25B6}',
    placements: ['feed', 'between-videos', 'banner'],
  },
  {
    id: 'quantmail',
    name: 'QuantMail',
    icon: '\u{2709}',
    placements: ['sidebar', 'banner', 'native'],
  },
  { id: 'quantedits', name: 'QuantEdits', icon: '\u{270F}', placements: ['sidebar', 'banner'] },
  { id: 'quantai', name: 'QuantAI', icon: '\u{1F9E0}', placements: ['sidebar', 'native'] },
];

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
};

export function PlacementSelector({ selected, onChange }: PlacementSelectorProps) {
  function togglePlacement(appId: string, placement: string): void {
    const key = `${appId}:${placement}`;
    const newSelected = selected.includes(key)
      ? selected.filter((s) => s !== key)
      : [...selected, key];
    onChange?.(newSelected);
  }

  return (
    <div
      className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-6 shadow-sm"
      role="group"
      aria-label="Ad placement selector"
    >
      <h3 className="mb-1 text-lg font-semibold text-[var(--quant-card-foreground)]">
        Select Placements
      </h3>
      <p className="mb-5 text-sm text-[var(--quant-muted-foreground)]">
        Choose where your ads will appear across the Quant ecosystem
      </p>

      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {ECOSYSTEM_APPS.map((app) => (
          <motion.div
            key={app.id}
            variants={staggerItem}
            className="rounded-lg border border-[var(--quant-border)] bg-[var(--quant-muted)] p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">
                {app.icon}
              </span>
              <span className="text-sm font-semibold text-[var(--quant-card-foreground)]">
                {app.name}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {app.placements.map((p) => {
                const key = `${app.id}:${p}`;
                const isSelected = selected.includes(key);
                return (
                  <label
                    key={key}
                    className={`inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors focus-within:ring-2 focus-within:ring-[var(--quant-ring)] ${
                      isSelected
                        ? 'border-[var(--brand-app-color)] bg-[var(--brand-app-color)]/10 text-[var(--brand-app-color)]'
                        : 'border-[var(--quant-border)] bg-[var(--quant-card)] text-[var(--quant-muted-foreground)] hover:border-[var(--brand-app-color)]/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePlacement(app.id, p)}
                      className="sr-only"
                      aria-label={`${app.name} ${p}`}
                    />
                    <span>{p}</span>
                  </label>
                );
              })}
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div
        className="mt-4 text-sm font-medium text-[var(--quant-muted-foreground)]"
        aria-live="polite"
      >
        {selected.length} placement{selected.length !== 1 ? 's' : ''} selected
      </div>
    </div>
  );
}

export default PlacementSelector;
