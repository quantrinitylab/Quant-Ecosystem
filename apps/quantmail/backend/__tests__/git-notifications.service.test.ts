import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  listGitNotifications,
  requestReview,
} from '../services/git-notifications.service';

// QuantGit notifications inbox data source: items must derive ONLY from
// durable domain rows, private repos must never leak, and one thread must
// appear once (highest-priority category wins).

const USER = { id: 'user-1', username: 'octocat', displayName: 'Octo Cat' };

function repo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'repo-1',
    name: 'Widgets',
    ownerId: 'owner-1',
    visibility: 'PUBLIC',
    deletedAt: null,
    owner: { username: 'acme', displayName: 'Acme' },
    ...overrides,
  };
}

function pr(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pr-1',
    repoId: 'repo-1',
    number: 42,
    title: 'fix: correct widget alignment',
    body: 'Aligns the widget.',
    status: 'OPEN',
    authorId: 'teammate-1',
    createdAt: new Date('2026-10-20T10:00:00Z'),
    repository: repo(),
    author: { username: 'teammate', displayName: 'Teammate' },
    ...overrides,
  };
}

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: 'issue-1',
    repoId: 'repo-1',
    number: 7,
    title: 'Widget leaks on unmount',
    body: 'It leaks.',
    status: 'OPEN',
    authorId: 'reporter-1',
    assignees: [],
    createdAt: new Date('2026-10-21T10:00:00Z'),
    repository: repo(),
    author: { username: 'reporter', displayName: 'Reporter' },
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    repositoryCollaborator: { findMany: vi.fn().mockResolvedValue([]) },
    review: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    issue: { findMany: vi.fn().mockResolvedValue([]) },
    issueComment: { findMany: vi.fn().mockResolvedValue([]) },
    reviewComment: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe('listGitNotifications', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('lists a PENDING review on an OPEN PR as review_requested', async () => {
    prisma.review.findMany.mockResolvedValue([
      { id: 'rev-1', createdAt: new Date('2026-10-22T10:00:00Z'), pullRequest: pr() },
    ]);
    const { notifications, unreadCount } = await listGitNotifications(prisma as never, USER);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      id: 'review:rev-1',
      repo: 'acme / Widgets',
      number: 42,
      type: 'pr',
      status: 'open',
      category: 'review_requested',
      unread: true,
    });
    expect(unreadCount).toBe(1);
  });

  it('excludes review requests on merged/closed PRs', async () => {
    prisma.review.findMany.mockResolvedValue([
      { id: 'rev-1', createdAt: new Date(), pullRequest: pr({ status: 'MERGED' }) },
      { id: 'rev-2', createdAt: new Date(), pullRequest: pr({ id: 'pr-2', status: 'CLOSED' }) },
    ]);
    const { notifications } = await listGitNotifications(prisma as never, USER);
    expect(notifications).toHaveLength(0);
  });

  it('never leaks a private repo the user neither owns nor collaborates on', async () => {
    prisma.review.findMany.mockResolvedValue([
      {
        id: 'rev-1',
        createdAt: new Date(),
        pullRequest: pr({ repository: repo({ visibility: 'PRIVATE' }) }),
      },
    ]);
    const { notifications } = await listGitNotifications(prisma as never, USER);
    expect(notifications).toHaveLength(0);
  });

  it('includes a private repo when the user collaborates on it', async () => {
    prisma.repositoryCollaborator.findMany.mockResolvedValue([{ repoId: 'repo-1' }]);
    prisma.review.findMany.mockResolvedValue([
      {
        id: 'rev-1',
        createdAt: new Date(),
        pullRequest: pr({ repository: repo({ visibility: 'PRIVATE' }) }),
      },
    ]);
    const { notifications } = await listGitNotifications(prisma as never, USER);
    expect(notifications).toHaveLength(1);
  });

  it('lists an assigned OPEN issue (by username) and not the user\'s own issue', async () => {
    prisma.issue.findMany.mockResolvedValue([
      issue({ assignees: ['octocat'] }),
      issue({ id: 'issue-2', number: 8, authorId: 'user-1', assignees: ['octocat'] }),
      issue({ id: 'issue-3', number: 9, assignees: ['someone-else'] }),
    ]);
    const { notifications } = await listGitNotifications(prisma as never, USER, {
      category: 'assigned',
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ number: 7, category: 'assigned', type: 'issue' });
  });

  it('lists @mentions in issue bodies and in comments, but not the user\'s own words', async () => {
    prisma.issue.findMany.mockResolvedValue([
      issue({ body: 'Hey @octocat, please look.' }),
      issue({ id: 'issue-2', number: 8, body: 'Hey @octocat2, not you.' }),
    ]);
    prisma.issueComment.findMany.mockResolvedValue([
      {
        id: 'c-1',
        authorId: 'other-1',
        body: '@octocat see this',
        createdAt: new Date('2026-10-23T10:00:00Z'),
        issue: issue({ id: 'issue-3', number: 9 }),
      },
      {
        id: 'c-2',
        authorId: 'user-1',
        body: '@octocat self-mention',
        createdAt: new Date(),
        issue: issue({ id: 'issue-4', number: 10 }),
      },
    ]);
    const { notifications } = await listGitNotifications(prisma as never, USER, {
      category: 'mentioned',
    });
    const numbers = notifications.map((n) => n.number).sort();
    expect(numbers).toEqual([7, 9]);
    expect(notifications.every((n) => n.category === 'mentioned')).toBe(true);
  });

  it('lists participation only on somebody else\'s OPEN thread', async () => {
    prisma.issueComment.findMany.mockResolvedValue([
      {
        id: 'c-1',
        authorId: 'user-1',
        body: 'I can reproduce this',
        createdAt: new Date(),
        issue: issue(),
      },
      {
        id: 'c-2',
        authorId: 'user-1',
        body: 'my own thread',
        createdAt: new Date(),
        issue: issue({ id: 'issue-2', number: 8, authorId: 'user-1' }),
      },
    ]);
    const { notifications } = await listGitNotifications(prisma as never, USER, {
      category: 'participating',
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ number: 7, category: 'participating' });
  });

  it('deduplicates one thread to its highest-priority category', async () => {
    prisma.review.findMany.mockResolvedValue([
      { id: 'rev-1', createdAt: new Date('2026-10-22T10:00:00Z'), pullRequest: pr() },
      // A later submitted review on the same PR must not demote the request.
      { id: 'rev-2', createdAt: new Date('2026-10-23T10:00:00Z'), pullRequest: pr() },
    ]);
    // Simulate the participating pass seeing the same PR via a review row:
    // the service's participating query returns rows with pullRequest, but
    // our PENDING rows are filtered out there by status — so emulate with a
    // reviewComment on the same PR instead.
    prisma.reviewComment.findMany.mockResolvedValue([
      {
        id: 'rc-1',
        authorId: 'user-1',
        body: 'left a note',
        createdAt: new Date('2026-10-24T10:00:00Z'),
        pullRequest: pr(),
      },
    ]);
    const { notifications } = await listGitNotifications(prisma as never, USER);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].category).toBe('review_requested');
  });
});

describe('requestReview (the inbox producer)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('creates one PENDING row per resolved reviewer, by username or id', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'rev-a', username: 'alice' },
      { id: 'rev-b', username: 'bob' },
    ]);
    const result = await requestReview(prisma as never, { id: 'pr-1', authorId: 'author-1' }, [
      'alice',
      'rev-b',
    ]);
    expect(result).toEqual({ created: ['alice', 'rev-b'], alreadyRequested: [], skippedAuthor: [], unknown: [] });
    expect(prisma.review.create).toHaveBeenCalledTimes(2);
    expect(prisma.review.create).toHaveBeenCalledWith({
      data: { prId: 'pr-1', reviewerId: 'rev-a', status: 'PENDING' },
    });
  });

  it('is idempotent, skips the PR author, and reports unknown tokens', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'rev-a', username: 'alice' },
      { id: 'author-1', username: 'author' },
    ]);
    prisma.review.findMany.mockResolvedValue([{ reviewerId: 'rev-a' }]);
    const result = await requestReview(
      prisma as never,
      { id: 'pr-1', authorId: 'author-1' },
      ['alice', 'author', 'ghost', 'alice'],
    );
    expect(result).toEqual({
      created: [],
      alreadyRequested: ['alice'],
      skippedAuthor: ['author'],
      unknown: ['ghost'],
    });
    expect(prisma.review.create).not.toHaveBeenCalled();
  });
});
