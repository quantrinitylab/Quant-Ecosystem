'use client';

// ============================================================================
// QuantGit — Repository Insights (GitHub Insights parity)
//
// QM-UIUX-066 honesty contract: every number this tab shows is computed from
// real repository data supplied via props (the same commits / pull requests /
// workflow runs the page already fetched from the API for the other tabs).
// There are no hardcoded stats anywhere in this file — the previous version
// rendered an invented "48 Commits", "100% CI Health", "11 GitHub Actions
// workflows green" and a fake bar chart while taking zero props. A metric
// whose real data has not been supplied renders an explicit unknown state,
// and with no data at all the tab renders an honest empty state.
// ============================================================================

import React from 'react';
import type { CommitItem, PRItem, WorkflowRunItem } from '../types';

export interface InsightsTabProps {
  /** Real commits for the current repo/branch view. Defaults to none. */
  commits?: CommitItem[];
  /** Real pull requests for the current repo. Defaults to none. */
  pullRequests?: PRItem[];
  /** Real workflow runs for the current repo. Defaults to none. */
  workflowRuns?: WorkflowRunItem[];
}

export interface DailyCommitCount {
  /** Short real date label, e.g. "Oct 3". */
  label: string;
  count: number;
}

export interface RepoInsights {
  commitCount: number;
  openPullRequests: number;
  mergedPullRequests: number;
  closedPullRequests: number;
  /** Rounded success percentage over completed runs, or null when unknown. */
  ciHealthPercent: number | null;
  ciCompletedRuns: number;
  ciSuccessfulRuns: number;
  /** Distinct workflows actually seen in the supplied runs. */
  workflowCount: number;
  /** Commits per day for the 7 days ending today; empty when no commit in
   *  the supplied history carries a parseable date. */
  dailyCommits: DailyCommitCount[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Pure derivation of every insight from real supplied data. Exported for
 * direct unit testing, following the QM-UIUX-063 resolver pattern.
 */
export function computeRepoInsights(
  input: {
    commits?: CommitItem[];
    pullRequests?: PRItem[];
    workflowRuns?: WorkflowRunItem[];
  },
  now: Date = new Date(),
): RepoInsights {
  const commits = input.commits ?? [];
  const pullRequests = input.pullRequests ?? [];
  const workflowRuns = input.workflowRuns ?? [];

  // CI health: only runs that actually finished can say anything about
  // health. In-progress/queued runs are excluded, never assumed green.
  const completedRuns = workflowRuns.filter(
    (r) => r.status === 'success' || r.status === 'failed',
  );
  const successfulRuns = completedRuns.filter((r) => r.status === 'success');
  const ciHealthPercent =
    completedRuns.length > 0
      ? Math.round((successfulRuns.length / completedRuns.length) * 100)
      : null;
  const workflowCount = new Set(
    workflowRuns.map((r) => r.workflow || r.name).filter(Boolean),
  ).size;

  // Commit activity: bucket the supplied commits into the last 7 calendar
  // days using their real dates. Commits whose date string cannot be parsed
  // are skipped — they are never placed on an invented day.
  const todayStart = startOfDay(now);
  const buckets: DailyCommitCount[] = [];
  const bucketIndexByDay = new Map<number, number>();
  for (let i = 6; i >= 0; i--) {
    const day = new Date(todayStart - i * DAY_MS);
    bucketIndexByDay.set(day.getTime(), buckets.length);
    buckets.push({
      label: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: 0,
    });
  }
  let anyParseableDate = false;
  for (const commit of commits) {
    const parsed = new Date(commit.date);
    if (Number.isNaN(parsed.getTime())) continue;
    anyParseableDate = true;
    const idx = bucketIndexByDay.get(startOfDay(parsed));
    if (idx !== undefined) buckets[idx].count += 1;
  }

  return {
    commitCount: commits.length,
    openPullRequests: pullRequests.filter((p) => p.state === 'open').length,
    mergedPullRequests: pullRequests.filter((p) => p.state === 'merged').length,
    closedPullRequests: pullRequests.filter((p) => p.state === 'closed').length,
    ciHealthPercent,
    ciCompletedRuns: completedRuns.length,
    ciSuccessfulRuns: successfulRuns.length,
    workflowCount,
    dailyCommits: anyParseableDate ? buckets : [],
  };
}

const cardClass =
  'p-4 rounded bg-[var(--quant-surface-elevated)] border border-[#30363D]';
const captionClass = 'text-[#7D8590] text-[11px]';

export function InsightsTab({
  commits = [],
  pullRequests = [],
  workflowRuns = [],
}: InsightsTabProps) {
  const insights = computeRepoInsights({ commits, pullRequests, workflowRuns });
  const hasAnyData = commits.length > 0 || pullRequests.length > 0 || workflowRuns.length > 0;

  if (!hasAnyData) {
    return (
      <div className="py-16 text-center space-y-4 rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] p-8 text-xs">
        <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 mx-auto flex items-center justify-center text-3xl">
          📊
        </div>
        <div>
          <h4 className="font-bold text-sm text-white">No insights available</h4>
          <p className="text-xs text-[#7D8590] pt-1">
            There is no repository activity data to summarize yet.
          </p>
        </div>
      </div>
    );
  }

  const maxDaily = Math.max(0, ...insights.dailyCommits.map((d) => d.count));

  return (
    <div className="space-y-6 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={cardClass}>
          {commits.length > 0 ? (
            <>
              <h4 className="font-bold text-white text-sm">
                {insights.commitCount} {insights.commitCount === 1 ? 'Commit' : 'Commits'}
              </h4>
              <p className={captionClass}>In the loaded commit history for this branch</p>
            </>
          ) : (
            <>
              <h4 className="font-bold text-white text-sm">Commits</h4>
              <p className={captionClass}>No commit data available yet.</p>
            </>
          )}
        </div>
        <div className={cardClass}>
          {pullRequests.length > 0 ? (
            <>
              <h4 className="font-bold text-white text-sm">
                {insights.mergedPullRequests}{' '}
                {insights.mergedPullRequests === 1
                  ? 'Pull Request Merged'
                  : 'Pull Requests Merged'}
              </h4>
              <p className={captionClass}>
                {insights.openPullRequests} open · {insights.closedPullRequests} closed without
                merging
              </p>
            </>
          ) : (
            <>
              <h4 className="font-bold text-white text-sm">Pull Requests</h4>
              <p className={captionClass}>No pull request data available yet.</p>
            </>
          )}
        </div>
        <div className={cardClass}>
          {insights.ciHealthPercent !== null ? (
            <>
              <h4 className="font-bold text-white text-sm">{insights.ciHealthPercent}% CI Health</h4>
              <p className={captionClass}>
                {insights.ciSuccessfulRuns} of {insights.ciCompletedRuns} recent workflow runs
                succeeded · {insights.workflowCount}{' '}
                {insights.workflowCount === 1 ? 'workflow' : 'workflows'} seen
              </p>
            </>
          ) : (
            <>
              <h4 className="font-bold text-white text-sm">CI Health</h4>
              <p className={captionClass}>
                No completed workflow runs yet — CI health is unknown.
              </p>
            </>
          )}
        </div>
      </div>

      {commits.length > 0 && (
        <div className="p-4 rounded bg-[var(--quant-surface-elevated)] border border-[#30363D] space-y-3">
          <h4 className="font-bold text-white">Commit Frequency & Activity</h4>
          {insights.dailyCommits.length > 0 ? (
            <>
              <div className="h-32 flex items-end gap-2 border-b border-[#30363D] pb-2">
                {insights.dailyCommits.map((day) => (
                  <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-[#7D8590]">{day.count}</span>
                    <div
                      className="w-full rounded-t bg-[#3FB950] hover:bg-[#2EA043] transition-all"
                      style={{
                        height: `${maxDaily > 0 ? Math.max(4, Math.round((day.count / maxDaily) * 96)) : 0}px`,
                      }}
                    />
                    <span className="text-[10px] text-[#7D8590]">{day.label}</span>
                  </div>
                ))}
              </div>
              <p className={captionClass}>
                Commits per day over the last 7 days, from the loaded commit history.
              </p>
            </>
          ) : (
            <p className={captionClass}>
              Commit dates are unavailable, so daily activity can&apos;t be charted.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
