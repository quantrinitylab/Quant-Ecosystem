'use client';

import { ShieldIcon } from '../QuantyPopupIcons';
import { formatRelativeTime } from '../quantyTime';
import type { QuantyApproval } from '../types';

export interface QuantyApprovalsTabProps {
  approvals?: QuantyApproval[];
  loading?: boolean;
  className?: string;
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4" aria-label="Loading approvals">
      {[0, 1].map((i) => (
        <div key={i} className="flex animate-pulse items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-white/10" />
          <div className="flex-1">
            <div className="h-3.5 w-3/4 rounded bg-white/10" />
            <div className="mt-1.5 h-3 w-1/3 rounded bg-white/[0.07]" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Approvals tab — the permission grant log. Every row is something the user
 * allowed Quanty to do, with scope and recency, so trust is auditable.
 */
export function QuantyApprovalsTab({ approvals = [], loading = false, className = '' }: QuantyApprovalsTabProps) {
  if (loading) return <Skeleton />;

  return (
    <div className={className}>
      <h3 className="px-5 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-zinc-500">
        Approvals history
      </h3>
      {approvals.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.06] text-zinc-500">
            <ShieldIcon width={22} height={22} />
          </span>
          <p className="mt-3 text-sm font-semibold text-zinc-200">Koi approval nahi</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            Jab tum Quanty ko koi permission doge, woh yahan dikhegi.
          </p>
        </div>
      ) : (
        <ul>
          {[...approvals]
            .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))
            .map((approval) => (
              <li key={approval.id}>
                <div className="flex items-start gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400"
                  >
                    <ShieldIcon width={16} height={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-snug text-zinc-100">{approval.title}</p>
                    {approval.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                        {approval.description}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-zinc-600">
                      {approval.scope} · {formatRelativeTime(approval.grantedAt)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
