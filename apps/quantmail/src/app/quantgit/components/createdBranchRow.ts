import type { BranchItem } from '../types';

/**
 * Build the optimistic row appended locally right after the backend
 * confirms a branch creation — shared by page.tsx's handleCreateBranch and
 * BranchesTab's local list so both render the SAME honest row.
 *
 * A new branch points at its SOURCE branch's head commit, so the new
 * branch's last commit IS the source head's commit: same sha, same author,
 * same message, same time. It is never a commit by the branch creator.
 *
 * The backend create response carries the real head sha but NO
 * author/message/time, so when the source head is not known locally those
 * fields degrade to honest empty strings — BranchesTab renders those as
 * "Last update unavailable · Unknown" — instead of inventing an author
 * (the viewer's username), a message ("Branch created from X"), a recency
 * claim ("just now"), or a pseudo-sha ("pending"). The next refetch
 * replaces this row with backend-mapped data.
 *
 * This helper deliberately takes NO username: there is no input from which
 * a creator identity could leak into the row.
 */
export function buildCreatedBranchRow(
  name: string,
  sourceHead: BranchItem | undefined,
  backendSha?: string,
): BranchItem {
  return {
    name,
    // The source head's sha when known, else the backend-confirmed head
    // sha (the create response's data.sha IS the source head sha). Never
    // the pseudo-sha 'pending'.
    sha: sourceHead?.sha || backendSha || '',
    isDefault: false,
    isProtected: false,
    protection: 'none',
    // The new branch IS the source head, so its ahead/behind position
    // against the default branch is the source head's — never an invented
    // 0/0 when the source is known (the backend currently sends 0/0 for
    // every branch, so this copies 0/0 in practice today).
    aheadBy: sourceHead?.aheadBy ?? 0,
    behindBy: sourceHead?.behindBy ?? 0,
    // Never the creator's username: the source head's author, or honest
    // empty (rendered as 'Unknown') when the source head is unknown.
    lastCommitAuthor: sourceHead?.lastCommitAuthor || '',
    // Never an invented "Branch created from X" message: the source
    // head's real message, or honest empty (message slot hidden).
    lastCommitMessage: sourceHead?.lastCommitMessage || '',
    // Never a fabricated 'just now': the source head's real time, or
    // honest empty (rendered as "Last update unavailable").
    lastCommitTime: sourceHead?.lastCommitTime || '',
  };
}
