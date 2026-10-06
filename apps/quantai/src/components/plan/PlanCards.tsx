'use client';

// ============================================================================
// PlanCards — the two usage cards at the top of /plan (Muse S3 parity).
// Dark, iOS-style cards: plan name + % used + reset line + blue progress bar.
// ============================================================================

import React from 'react';
import { formatCompact, formatResetDate, type PlanSummaryData } from './types';

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full bg-[#0A84FF] transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}

export default function PlanCards({ plan }: { plan: PlanSummaryData }) {
  return (
    <section className="rounded-3xl bg-[#1C1C1E] p-5" aria-label="Plan usage">
      {/* Plan card */}
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-semibold text-white">{plan.plan.name}</h2>
        <span className="text-[15px] text-white/60">{plan.plan.percentUsed}% used</span>
      </div>
      <p className="mt-1 text-[14px] text-white/50">
        {plan.configured
          ? `Daily limit resets at midnight UTC (${formatResetDate(plan.plan.resetsAt)})`
          : 'Usage metering is not connected — showing plan defaults'}
      </p>
      <div className="mt-3">
        <ProgressBar percent={plan.plan.percentUsed} />
      </div>

      {/* Additional tokens card */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold text-white">Additional tokens</h2>
          <span className="text-[15px] text-white/60">
            {plan.tokens.percentUsed}% used ({formatCompact(plan.tokens.remaining)} tokens left)
          </span>
        </div>
        <p className="mt-1 text-[14px] text-white/50">Never expires</p>
        <div className="mt-3">
          <ProgressBar percent={plan.tokens.percentUsed} />
        </div>
      </div>

      <div className="my-5 h-px bg-white/10" />

      {/* Upgrade */}
      {plan.upgradeUrl ? (
        <a href={plan.upgradeUrl} className="text-[17px] font-medium text-[#0A84FF]">
          Upgrade
        </a>
      ) : (
        <span className="text-[17px] font-medium text-white/30" title="Upgrade checkout is not available yet">
          Upgrade <span className="text-[13px] text-white/30">(coming soon)</span>
        </span>
      )}
    </section>
  );
}
