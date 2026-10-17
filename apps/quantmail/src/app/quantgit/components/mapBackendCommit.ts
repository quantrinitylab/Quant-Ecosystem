import type { CommitItem } from '../types';

/**
 * Map one raw backend commit row to the UI's CommitItem shape.
 *
 * Date honesty (same defect family as the RepoActivityFeed "NaNd" guard,
 * PR #896): the commits endpoint returns a numeric `timestamp` (Unix
 * seconds, git-inspect.service.ts getCommits), not a formatted `date`
 * string — so `date` is absent on real backend data. When the backend
 * provides no date string we degrade to an honest empty string rather than
 * inventing a specific historical date. (The previous fallback,
 * 'Sep 26, 2026', made every real commit render under a "Commits on Sep 26,
 * 2026" group header and bucketed real commits onto an invented day in the
 * Insights activity chart, and the fixed date never aged.)
 *
 * Relative-time honesty (fix for "committed recently" on every row): the
 * old mapper fell back to a hardcoded 'recently' whenever the backend gave
 * no `relativeTime`/`timeAgo` string — and the real endpoint never sends
 * either — so commits from years ago all rendered "committed recently".
 * We now compute the real relative time from the backend's numeric
 * `timestamp`. When there is no usable timestamp we degrade to an honest
 * empty string (never a false recency claim) and CommitsTab hides the
 * time slot.
 *
 * Downstream: CommitsTab groups undated commits under "Undated commits"
 * and InsightsTab skips unparseable dates instead of placing them on an
 * invented day.
 */

/**
 * Format a commit timestamp (Unix seconds, as returned by the commits
 * endpoint) as a relative time like "3 months ago". Accepts a number or a
 * numeric string. Returns '' when the timestamp is missing, invalid, or
 * implausibly in the future — never invents a recency claim.
 */
export function formatCommitRelativeTime(timestamp: unknown): string {
  const secs = typeof timestamp === 'number' ? timestamp : Number(timestamp);
  if (!Number.isFinite(secs) || secs <= 0) return '';
  const diffMs = Date.now() - secs * 1000;
  // A future-dated commit is data corruption, not recency: honest empty.
  if (diffMs < 0) return '';
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30.44 * dayMs;
  const yearMs = 365.25 * dayMs;
  const ago = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (diffMs < 45_000) return 'just now';
  if (diffMs < hourMs) return ago(Math.max(1, Math.round(diffMs / minuteMs)), 'minute');
  if (diffMs < dayMs) return ago(Math.round(diffMs / hourMs), 'hour');
  if (diffMs < 30 * dayMs) return ago(Math.round(diffMs / dayMs), 'day');
  if (diffMs < yearMs) return ago(Math.round(diffMs / monthMs), 'month');
  return ago(Math.round(diffMs / yearMs), 'year');
}
export function mapBackendCommitToItem(c: any, currentUsername: string): CommitItem {
  return {
    sha: c.sha || c.commitSha || '',
    shortSha: (c.sha || c.commitSha || '').slice(0, 7),
    message: c.message || 'Commit update',
    body: c.body || '',
    author: {
      name: c.author?.name || c.author || currentUsername,
      username: c.author?.username || c.author || currentUsername,
      email: c.author?.email || `${currentUsername}@quantmail.in`,
      avatarUrl: c.author?.avatarUrl || '',
    },
    // Never invent a specific date the backend did not provide.
    date: c.date || '',
    // Never claim recency the backend did not assert: real relative time
    // from the numeric `timestamp`, honest empty string when unavailable.
    relativeTime: c.relativeTime || c.timeAgo || formatCommitRelativeTime(c.timestamp),
    // Never claim GPG verification the backend did not assert.
    verified: c.verified ?? false,
    verificationReason: c.verificationReason,
    // Never invent diff stats — only real backend stats, otherwise undefined.
    stats: c.stats,
    files: c.files,
  };
}
