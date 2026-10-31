// @vitest-environment node
// ============================================================================
// POST /:id/security/dependabot/:alertId/dismiss and
// POST /:id/security/codeql/:alertId/dismiss — fix/qm-securitytab-theater-wire
// The SecurityTab Dismiss buttons used to flip local state with no API call.
// These routes persist the dismissal server-side so a refresh cannot
// resurrect a dismissed alert; unknown ids 404 instead of "dismissing" nothing.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import reposRoutes, {
  resetRepoStores,
  seedSecurityAlertsForTests,
  seedCodeqlAlertsForTests,
} from '../routes/repos';
import type { BackendSecurityAlert, BackendCodeqlAlert } from '../routes/repos';

const MOCK_REPO = {
  id: 'repo-1',
  ownerId: 'user-1',
  name: 'Quant-Ecosystem',
  branches: [
    {
      id: 'branch-1',
      repoId: 'repo-1',
      name: 'main',
      commitSha: '1111111111111111111111111111111111111111',
      isProtected: false,
    },
  ],
  description: 'The unified ecosystem monorepo',
  visibility: 'PUBLIC',
  defaultBranch: 'main',
  storagePathUrl: '/var/repos/user-1/Quant-Ecosystem.git',
  starCount: 0,
  forkCount: 0,
  isArchived: false,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  deletedAt: null,
};

const DEPENDABOT_ALERT: BackendSecurityAlert = {
  id: 'dep-1',
  package: 'lodash',
  severity: 'high',
  cve: 'CVE-2026-0001',
  cvss: 7.8,
  title: 'Prototype pollution',
  cweTitle: 'CWE-1321',
  vulnerableRange: '< 4.17.21',
  patchedVersion: '4.17.21',
  state: 'open',
  createdAt: 'Recently',
};

const CODEQL_ALERT: BackendCodeqlAlert = {
  id: 'cq-1',
  ruleId: 'js/sql-injection',
  ruleName: 'sql-injection',
  severity: 'high',
  filePath: 'src/db.ts',
  lineStart: 10,
  lineEnd: 12,
  description: 'Unsanitized input flows into a SQL query.',
  codeSnippet: 'query(input)',
  recommendedFix: 'Use parameterized queries.',
  state: 'open',
};

async function buildApp(userId: string | null = 'user-1') {
  const prisma = {
    repository: {
      findUnique: vi.fn().mockResolvedValue(MOCK_REPO),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([MOCK_REPO]),
      count: vi.fn().mockResolvedValue(1),
    },
    repositoryPermission: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.decorate('repositoryProvisioning', {
    provision: vi.fn().mockResolvedValue({ storagePath: '/var/repos/test.git' }),
    archive: vi.fn().mockResolvedValue({ storagePath: '/var/repos/test.git.bak' }),
    destroy: vi.fn().mockResolvedValue(undefined),
  } as never);
  app.decorate('repositoryMutation', {
    getBranchHead: vi.fn(),
    commitFile: vi.fn(),
    rollbackCommit: vi.fn(),
  } as never);
  app.decorate('repositoryInspection', {
    listTree: vi.fn().mockResolvedValue([]),
    readBlob: vi.fn().mockResolvedValue({ path: '', content: '', size: 0, sha: '' }),
    listCommits: vi.fn().mockResolvedValue([]),
    searchCode: vi.fn().mockResolvedValue([]),
  } as never);
  app.addHook('onRequest', async (request) => {
    const overrideUser = (request.headers['x-user-id'] as string) || userId;
    if (overrideUser)
      (request as unknown as { auth: { userId: string } }).auth = { userId: overrideUser };
  });
  await app.register(reposRoutes, { prefix: '/repos' });
  await app.ready();
  return app;
}

describe('SecurityTab dismiss endpoints (fix/qm-securitytab-theater-wire)', () => {
  beforeEach(() => {
    resetRepoStores();
  });

  it('POST /repos/:id/security/dependabot/:alertId/dismiss persists dismissed state', async () => {
    const app = await buildApp();
    seedSecurityAlertsForTests('repo-1', [{ ...DEPENDABOT_ALERT }]);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/dependabot/dep-1/dismiss',
      payload: { reason: 'Risk accepted' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.state).toBe('dismissed');
    expect(body.data.dismissedReason).toBe('Risk accepted');

    // A follow-up GET shows the dismissal stuck — no resurrection on refresh.
    const listed = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    const alerts = listed.json().data.dependabot as BackendSecurityAlert[];
    expect(alerts.find((a) => a.id === 'dep-1')?.state).toBe('dismissed');
    await app.close();
  });

  it('dependabot dismiss defaults the reason when none is supplied', async () => {
    const app = await buildApp();
    seedSecurityAlertsForTests('repo-1', [{ ...DEPENDABOT_ALERT }]);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/dependabot/dep-1/dismiss',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.dismissedReason).toBe('Risk accepted');
    await app.close();
  });

  it('dependabot dismiss 404s for an unknown alert instead of claiming success', async () => {
    const app = await buildApp();
    seedSecurityAlertsForTests('repo-1', [{ ...DEPENDABOT_ALERT }]);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/dependabot/nope/dismiss',
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ALERT_NOT_FOUND');
    await app.close();
  });

  it('POST /repos/:id/security/codeql/:alertId/dismiss persists dismissed state', async () => {
    const app = await buildApp();
    seedCodeqlAlertsForTests('repo-1', [{ ...CODEQL_ALERT }]);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/codeql/cq-1/dismiss',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.state).toBe('dismissed');

    const listed = await app.inject({ method: 'GET', url: '/repos/repo-1/security/alerts' });
    const alerts = listed.json().data.codeql as BackendCodeqlAlert[];
    expect(alerts.find((a) => a.id === 'cq-1')?.state).toBe('dismissed');
    await app.close();
  });

  it('codeql dismiss 404s for an unknown alert instead of claiming success', async () => {
    const app = await buildApp();
    seedCodeqlAlertsForTests('repo-1', [{ ...CODEQL_ALERT }]);

    const res = await app.inject({
      method: 'POST',
      url: '/repos/repo-1/security/codeql/nope/dismiss',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('ALERT_NOT_FOUND');
    await app.close();
  });
});
