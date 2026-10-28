// ============================================================================
// QuantAI — ProjectMemory ownership tests (CEO-approved claim:
// quantai-project-memory-ownership, Stage 1 Seam 1 fix)
//
// Every project-memory row is owned by a userId (strict equality
// row.ownerId === caller). Routes require request.auth.userId (401 when
// absent) and pass it through, so via HTTP only the owner sees a row and
// legacy (ownerless) rows 404. Direct service calls without an ownerId
// retain legacy access ONLY to ownerless rows (backward compat).
//
// Harness mirrors project-memory.service.test.ts: bare Fastify, decorated
// service, mocked @quant/server-core. The only addition is a test-only
// onRequest hook mapping the x-test-user-id header to request.auth — the
// same decoration shape the real auth plugin produces.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { ProjectMemoryService } from '../services/project-memory.service';
import projectMemoryRoutes from '../routes/project-memory';

vi.mock('@quant/server-core', () => ({
  createApp: vi.fn(),
  createAppError: (message: string, statusCode: number, code: string) => {
    const error = new Error(message) as Error & { statusCode: number; code: string };
    error.statusCode = statusCode;
    error.code = code;
    return error;
  },
}));

const ALICE = 'user-alice';
const BOB = 'user-bob';

describe('ProjectMemoryService — ownership (service-level)', () => {
  let service: ProjectMemoryService;

  beforeEach(() => {
    service = new ProjectMemoryService();
  });

  it('owner read/write/delete/query succeed on an owned row', () => {
    service.createProjectMemory({
      projectId: 'own-proj',
      workspaceId: 'ws-1',
      ownerId: ALICE,
    });
    const entry = service.addMemoryEntry(
      'own-proj',
      { content: 'alice secret note', category: 'notes' },
      ALICE,
    );
    expect(service.getProjectMemory('own-proj', ALICE)?.projectId).toBe('own-proj');
    expect(
      service.updateMemoryMode('own-proj', 'PROJECT_ISOLATED', ALICE).memoryMode,
    ).toBe('PROJECT_ISOLATED');
    expect(
      service.updateCustomInstructions('own-proj', 'Be concise', ALICE).customInstructions,
    ).toBe('Be concise');
    expect(service.togglePin('own-proj', entry.id, ALICE).isPinned).toBe(true);
    expect(service.queryMemories('*', 'own-proj', ALICE)).toHaveLength(1);
    expect(service.listProjects(ALICE).map((p) => p.projectId)).toContain('own-proj');
    expect(service.removeMemoryEntry('own-proj', entry.id, ALICE)).toBe(true);
    expect(service.deleteProjectMemory('own-proj', ALICE)).toBe(true);
    expect(service.getProjectMemory('own-proj', ALICE)).toBeUndefined();
  });

  it('cross-user access is denied on every accessor, row left intact', () => {
    service.createProjectMemory({
      projectId: 'alice-proj',
      workspaceId: 'ws-1',
      ownerId: ALICE,
    });
    const entry = service.addMemoryEntry(
      'alice-proj',
      { content: 'alice private', category: 'notes' },
      ALICE,
    );

    expect(service.getProjectMemory('alice-proj', BOB)).toBeUndefined();
    expect(() => service.updateMemoryMode('alice-proj', 'DEFAULT', BOB)).toThrow(
      'Project memory not found for project: alice-proj',
    );
    expect(() => service.updateCustomInstructions('alice-proj', 'hacked', BOB)).toThrow(
      'Project memory not found for project: alice-proj',
    );
    expect(() =>
      service.addMemoryEntry('alice-proj', { content: 'bob injection' }, BOB),
    ).toThrow('Project memory not found for project: alice-proj');
    expect(() => service.removeMemoryEntry('alice-proj', entry.id, BOB)).toThrow(
      'Project memory not found for project: alice-proj',
    );
    expect(() => service.togglePin('alice-proj', entry.id, BOB)).toThrow(
      'Project memory not found for project: alice-proj',
    );
    expect(service.queryMemories('*', 'alice-proj', BOB)).toEqual([]);
    expect(service.listProjects(BOB)).toEqual([]);
    expect(service.deleteProjectMemory('alice-proj', BOB)).toBe(false);

    // Alice's row is untouched by Bob's attempts.
    expect(service.getProjectMemory('alice-proj', ALICE)?.memoryEntries).toHaveLength(1);
    expect(service.getProjectMemory('alice-proj', ALICE)?.customInstructions).toBe('');
  });

  it('legacy (ownerless) row is denied to any real userId, still reachable without one', () => {
    service.createProjectMemory({ projectId: 'legacy-proj', workspaceId: 'ws-1' });
    service.addMemoryEntry('legacy-proj', { content: 'legacy note' });

    expect(service.getProjectMemory('legacy-proj', ALICE)).toBeUndefined();
    expect(() =>
      service.addMemoryEntry('legacy-proj', { content: 'alice note' }, ALICE),
    ).toThrow('Project memory not found for project: legacy-proj');
    expect(service.queryMemories('*', 'legacy-proj', ALICE)).toEqual([]);
    expect(service.listProjects(ALICE)).toEqual([]);

    // Grandfathering: direct calls without ownerId keep working on legacy rows.
    expect(service.getProjectMemory('legacy-proj')?.memoryEntries).toHaveLength(1);
    expect(service.addMemoryEntry('legacy-proj', { content: 'legacy note 2' }).content).toBe(
      'legacy note 2',
    );
  });

  it('owned row is invisible to direct calls that omit ownerId', () => {
    service.createProjectMemory({
      projectId: 'owned-proj',
      workspaceId: 'ws-1',
      ownerId: ALICE,
    });
    service.addMemoryEntry('owned-proj', { content: 'alice only' }, ALICE);

    expect(service.getProjectMemory('owned-proj')).toBeUndefined();
    expect(service.queryMemories('*', 'owned-proj')).toEqual([]);
    expect(service.queryMemories('*')).toEqual([]);
    expect(service.listProjects()).toEqual([]);
  });

  it('DEFAULT cross-project query never leaks another owner\'s entries', () => {
    service.createProjectMemory({
      projectId: 'alice-default',
      workspaceId: 'ws-1',
      ownerId: ALICE,
    });
    service.createProjectMemory({
      projectId: 'bob-default',
      workspaceId: 'ws-1',
      ownerId: BOB,
    });
    service.addMemoryEntry('alice-default', { content: 'alice shared secret' }, ALICE);
    service.addMemoryEntry('bob-default', { content: 'bob shared note' }, BOB);

    const aliceView = service.queryMemories('*', undefined, ALICE);
    expect(aliceView.map((e) => e.content)).toEqual(['alice shared secret']);
    const bobTargetingAlice = service.queryMemories('*', 'alice-default', BOB);
    expect(bobTargetingAlice.map((e) => e.content)).toEqual(['bob shared note']);
  });
});

describe('Fastify Routes — ownership (/projects/:projectId/memory)', () => {
  let app: ReturnType<typeof Fastify>;
  let service: ProjectMemoryService;

  async function buildApp() {
    app = Fastify();
    service = new ProjectMemoryService();
    app.decorate('projectMemoryService', service);
    // Test-only auth: x-test-user-id header -> request.auth (same shape as
    // the real auth plugin's decoration, which routes read as request.auth.userId).
    app.addHook('onRequest', (request, _reply, done) => {
      const userId = request.headers['x-test-user-id'];
      if (typeof userId === 'string' && userId) {
        (request as unknown as { auth: { userId: string } }).auth = { userId };
      }
      done();
    });
    await app.register(projectMemoryRoutes, { prefix: '/projects' });
    await app.ready();
  }

  beforeEach(async () => {
    await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const asUser = (userId: string) => ({ headers: { 'x-test-user-id': userId } });

  function seedAliceRow() {
    service.createProjectMemory({
      projectId: 'alice-proj',
      workspaceId: 'ws-1',
      ownerId: ALICE,
    });
    return service.addMemoryEntry(
      'alice-proj',
      { content: 'alice route note', category: 'notes' },
      ALICE,
    );
  }

  it('owner happy path: read/write/delete/query all succeed', async () => {
    const created = await app.inject({
      method: 'GET',
      url: '/projects/owner-proj/memory?workspaceId=ws-owner',
      ...asUser(ALICE),
    });
    expect(created.statusCode).toBe(200);
    expect(JSON.parse(created.body).success).toBe(true);
    expect(JSON.parse(created.body).data.ownerId).toBe(ALICE);
    expect(JSON.parse(created.body).data.workspaceId).toBe('ws-owner');

    const added = await app.inject({
      method: 'POST',
      url: '/projects/owner-proj/memory/entries',
      payload: { content: 'owner entry', category: 'notes' },
      ...asUser(ALICE),
    });
    expect(added.statusCode).toBe(201);
    const entryId = JSON.parse(added.body).data.id as string;

    const queried = await app.inject({
      method: 'GET',
      url: '/projects/owner-proj/memory/query?q=owner',
      ...asUser(ALICE),
    });
    expect(queried.statusCode).toBe(200);
    expect(JSON.parse(queried.body).success).toBe(true);
    expect(JSON.parse(queried.body).data).toHaveLength(1);

    const mode = await app.inject({
      method: 'PATCH',
      url: '/projects/owner-proj/memory/mode',
      payload: { mode: 'PROJECT_ISOLATED' },
      ...asUser(ALICE),
    });
    expect(mode.statusCode).toBe(200);
    expect(JSON.parse(mode.body).data.memoryMode).toBe('PROJECT_ISOLATED');

    const instructions = await app.inject({
      method: 'PATCH',
      url: '/projects/owner-proj/memory/instructions',
      payload: { customInstructions: 'Owner rules' },
      ...asUser(ALICE),
    });
    expect(instructions.statusCode).toBe(200);
    expect(JSON.parse(instructions.body).data.customInstructions).toBe('Owner rules');

    const pinned = await app.inject({
      method: 'POST',
      url: `/projects/owner-proj/memory/entries/${entryId}/pin`,
      ...asUser(ALICE),
    });
    expect(pinned.statusCode).toBe(200);
    expect(JSON.parse(pinned.body).data.isPinned).toBe(true);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/projects/owner-proj/memory/entries/${entryId}`,
      ...asUser(ALICE),
    });
    expect(deleted.statusCode).toBe(200);
    expect(JSON.parse(deleted.body).data.removed).toBe(true);
  });

  it('cross-user requests 404 on all 7 endpoints (no leak, no auto-create)', async () => {
    const entry = seedAliceRow();

    const cases: Array<{ method: string; url: string; payload?: unknown }> = [
      { method: 'GET', url: '/projects/alice-proj/memory' },
      { method: 'PATCH', url: '/projects/alice-proj/memory/mode', payload: { mode: 'DEFAULT' } },
      {
        method: 'PATCH',
        url: '/projects/alice-proj/memory/instructions',
        payload: { customInstructions: 'bob rules' },
      },
      {
        method: 'POST',
        url: '/projects/alice-proj/memory/entries',
        payload: { content: 'bob entry' },
      },
      { method: 'DELETE', url: `/projects/alice-proj/memory/entries/${entry.id}` },
      { method: 'POST', url: `/projects/alice-proj/memory/entries/${entry.id}/pin` },
      { method: 'GET', url: '/projects/alice-proj/memory/query?q=alice' },
    ];
    for (const c of cases) {
      const res = await app.inject({ ...c, ...asUser(BOB) });
      expect(res.statusCode).toBe(404);
    }

    // Bob's GET did not auto-create a competing row; Alice's row is intact.
    expect(service.getProjectMemory('alice-proj', ALICE)?.memoryEntries).toHaveLength(1);
    expect(service.listProjects(BOB)).toEqual([]);
  });

  it('unauthenticated requests 401 on all 7 endpoints (auth precedes validation)', async () => {
    const entry = seedAliceRow();

    const cases: Array<{ method: string; url: string; payload?: unknown }> = [
      { method: 'GET', url: '/projects/alice-proj/memory' },
      { method: 'PATCH', url: '/projects/alice-proj/memory/mode', payload: { mode: 'DEFAULT' } },
      {
        method: 'PATCH',
        url: '/projects/alice-proj/memory/instructions',
        payload: { customInstructions: 'x' },
      },
      {
        method: 'POST',
        url: '/projects/alice-proj/memory/entries',
        payload: { content: 'x' },
      },
      { method: 'DELETE', url: `/projects/alice-proj/memory/entries/${entry.id}` },
      { method: 'POST', url: `/projects/alice-proj/memory/entries/${entry.id}/pin` },
      { method: 'GET', url: '/projects/alice-proj/memory/query?q=x' },
    ];
    for (const c of cases) {
      const res = await app.inject(c);
      expect(res.statusCode).toBe(401);
    }

    // Auth precedes body validation: invalid body + no auth still 401, not 400.
    const badBody = await app.inject({
      method: 'POST',
      url: '/projects/alice-proj/memory/entries',
      payload: { content: '' },
    });
    expect(badBody.statusCode).toBe(401);
  });

  it('legacy (ownerless) row is denied via route and does not 500 on auto-create', async () => {
    service.createProjectMemory({ projectId: 'legacy-proj', workspaceId: 'ws-1' });
    service.addMemoryEntry('legacy-proj', { content: 'legacy note' });

    const get = await app.inject({
      method: 'GET',
      url: '/projects/legacy-proj/memory',
      ...asUser(ALICE),
    });
    expect(get.statusCode).toBe(404);

    const query = await app.inject({
      method: 'GET',
      url: '/projects/legacy-proj/memory/query?q=legacy',
      ...asUser(ALICE),
    });
    expect(query.statusCode).toBe(404);

    const post = await app.inject({
      method: 'POST',
      url: '/projects/legacy-proj/memory/entries',
      payload: { content: 'alice entry' },
      ...asUser(ALICE),
    });
    expect(post.statusCode).toBe(404);
  });

  it('auto-create is owner-bound: creator sees it, other users 404', async () => {
    const created = await app.inject({
      method: 'GET',
      url: '/projects/fresh-proj/memory',
      ...asUser(ALICE),
    });
    expect(created.statusCode).toBe(200);
    expect(JSON.parse(created.body).success).toBe(true);
    expect(JSON.parse(created.body).data.ownerId).toBe(ALICE);

    const bobView = await app.inject({
      method: 'GET',
      url: '/projects/fresh-proj/memory',
      ...asUser(BOB),
    });
    expect(bobView.statusCode).toBe(404);
    expect(service.listProjects(BOB)).toEqual([]);
    expect(service.listProjects(ALICE).map((p) => p.projectId)).toEqual(['fresh-proj']);
  });

  it('missing-target query keeps HEAD behavior: 200 with caller\'s own DEFAULT entries', async () => {
    service.createProjectMemory({
      projectId: 'alice-default',
      workspaceId: 'ws-1',
      ownerId: ALICE,
    });
    service.addMemoryEntry('alice-default', { content: 'alice default note' }, ALICE);

    const aliceMissing = await app.inject({
      method: 'GET',
      url: '/projects/no-such-proj/memory/query?q=alice',
      ...asUser(ALICE),
    });
    expect(aliceMissing.statusCode).toBe(200);
    expect(JSON.parse(aliceMissing.body).data).toHaveLength(1);

    const bobMissing = await app.inject({
      method: 'GET',
      url: '/projects/no-such-proj/memory/query?q=alice',
      ...asUser(BOB),
    });
    expect(bobMissing.statusCode).toBe(200);
    expect(JSON.parse(bobMissing.body).data).toEqual([]);
  });

  it('autoCreate=false on missing project still 404 under auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/projects/no-such-proj/memory?autoCreate=false',
      ...asUser(ALICE),
    });
    expect(res.statusCode).toBe(404);
  });

  it('autoCreate=false on a foreign project 404s (no existence signal)', async () => {
    seedAliceRow();
    const res = await app.inject({
      method: 'GET',
      url: '/projects/alice-proj/memory?autoCreate=false',
      ...asUser(BOB),
    });
    expect(res.statusCode).toBe(404);
  });
});
