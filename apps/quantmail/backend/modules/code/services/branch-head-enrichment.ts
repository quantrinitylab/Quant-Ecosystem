import type { GitInspectService } from './git-transport/git-inspect.service';

/**
 * Real per-branch head-commit enrichment for the branches list endpoints.
 *
 * Defect family: the branches endpoints used to return raw Branch rows
 * (name/sha/isDefault/isProtected — no last-commit fields), so the frontend
 * mapper's `lastCommitTime: b.lastCommitTime || 'recently'` fallback ALWAYS
 * fired and every branch row rendered the fabricated "Updated recently by".
 * The endpoints now attach REAL head-commit data resolved from git —
 * `git log -1 <branch>` per row, run in parallel — and the frontend computes
 * relative time only from the returned numeric timestamp.
 *
 * Honesty contract: a branch whose ref cannot be resolved (stale DB row,
 * missing git storage, unreadable repo) gets NO enrichment fields at all —
 * never an invented timestamp/author. The frontend degrades those rows to
 * its honest "last update unavailable" slot.
 */
export type BranchHeadEnrichment = {
  /** Head commit author date, Unix seconds (git `%at`), when resolvable. */
  lastCommitTimestamp?: number;
  /** Head commit author name, when resolvable. */
  lastCommitAuthor?: string;
  /** Head commit message, when resolvable. */
  lastCommitMessage?: string;
};

type GitInspectLike = Pick<GitInspectService, 'getCommits'>;

export async function enrichBranchesWithHeadCommits<T extends { name: string }>(
  rows: T[],
  gitInspect: GitInspectLike,
  owner: string,
  repoName: string,
): Promise<Array<T & BranchHeadEnrichment>> {
  return Promise.all(
    rows.map(async (row) => {
      try {
        const commits = await gitInspect.getCommits(owner, repoName, row.name, { limit: 1 });
        const head = commits?.[0];
        if (!head) return { ...row };
        const enriched: T & BranchHeadEnrichment = { ...row };
        // A corrupt/non-positive timestamp is data corruption, not recency:
        // omit it and let the frontend degrade honestly.
        if (typeof head.timestamp === 'number' && Number.isFinite(head.timestamp) && head.timestamp > 0) {
          enriched.lastCommitTimestamp = head.timestamp;
        }
        if (head.author?.name) enriched.lastCommitAuthor = head.author.name;
        if (head.message) enriched.lastCommitMessage = head.message;
        return enriched;
      } catch {
        // Stale branch row / unreadable git storage: degrade honestly,
        // never invent head-commit data.
        return { ...row };
      }
    }),
  );
}
