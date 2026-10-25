// ============================================================================
// QuantGit — Notifications inbox data source.
//
// Finding (2026-10-11, P2): the NotificationsInbox component had NO data
// source at all — both mount sites rendered it prop-less, and no backend
// code ever produced a git notification, so a user requested to review a PR
// had no inbox surface that would ever list it.
//
// This module is that data source. It derives inbox items ONLY from durable
// domain rows that already exist — it never invents rows:
//
//   review_requested  PENDING Review rows (created by requestReview below,
//                     the producer this inbox was missing) on OPEN PRs.
//   assigned          OPEN Issues whose `assignees` JSON array names the
//                     user (by id or by username — the issue API stores
//                     whatever string the client sent).
//   participating     OPEN Issues/PRs the user commented on or reviewed
//                     (somebody else's thread — own threads are not news).
//   mentioned         OPEN Issues/PRs/comments whose body contains
//                     `@<username>` and whose author is not the user.
//
// Visibility mirrors loadReadableRepo in routes/repos.ts: a repo is
// readable when the user owns it, collaborates on it, or it is PUBLIC /
// INTERNAL. Private repos the user cannot see never leak into the inbox
// (a 404-style invisibility, not a 403 that confirms the repo exists).
//
// Read state honesty: derived items carry `unread: true` because no
// server-side read store exists for derived git notifications yet — the
// inbox's mark-read/saved/done toggles are local to the browser session
// until a triage store is added. The inbox must never claim a persisted
// read state it does not have (see NotificationsInbox.tsx).
//
// Scan caps: the assigned/mentioned scans read at most 500 of the most
// recent OPEN issues / PRs. This is a small self-hosted forge, not
// github.com scale, but an unbounded scan would still be a DoS-shaped
// query — the cap is documented, not hidden.
// ============================================================================

export type GitNotificationCategory =
  | 'assigned'
  | 'participating'
  | 'mentioned'
  | 'review_requested';

export interface GitNotification {
  id: string;
  repo: string;
  repoId: string;
  number: number;
  type: 'pr' | 'issue';
  status: 'open' | 'merged' | 'closed';
  title: string;
  author: string;
  commentSnippet?: string;
  createdAt: string;
  unread: boolean;
  category: GitNotificationCategory;
}

export interface GitNotificationUser {
  id: string;
  username: string;
  displayName?: string | null;
}

interface RepositoryRow {
  id: string;
  name: string;
  ownerId: string;
  visibility: string;
  deletedAt?: Date | string | null;
  owner?: { username?: string | null; displayName?: string | null } | null;
}

interface PullRequestRow {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body?: string | null;
  status: string;
  authorId: string;
  createdAt: Date | string;
  repository?: RepositoryRow | null;
  author?: { username?: string | null; displayName?: string | null } | null;
}

interface IssueRow {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body?: string | null;
  status: string;
  authorId: string;
  assignees?: unknown;
  createdAt: Date | string;
  repository?: RepositoryRow | null;
  author?: { username?: string | null; displayName?: string | null } | null;
}

const SCAN_CAP = 500;
const COMMENT_SCAN_CAP = 200;
const SNIPPET_MAX = 120;

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function snippet(text: string | null | undefined): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > SNIPPET_MAX ? `${clean.slice(0, SNIPPET_MAX - 1)}…` : clean;
}

function displayName(
  person: { username?: string | null; displayName?: string | null } | null | undefined,
  fallback: string,
): string {
  return person?.displayName || person?.username || fallback;
}

function repoDisplay(repo: RepositoryRow | null | undefined, fallbackName: string): string {
  const owner = repo?.owner?.username || repo?.owner?.displayName;
  const name = repo?.name || fallbackName;
  return owner ? `${owner} / ${name}` : name;
}

function mapPrStatus(status: string): 'open' | 'merged' | 'closed' {
  if (status === 'MERGED') return 'merged';
  if (status === 'CLOSED') return 'closed';
  return 'open';
}

function mapIssueStatus(status: string): 'open' | 'closed' {
  return status === 'CLOSED' ? 'closed' : 'open';
}

function mentionsUser(body: string | null | undefined, username: string): boolean {
  if (!body || !username) return false;
  // Word-boundary match: "@octocat" must not match "@octocat2".
  return new RegExp(`@${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`).test(body);
}

function assigneeNames(assignees: unknown): string[] {
  return Array.isArray(assignees) ? assignees.filter((a): a is string => typeof a === 'string') : [];
}

type AnyPrisma = Record<string, any>;

/** Repos the user may read, from the collaborator table when it exists. */
async function collaboratorRepoIds(prisma: AnyPrisma, userId: string): Promise<Set<string>> {
  try {
    const rows = await prisma.repositoryCollaborator?.findMany({
      where: { userId },
      select: { repoId: true },
    });
    if (Array.isArray(rows)) return new Set(rows.map((r: { repoId: string }) => r.repoId));
  } catch {
    // Generated client predates the collaborators table — owner/public only.
  }
  return new Set();
}

function isReadable(
  repo: RepositoryRow | null | undefined,
  userId: string,
  collaboratorRepoIds: Set<string>,
): repo is RepositoryRow {
  if (!repo || repo.deletedAt) return false;
  if (repo.ownerId === userId) return true;
  if (collaboratorRepoIds.has(repo.id)) return true;
  return ['PUBLIC', 'INTERNAL'].includes(String(repo.visibility).toUpperCase());
}

const CATEGORY_PRIORITY: Record<GitNotificationCategory, number> = {
  review_requested: 0,
  assigned: 1,
  mentioned: 2,
  participating: 3,
};

export async function listGitNotifications(
  prisma: AnyPrisma,
  user: GitNotificationUser,
  opts: { category?: GitNotificationCategory | 'all'; limit?: number } = {},
): Promise<{ notifications: GitNotification[]; unreadCount: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const wanted = opts.category && opts.category !== 'all' ? opts.category : null;
  const collaboratorIds = await collaboratorRepoIds(prisma, user.id);

  const byKey = new Map<string, GitNotification>();
  const put = (item: GitNotification) => {
    const key = `${item.type}:${item.repoId}:${item.number}`;
    const existing = byKey.get(key);
    // One row per thread: the highest-priority category wins (a review
    // request must not be demoted to "participating" by an old comment).
    if (!existing || CATEGORY_PRIORITY[item.category] < CATEGORY_PRIORITY[existing.category]) {
      byKey.set(key, item);
    }
  };

  // --- review_requested: PENDING reviews on OPEN PRs -----------------------
  if (!wanted || wanted === 'review_requested') {
    let pending: any[] = [];
    try {
      pending = (await prisma.review?.findMany({
        where: { reviewerId: user.id, status: 'PENDING' },
        include: {
          pullRequest: {
            select: {
              id: true,
              repoId: true,
              number: true,
              title: true,
              body: true,
              status: true,
              authorId: true,
              createdAt: true,
              repository: {
                select: {
                  id: true,
                  name: true,
                  ownerId: true,
                  visibility: true,
                  deletedAt: true,
                  owner: { select: { username: true, displayName: true } },
                },
              },
              author: { select: { username: true, displayName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })) ?? [];
    } catch {
      pending = [];
    }
    for (const review of pending) {
      const pr = review?.pullRequest as PullRequestRow | undefined;
      if (!pr || pr.status !== 'OPEN') continue;
      if (!isReadable(pr.repository, user.id, collaboratorIds)) continue;
      put({
        id: `review:${review.id}`,
        repo: repoDisplay(pr.repository, pr.repoId),
        repoId: pr.repoId,
        number: pr.number,
        type: 'pr',
        status: mapPrStatus(pr.status),
        title: pr.title,
        author: displayName(pr.author, 'user'),
        commentSnippet: snippet(pr.body),
        createdAt: toIso(review.createdAt ?? pr.createdAt),
        unread: true,
        category: 'review_requested',
      });
    }
  }

  // --- assigned / mentioned from OPEN issues (one bounded scan) ------------
  if (!wanted || wanted === 'assigned' || wanted === 'mentioned') {
    let issues: IssueRow[] = [];
    try {
      issues = (await prisma.issue?.findMany({
        where: { status: 'OPEN' },
        include: {
          repository: {
            select: {
              id: true,
              name: true,
              ownerId: true,
              visibility: true,
              deletedAt: true,
              owner: { select: { username: true, displayName: true } },
            },
          },
          author: { select: { username: true, displayName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: SCAN_CAP,
      })) ?? [];
    } catch {
      issues = [];
    }
    for (const issue of issues) {
      if (!isReadable(issue.repository, user.id, collaboratorIds)) continue;
      const base = {
        repo: repoDisplay(issue.repository, issue.repoId),
        repoId: issue.repoId,
        number: issue.number,
        type: 'issue' as const,
        status: mapIssueStatus(issue.status),
        title: issue.title,
        author: displayName(issue.author, 'user'),
        createdAt: toIso(issue.createdAt),
        unread: true,
      };
      if ((!wanted || wanted === 'assigned') && issue.authorId !== user.id) {
        const assignees = assigneeNames(issue.assignees);
        if (assignees.includes(user.id) || assignees.includes(user.username)) {
          put({ id: `issue:${issue.id}`, ...base, category: 'assigned' });
        }
      }
      if ((!wanted || wanted === 'mentioned') && issue.authorId !== user.id) {
        if (mentionsUser(issue.body, user.username)) {
          put({
            id: `issue-mention:${issue.id}`,
            ...base,
            commentSnippet: snippet(issue.body),
            category: 'mentioned',
          });
        }
      }
    }
  }

  // --- mentioned in comments (String `contains` is a real DB filter) --------
  if (!wanted || wanted === 'mentioned') {
    const mention = `@${user.username}`;
    const commentSources: Array<{
      model: string;
      parent: 'issue' | 'pr';
    }> = [
      { model: 'issueComment', parent: 'issue' },
      { model: 'reviewComment', parent: 'pr' },
    ];
    for (const { model, parent } of commentSources) {
      let comments: any[] = [];
      try {
        comments = (await prisma[model]?.findMany({
          where: { body: { contains: mention } },
          include:
            parent === 'issue'
              ? {
                  issue: {
                    select: {
                      id: true,
                      repoId: true,
                      number: true,
                      title: true,
                      status: true,
                      authorId: true,
                      createdAt: true,
                      repository: {
                        select: {
                          id: true,
                          name: true,
                          ownerId: true,
                          visibility: true,
                          deletedAt: true,
                          owner: { select: { username: true, displayName: true } },
                        },
                      },
                      author: { select: { username: true, displayName: true } },
                    },
                  },
                }
              : {
                  pullRequest: {
                    select: {
                      id: true,
                      repoId: true,
                      number: true,
                      title: true,
                      status: true,
                      authorId: true,
                      createdAt: true,
                      repository: {
                        select: {
                          id: true,
                          name: true,
                          ownerId: true,
                          visibility: true,
                          deletedAt: true,
                          owner: { select: { username: true, displayName: true } },
                        },
                      },
                      author: { select: { username: true, displayName: true } },
                    },
                  },
                },
          orderBy: { createdAt: 'desc' },
          take: COMMENT_SCAN_CAP,
        })) ?? [];
      } catch {
        comments = [];
      }
      for (const comment of comments) {
        if (comment?.authorId === user.id) continue;
        if (!mentionsUser(comment?.body, user.username)) continue;
        const thread = (parent === 'issue' ? comment?.issue : comment?.pullRequest) as
          | (IssueRow & PullRequestRow)
          | undefined;
        if (!thread || thread.status === 'CLOSED' || thread.status === 'MERGED') continue;
        if (parent === 'pr' && thread.status !== 'OPEN') continue;
        if (!isReadable(thread.repository, user.id, collaboratorIds)) continue;
        put({
          id: `comment-mention:${comment.id}`,
          repo: repoDisplay(thread.repository, thread.repoId),
          repoId: thread.repoId,
          number: thread.number,
          type: parent === 'issue' ? 'issue' : 'pr',
          status: parent === 'issue' ? mapIssueStatus(thread.status) : mapPrStatus(thread.status),
          title: thread.title,
          author: displayName(thread.author, 'user'),
          commentSnippet: snippet(comment.body),
          createdAt: toIso(comment.createdAt ?? thread.createdAt),
          unread: true,
          category: 'mentioned',
        });
      }
    }
  }

  // --- participating: threads the user commented on / reviewed --------------
  if (!wanted || wanted === 'participating') {
    const participation: Array<{ model: string; parent: 'issue' | 'pr'; authorField: string }> = [
      { model: 'issueComment', parent: 'issue', authorField: 'authorId' },
      { model: 'reviewComment', parent: 'pr', authorField: 'authorId' },
      { model: 'review', parent: 'pr', authorField: 'reviewerId' },
    ];
    for (const { model, parent, authorField } of participation) {
      let rows: any[] = [];
      try {
        const where: Record<string, unknown> = { [authorField]: user.id };
        if (model === 'review') where.status = { not: 'PENDING' };
        rows = (await prisma[model]?.findMany({
          where,
          include:
            parent === 'issue'
              ? {
                  issue: {
                    select: {
                      id: true,
                      repoId: true,
                      number: true,
                      title: true,
                      status: true,
                      authorId: true,
                      createdAt: true,
                      repository: {
                        select: {
                          id: true,
                          name: true,
                          ownerId: true,
                          visibility: true,
                          deletedAt: true,
                          owner: { select: { username: true, displayName: true } },
                        },
                      },
                      author: { select: { username: true, displayName: true } },
                    },
                  },
                }
              : {
                  pullRequest: {
                    select: {
                      id: true,
                      repoId: true,
                      number: true,
                      title: true,
                      status: true,
                      authorId: true,
                      createdAt: true,
                      repository: {
                        select: {
                          id: true,
                          name: true,
                          ownerId: true,
                          visibility: true,
                          deletedAt: true,
                          owner: { select: { username: true, displayName: true } },
                        },
                      },
                      author: { select: { username: true, displayName: true } },
                    },
                  },
                },
          orderBy: { createdAt: 'desc' },
          take: COMMENT_SCAN_CAP,
        })) ?? [];
      } catch {
        rows = [];
      }
      for (const row of rows) {
        const thread = (parent === 'issue' ? row?.issue : row?.pullRequest) as
          | (IssueRow & PullRequestRow)
          | undefined;
        if (!thread) continue;
        if (thread.authorId === user.id) continue;
        if (parent === 'pr' && thread.status !== 'OPEN') continue;
        if (parent === 'issue' && thread.status !== 'OPEN') continue;
        if (!isReadable(thread.repository, user.id, collaboratorIds)) continue;
        put({
          id: `${model}:${row.id}`,
          repo: repoDisplay(thread.repository, thread.repoId),
          repoId: thread.repoId,
          number: thread.number,
          type: parent === 'issue' ? 'issue' : 'pr',
          status: parent === 'issue' ? mapIssueStatus(thread.status) : mapPrStatus(thread.status),
          title: thread.title,
          author: displayName(thread.author, 'user'),
          commentSnippet: snippet(row.body),
          createdAt: toIso(row.createdAt ?? thread.createdAt),
          unread: true,
          category: 'participating',
        });
      }
    }
  }

  const notifications = [...byKey.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
    .slice(0, limit);
  return { notifications, unreadCount: notifications.filter((n) => n.unread).length };
}

export interface RequestReviewResult {
  created: string[];
  alreadyRequested: string[];
  skippedAuthor: string[];
  unknown: string[];
}

/**
 * The missing producer: requesting a review creates one durable PENDING
 * Review row per reviewer. Idempotent — re-requesting a reviewer who
 * already has a PENDING row creates nothing (and never duplicates the
 * inbox item, which is keyed off that row). The PR author can never be
 * requested to review their own PR. Reviewer identifiers may be user ids
 * or usernames; anything else lands in `unknown`, never silently dropped
 * into a row for the wrong user.
 */
export async function requestReview(
  prisma: AnyPrisma,
  pr: { id: string; authorId: string },
  reviewerIdsOrUsernames: string[],
): Promise<RequestReviewResult> {
  const result: RequestReviewResult = {
    created: [],
    alreadyRequested: [],
    skippedAuthor: [],
    unknown: [],
  };
  const wanted = [...new Set(reviewerIdsOrUsernames.map((s) => s.trim()).filter(Boolean))];
  if (wanted.length === 0) return result;

  let users: Array<{ id: string; username: string }> = [];
  try {
    users = (await prisma.user?.findMany({
      where: { OR: [{ id: { in: wanted } }, { username: { in: wanted } }] },
      select: { id: true, username: true },
    })) ?? [];
  } catch {
    users = [];
  }
  const byToken = new Map<string, { id: string; username: string }>();
  for (const u of users) {
    byToken.set(u.id, u);
    byToken.set(u.username, u);
  }

  let existing: Array<{ reviewerId: string }> = [];
  try {
    existing = (await prisma.review?.findMany({
      where: { prId: pr.id, status: 'PENDING' },
      select: { reviewerId: true },
    })) ?? [];
  } catch {
    existing = [];
  }
  const pendingIds = new Set(existing.map((r) => r.reviewerId));

  for (const token of wanted) {
    const reviewer = byToken.get(token);
    if (!reviewer) {
      result.unknown.push(token);
      continue;
    }
    if (reviewer.id === pr.authorId) {
      result.skippedAuthor.push(token);
      continue;
    }
    if (pendingIds.has(reviewer.id)) {
      result.alreadyRequested.push(token);
      continue;
    }
    await prisma.review.create({
      data: { prId: pr.id, reviewerId: reviewer.id, status: 'PENDING' },
    });
    pendingIds.add(reviewer.id);
    result.created.push(token);
  }
  return result;
}
