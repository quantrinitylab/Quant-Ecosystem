// ============================================================================
// quantmail-superhub · Task 12.1 — AgentRuntime.startTask preconditions
// (Requirements 7.1, 7.2)
// ============================================================================
//
// Covers the write-scope + budget preconditions and the isolated-branch
// guarantee of `AgentRuntime.startTask`:
//   * write scope required (403, no session created)            — Req 7.1
//   * available budget required (positive iters + cost)         — Req 7.1
//   * created session is 'planning' on an isolated agent branch — Req 7.2
//   * branchRef != repo.defaultBranch (never writes to base)    — Req 7.2

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRuntime } from '../modules/agent/services/agent-runtime.service';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function createMockPrisma() {
  return {
    repository: {
      findUnique: vi.fn(),
    },
    agentSession: {
      // Echo the create payload back as the persisted row (id supplied by service).
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      })),
    },
  };
}

const REPO = {
  id: 'repo-1',
  ownerId: 'owner-1',
  name: 'demo',
  defaultBranch: 'main',
  storagePathUrl: null,
};

const FIXED_ID = '11111111-2222-3333-4444-555555555555';

function makeRuntime(prisma: ReturnType<typeof createMockPrisma>) {
  return new AgentRuntime(prisma as never, { generateId: () => FIXED_ID });
}

describe('AgentRuntime.startTask (Requirements 7.1, 7.2)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    prisma.repository.findUnique.mockResolvedValue(REPO);
  });

  it('creates a planning AgentSession on an isolated agent branch for a write-scoped owner with budget', async () => {
    const runtime = makeRuntime(prisma);

    const session = await runtime.startTask('owner-1', 'repo-1', 'fix the failing test');

    expect(prisma.agentSession.create).toHaveBeenCalledTimes(1);
    expect(session.status).toBe('PLANNING');
    expect(session.userId).toBe('owner-1');
    expect(session.repoId).toBe('repo-1');
    expect(session.instruction).toBe('fix the failing test');
    // Isolated branch derived from the session id, distinct from default branch.
    expect(session.branchRef).toBe(`agent/${FIXED_ID}`);
    expect(session.branchRef).not.toBe(REPO.defaultBranch);
    // Budget + counters initialized.
    expect(session.maxIterations).toBeGreaterThan(0);
    expect(session.costBudget).toBeGreaterThan(0);
    expect(session.iterationCount).toBe(0);
    expect(session.costSpent).toBe(0);
    expect(session.linkedPrId).toBeNull();
  });

  it('honors explicit budget options', async () => {
    const runtime = makeRuntime(prisma);

    const session = await runtime.startTask('owner-1', 'repo-1', 'modernize deps', {
      maxIterations: 5,
      costBudget: 42,
    });

    expect(session.maxIterations).toBe(5);
    expect(session.costBudget).toBe(42);
  });

  it('rejects with 403 and creates no session when the caller lacks write scope', async () => {
    const runtime = makeRuntime(prisma);

    await expect(
      runtime.startTask('intruder', 'repo-1', 'do something'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'WRITE_SCOPE_REQUIRED' });

    expect(prisma.agentSession.create).not.toHaveBeenCalled();
  });

  it('rejects with 402 and creates no session when maxIterations is not positive', async () => {
    const runtime = makeRuntime(prisma);

    await expect(
      runtime.startTask('owner-1', 'repo-1', 'do something', { maxIterations: 0 }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'BUDGET_REQUIRED' });

    expect(prisma.agentSession.create).not.toHaveBeenCalled();
  });

  it('rejects with 402 and creates no session when the cost budget is not positive', async () => {
    const runtime = makeRuntime(prisma);

    await expect(
      runtime.startTask('owner-1', 'repo-1', 'do something', { costBudget: 0 }),
    ).rejects.toMatchObject({ statusCode: 402, code: 'BUDGET_REQUIRED' });

    expect(prisma.agentSession.create).not.toHaveBeenCalled();
  });

  it('rejects with 404 when the repository does not exist', async () => {
    prisma.repository.findUnique.mockResolvedValue(null);
    const runtime = makeRuntime(prisma);

    await expect(
      runtime.startTask('owner-1', 'missing', 'do something'),
    ).rejects.toMatchObject({ statusCode: 404, code: 'REPO_NOT_FOUND' });

    expect(prisma.agentSession.create).not.toHaveBeenCalled();
  });

  it('rejects with 400 when the instruction is empty', async () => {
    const runtime = makeRuntime(prisma);

    await expect(
      runtime.startTask('owner-1', 'repo-1', '   '),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INSTRUCTION_REQUIRED' });

    expect(prisma.repository.findUnique).not.toHaveBeenCalled();
    expect(prisma.agentSession.create).not.toHaveBeenCalled();
  });

  it('guarantees the agent branch differs even if it would collide with the default branch', async () => {
    // Pathological repo whose default branch equals the would-be agent branch.
    prisma.repository.findUnique.mockResolvedValue({
      ...REPO,
      defaultBranch: `agent/${FIXED_ID}`,
    });
    const runtime = makeRuntime(prisma);

    const session = await runtime.startTask('owner-1', 'repo-1', 'edge case');

    expect(session.branchRef).not.toBe(`agent/${FIXED_ID}`);
    expect(session.branchRef.startsWith(`agent/${FIXED_ID}`)).toBe(true);
  });
});
