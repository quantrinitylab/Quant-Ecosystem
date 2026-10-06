'use client';

import { CloudIcon, EditIcon, HeartIcon } from '../QuantyPopupIcons';
import { formatRelativeTime } from '../quantyTime';
import type { QuantyIdentityData } from '../types';

export interface QuantyIdentityTabProps {
  identity?: QuantyIdentityData | null;
  loading?: boolean;
  onEdit?: (kind: 'soul' | 'memory') => void;
  className?: string;
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 px-5 py-4" aria-label="Loading identity">
      {[0, 1].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl bg-white/[0.07]" />
      ))}
    </div>
  );
}

/**
 * Identity tab — the SOUL and MEMORY cards side by side, Muse-style.
 * "ACCESS WITH CARE" is literal: these files shape how Quanty behaves, so
 * the edit affordance is deliberate, not hidden.
 */
export function QuantyIdentityTab({ identity, loading = false, onEdit, className = '' }: QuantyIdentityTabProps) {
  if (loading) return <Skeleton />;

  const cards = [
    {
      kind: 'soul' as const,
      title: 'SOUL',
      updatedAt: identity?.soul.updatedAt,
      Icon: HeartIcon,
      tint: 'text-rose-400',
      chipBg: 'bg-rose-500/10',
    },
    {
      kind: 'memory' as const,
      title: 'MEMORY',
      updatedAt: identity?.memory.updatedAt,
      Icon: CloudIcon,
      tint: 'text-sky-400',
      chipBg: 'bg-sky-500/10',
    },
  ];

  return (
    <div className={`px-5 py-4 ${className}`}>
      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ kind, title, updatedAt, Icon, tint, chipBg }) => (
          <div
            key={kind}
            className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${chipBg} ${tint}`}>
              <Icon width={20} height={20} />
            </span>
            <p className="mt-3 text-sm font-bold tracking-wide text-zinc-100">{title}</p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Access with care
            </p>
            <p className="mt-1 text-[11px] text-zinc-600">
              {updatedAt ? formatRelativeTime(updatedAt) : '—'}
            </p>
            <button
              type="button"
              onClick={() => onEdit?.(kind)}
              className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/[0.06] text-xs font-semibold text-zinc-200 transition hover:bg-white/[0.1] active:scale-[0.98]"
            >
              <EditIcon width={13} height={13} />
              Edit
            </button>
          </div>
        ))}
      </div>
      <p className="mt-3 px-1 text-center text-[11px] leading-relaxed text-zinc-600">
        SOUL Quanty ka character hai, MEMORY uski yaadein — dono badalne se uska bartav badlega.
      </p>
    </div>
  );
}
