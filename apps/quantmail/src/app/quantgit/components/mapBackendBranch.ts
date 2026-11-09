import type { BranchItem } from '../types';
import { formatCommitRelativeTime } from './mapBackendCommit';

/**
 * Map one raw backend branch row to the UI's BranchItem shape.
 *
 * Author/message honesty (same invented-data defect family as the Commits
 * tab's 'Sep 26, 2026' fallback, PR #926): the branches endpoints carry no
 * invented per-branch data. When the backend provides no last-commit
 * author/message we degrade to honest empty strings so the UI shows
 * 'Unknown' (BranchesTab's own fallback) and hides the message slot —
 * instead of inventing an author or a message.
 *
 * Recency honesty: the OLD `lastCommitTime: b.lastCommitTime || 'recently'`
 * fallback fired on EVERY real backend row (neither branches endpoint sent
 * `lastCommitTime`), so every branch rendered the fabricated "Updated
 * recently by". We now compute real relative time ONLY from the backend's
 * numeric `lastCommitTimestamp` (Unix seconds, git `%at` of the branch head,
 * attached by the enriched branches endpoints) via `formatCommitRelativeTime`
 * — the same helper that fixed the Commits tab's "committed recently" defect
 * — and degrade to an honest empty string otherwise. BranchesTab renders its
 * "last update unavailable" slot for those rows. Never a false recency claim.
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
    // Ahead/behind honesty: the branches endpoints do NOT compute these
    // counts, so a missing field means "not computed" and must stay
    // undefined — the old `?? 0` turned every backend row into a fake
    // measured "behind 0 / ahead 0" badge. Only a real finite number passes
    // through; anything else (missing, string, NaN) degrades to undefined
    // so BranchesTab renders its honest "not computed" slot.
    aheadBy: typeof b.aheadBy === 'number' && Number.isFinite(b.aheadBy) ? b.aheadBy : undefined,
    behindBy: typeof b.behindBy === 'number' && Number.isFinite(b.behindBy) ? b.behindBy : undefined,
    // Never invent the last-commit author — empty lets BranchesTab render
    // its honest 'Unknown' fallback. Never pass the viewer's username here.
    lastCommitAuthor: b.lastCommitAuthor || '',
    // Never invent a commit message — empty hides the message slot.
    lastCommitMessage: b.lastCommitMessage || '',
    // Never claim recency the backend did not assert: real relative time
    // from the numeric `lastCommitTimestamp` (Unix seconds, branch-head
    // `%at`), honest empty string when unavailable. The old `|| 'recently'`
    // fallback fabricated "Updated recently by" on EVERY branch row.
    lastCommitTime: b.lastCommitTime || formatCommitRelativeTime(b.lastCommitTimestamp),
  };
}
