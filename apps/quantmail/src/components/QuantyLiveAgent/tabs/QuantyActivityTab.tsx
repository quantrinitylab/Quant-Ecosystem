'use client';

import { useMemo } from 'react';
import { CalendarIcon, CodeIcon, MailIcon, MonitorIcon, ChatIcon, ListIcon } from '../QuantyPopupIcons';
import { DAY_BUCKET_LABEL, dayBucket, formatClockTime } from '../quantyTime';
import type { QuantyActivityEntry } from '../types';

export interface QuantyActivityTabProps {
  entries?: QuantyActivityEntry[];
  loading?: boolean;
  className?: string;
}

const ENTRY_ICON: Record<NonNullable<QuantyActivityEntry['icon']>, (p: { width?: number; height?: number; className?: string }) => React.ReactNode> = {
  code: CodeIcon,
  mail: MailIcon,
  calendar: CalendarIcon,
  drive: ListIcon,
  browser: MonitorIcon,
  agent: ChatIcon,
  chat: ChatIcon,
};

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4" aria-label="Loading activity">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-white/10" />
          <div className="flex-1">
            <div className="h-3.5 w-2/3 rounded bg-white/10" />
            <div className="mt-1.5 h-3 w-1/2 rounded bg-white/[0.07]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Activity tab — the "Today" feed of what Quanty did, grouped into
 * Today / Yesterday / Older. Honest empty state when the agent core hasn't
 * reported anything yet.
 */
export function QuantyActivityTab({ entries = [], loading = false, className = '' }: QuantyActivityTabProps) {
  const groups = useMemo(() => {
    const sorted = [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const buckets: Record<'today' | 'yesterday' | 'older', QuantyActivityEntry[]> = {
      today: [],
      yesterday: [],
      older: [],
    };
    for (const e of sorted) buckets[dayBucket(e.timestamp)].push(e);
    return (['today', 'yesterday', 'older'] as const)
      .map((key) => ({ key, label: DAY_BUCKET_LABEL[key], entries: buckets[key] }))
      .filter((g) => g.entries.length > 0);
  }, [entries]);

  if (loading) return <Skeleton />;

  if (groups.length === 0) {
    return (
      <div className={`flex flex-col items-center px-6 py-10 text-center ${className}`}>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-zinc-500">
          <ListIcon width={22} height={22} />
        </span>
        <p className="mt-3 text-sm font-semibold text-zinc-200">Abhi kuch nahi hua</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Quanty jab kaam karega, har kadam yahan dikhega — abhi agent core se koi history nahi aayi.
        </p>
      </div>
    );
  }

  return (
    <div className={className} role="feed" aria-label="Quanty activity">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="px-5 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
            {group.label}
          </h3>
          <ul>
            {group.entries.map((entry) => {
              const Icon = ENTRY_ICON[entry.icon ?? 'agent'];
              return (
                <li key={entry.id}>
                  <div className="flex items-start gap-3 px-5 py-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-400"
                    >
                      <Icon width={16} height={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-zinc-100">{entry.title}</p>
                      {entry.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                          {entry.description}
                        </p>
                      )}
                    </div>
                    <time className="shrink-0 pt-0.5 text-[11px] tabular-nums text-zinc-600">
                      {formatClockTime(entry.timestamp)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
