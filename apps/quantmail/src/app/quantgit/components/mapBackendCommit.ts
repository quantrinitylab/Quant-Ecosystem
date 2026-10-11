import type { CommitItem } from '../types';

/**
 * Map one raw backend commit row to the UI's CommitItem shape.
 *
 * Date honesty (same defect family as the RepoActivityFeed "NaNd" guard,
 * PR #896): the commits endpoint returns a numeric `timestamp`, not a
 * formatted `date` string — so `date` is absent on real backend data. When
 * the backend provides no date string we degrade to an honest empty string
 * rather than inventing a specific historical date. (The previous fallback,
 * 'Sep 26, 2026', made every real commit render under a "Commits on Sep 26,
 * 2026" group header and bucketed real commits onto an invented day in the
 * Insights activity chart, and the fixed date never aged.)
 *
 * Downstream: CommitsTab groups undated commits under "Undated commits"
 * and InsightsTab skips unparseable dates instead of placing them on an
 * invented day. `relativeTime` already degrades honestly to 'recently'.
 */
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
    relativeTime: c.relativeTime || c.timeAgo || 'recently',
    // Never claim GPG verification the backend did not assert.
    verified: c.verified ?? false,
    verificationReason: c.verificationReason,
    // Never invent diff stats — only real backend stats, otherwise undefined.
    stats: c.stats,
    files: c.files,
  };
}
