import type { BranchItem } from '../types';

/**
 * Map one raw backend branch row to the UI's BranchItem shape.
 *
 * Author/message honesty (same invented-data defect family as the Commits
 * tab's 'Sep 26, 2026' fallback, PR #926): the branches endpoint returns
 * only {name, sha, isDefault, isProtected, protection, aheadBy, behindBy} —
 * it carries NO per-branch last-commit author/message/time fields. When the
 * backend provides none we degrade to honest empty strings so the UI shows
 * 'Unknown' (BranchesTab's own fallback) and hides the message slot —
 * instead of inventing an author or a message.
 *
 * The previous mapping (`lastCommitAuthor: b.lastCommitAuthor ||
 * currentUsername` / `lastCommitMessage: b.lastCommitMessage || 'Update
 * branch'`) attributed EVERY branch's last commit to the VIEWER and printed
 * a fabricated commit message on every row, pre-empting BranchesTab's honest
 * 'Unknown' fallback.
 */
export function mapBackendBranchToItem(b: any, defaultBranch?: string): BranchItem {
  return {
    name: b.name,
    sha: b.sha || b.commitSha || '',
    isDefault: b.isDefault ?? (b.name === defaultBranch || b.name === 'main'),
    isProtected: b.isProtected ?? false,
    protection: b.protection ?? (b.isProtected ? 'require_reviews' : 'none'),
    aheadBy: b.aheadBy ?? 0,
    behindBy: b.behindBy ?? 0,
    // Never invent the last-commit author — empty lets BranchesTab render
    // its honest 'Unknown' fallback. Never pass the viewer's username here.
    lastCommitAuthor: b.lastCommitAuthor || '',
    // Never invent a commit message — empty hides the message slot.
    lastCommitMessage: b.lastCommitMessage || '',
    lastCommitTime: b.lastCommitTime || 'recently',
  };
}
