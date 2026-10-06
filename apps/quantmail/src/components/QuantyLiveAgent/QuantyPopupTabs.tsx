'use client';

import { motion } from 'framer-motion';
import {
  ClockIcon,
  FingerprintIcon,
  ListIcon,
  MonitorIcon,
  ShieldIcon,
} from './QuantyPopupIcons';
import type { QuantyPopupTabId } from './types';

export interface QuantyPopupTabsProps {
  active: QuantyPopupTabId;
  onChange?: (tab: QuantyPopupTabId) => void;
  /** Badge counts, e.g. approvals pending. */
  badges?: Partial<Record<QuantyPopupTabId, number>>;
  className?: string;
}

const TABS: ReadonlyArray<{
  id: QuantyPopupTabId;
  label: string;
  Icon: (p: { width?: number; height?: number; className?: string }) => React.ReactNode;
}> = [
  { id: 'activity', label: 'Activity', Icon: ListIcon },
  { id: 'approvals', label: 'Approvals', Icon: ShieldIcon },
  { id: 'browser', label: 'Browser', Icon: MonitorIcon },
  { id: 'schedule', label: 'Schedule', Icon: ClockIcon },
  { id: 'identity', label: 'Identity', Icon: FingerprintIcon },
];

/**
 * The 5-tab pill bar. The active tab gets an animated sliding pill
 * (layoutId) so switching feels physical, not jumpy.
 */
export function QuantyPopupTabs({ active, onChange, badges, className = '' }: QuantyPopupTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Quanty sections"
      className={`mx-4 flex items-center gap-1 rounded-2xl border border-white/10 bg-black/40 p-1.5 ${className}`}
    >
      {TABS.map(({ id, label, Icon }) => {
        const isActive = id === active;
        const badge = badges?.[id] ?? 0;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            title={label}
            onClick={() => onChange?.(id)}
            className={`relative flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-amber-400 ${
              isActive ? 'text-amber-300' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {isActive && (
              <motion.span
                layoutId="quanty-tab-pill"
                aria-hidden="true"
                className="absolute inset-0 rounded-xl bg-amber-500/15 ring-1 ring-amber-400/30"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative">
              <Icon width={17} height={17} />
              {badge > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white"
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            <span className="relative leading-none">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
