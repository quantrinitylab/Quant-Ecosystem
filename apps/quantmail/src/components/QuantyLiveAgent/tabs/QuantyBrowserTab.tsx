'use client';

import { MonitorIcon } from '../QuantyPopupIcons';
import { formatRelativeTime } from '../quantyTime';
import type { QuantyBrowserTask } from '../types';

export interface QuantyBrowserTabProps {
  tasks?: QuantyBrowserTask[];
  loading?: boolean;
  className?: string;
}

const STATUS_DOT: Record<QuantyBrowserTask['status'], string> = {
  running: 'bg-sky-400 animate-pulse',
  done: 'bg-emerald-400',
  failed: 'bg-red-500',
};

const STATUS_LABEL: Record<QuantyBrowserTask['status'], string> = {
  running: 'chal raha hai',
  done: 'poora hua',
  failed: 'fail hua',
};

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4" aria-label="Loading browser tasks">
      {[0, 1].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3">
          <div className="h-14 w-20 shrink-0 rounded-xl bg-white/10" />
          <div className="flex-1">
            <div className="h-3.5 w-2/3 rounded bg-white/10" />
            <div className="mt-1.5 h-3 w-1/3 rounded bg-white/[0.07]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Browser tab — the live browser task list with thumbnails, Muse-style.
 */
export function QuantyBrowserTab({ tasks = [], loading = false, className = '' }: QuantyBrowserTabProps) {
  if (loading) return <Skeleton />;

  return (
    <div className={className}>
      <h3 className="px-5 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
        {tasks.length > 0 ? `${tasks.length} browser task${tasks.length === 1 ? '' : 's'}` : 'Browser tasks'}
      </h3>
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-zinc-500">
            <MonitorIcon width={22} height={22} />
          </span>
          <p className="mt-3 text-sm font-semibold text-zinc-200">Koi browser task nahi</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Quanty jab browser me kaam karega, har task yahan thumbnail ke saath dikhega.
          </p>
        </div>
      ) : (
        <ul>
          {[...tasks]
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .map((task) => (
              <li key={task.id}>
                <div
                  className="flex items-center gap-3 px-5 py-3"
                  aria-label={`${task.title} — ${STATUS_LABEL[task.status]}`}
                >
                  {task.thumbnailUrl ? (
                    <img
                      src={task.thumbnailUrl}
                      alt=""
                      className="h-14 w-20 shrink-0 rounded-xl border border-white/10 object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-14 w-20 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-zinc-800 to-zinc-900 text-zinc-600"
                    >
                      <MonitorIcon width={22} height={22} />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium leading-snug text-zinc-100">
                      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[task.status]}`} />
                      <span className="truncate">{task.title}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{task.url}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-600">{formatRelativeTime(task.startedAt)}</p>
                  </div>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
