'use client';

import { useMemo } from 'react';
import { ClockIcon } from '../QuantyPopupIcons';
import { formatClockTime, formatRelativeTime } from '../quantyTime';
import type { QuantyScheduledTask } from '../types';

export interface QuantyScheduleTabProps {
  tasks?: QuantyScheduledTask[];
  loading?: boolean;
  className?: string;
}

const KIND_LABEL: Record<QuantyScheduledTask['kind'], string> = {
  daily: 'Daily',
  interval: 'Interval',
  weekly: 'Weekly',
};

const KIND_ORDER: ReadonlyArray<QuantyScheduledTask['kind']> = ['daily', 'interval', 'weekly'];

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4" aria-label="Loading schedule">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-white/10" />
          <div className="flex-1">
            <div className="h-3.5 w-1/2 rounded bg-white/10" />
            <div className="mt-1.5 h-3 w-1/4 rounded bg-white/[0.07]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Schedule tab — the real cron registry, grouped Daily / Interval / Weekly.
 * Each row shows the cadence and the next run, so the user sees Quanty's
 * heartbeat instead of a black box.
 */
export function QuantyScheduleTab({ tasks = [], loading = false, className = '' }: QuantyScheduleTabProps) {
  const sections = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({
        kind,
        label: KIND_LABEL[kind],
        tasks: tasks.filter((t) => t.kind === kind),
      })).filter((s) => s.tasks.length > 0),
    [tasks],
  );

  if (loading) return <Skeleton />;

  if (sections.length === 0) {
    return (
      <div className={`flex flex-col items-center px-6 py-10 text-center ${className}`}>
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-zinc-500">
          <ClockIcon width={22} height={22} />
        </span>
        <p className="mt-3 text-sm font-semibold text-zinc-200">Koi schedule nahi</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500">
          Quanty ke recurring tasks yahan dikhenge — abhi agent core se koi schedule nahi aaya.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {sections.map((section) => (
        <section key={section.kind} aria-label={section.label}>
          <h3 className="px-5 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
            {section.label}
          </h3>
          <ul>
            {section.tasks.map((task) => (
              <li key={task.id}>
                <div className="flex items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400"
                  >
                    <ClockIcon width={16} height={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{task.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{task.scheduleText}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {task.nextRunAt ? (
                      <>
                        <p className="text-[11px] font-medium tabular-nums text-zinc-400">
                          {formatClockTime(task.nextRunAt)}
                        </p>
                        <p className="text-[10px] text-zinc-600">{formatRelativeTime(task.nextRunAt)}</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-zinc-600">—</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
