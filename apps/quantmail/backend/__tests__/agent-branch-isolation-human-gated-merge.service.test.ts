// ============================================================================
// quantmail-superhub · Task 12.5 — branch isolation + human-gated merge
// (Requirements 7.2, 7.5)
// ============================================================================
//
// Exercises the REAL implementations from Tasks 12.2 + 12.4:
//   * createQuantCodeAgentTools (quantcode-agent-tools.ts) — the five scoped
//     tools the bounded Agent Runtime may invoke.
//   * AgentRuntime.step (agent-runtime.service.ts) — the runtime guard that
//     fails closed on an off-branch mutation.
//
// Two safety invariants are asserted:
//   * 7.2 BRANCH ISOLATION — `edit_file` derives its push ref from the agent
//     branch ONLY; `git.pushRefs` is called with `refs/heads/<agentBranch>` and
//     never with a ref targeting the repo's default branch. The tool reports
//     `mutatedBranch == <agent branch>`. At the runtime layer, an observation
//     whose `mutatedBranch != session.branchRef` fails closed (409) and marks
//     the session FAILED — so no write can reach the default branch.
//   * 7.5 HUMAN-GATED MERGE — `open_pr` opens an OPEN PR (source = agent branch,
//     target = base) and consults `evaluateMergeEligibility` READ-ONLY; it NEVER
//     invokes a merge API. Even when the merge decision is `mergeable: true`, no
//     merge is performed — the merge stays pending an explicit human action.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AITool, AssistantContext } from '@quant/ai';
import {
  createQuantCodeAgentTools,
  type QuantCodeAgentToolDeps,
} from '../modules/agent/services/quantcode-agent-tools';
import { AgentRuntime } from '../modules/agent/services/agent-runtime.service';
import type {
  ToolExecutionLoop,
  Observation,
} from '../modules/agent/services/tool-execution-loop';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REPO_ID = 'repo-1';
const DEFAULT_BRANCH = 'main';
const AGENT_BRANCH = 'agent/sess-1';
const USER_ID = 'owner-1';

/** Build an assistant context carrying the agent scope on `crossAppState`. */
function agentContext(overrides: Partial<AssistantContext> = {}): AssistantContext {
  return {
    userId: USER_ID,
    currentApp: 'quantmail',
    conversationHistory: [],
    crossAppState: {
      agentSessionId: 'sess-1',
      repoId: REPO_ID,
      branchRef: AGENT_BRANCH,
      instruction: 'fix the failing test',
    },
    ...overrides,
  };
}

/** Pick a tool by name from the factory output. */
function getTool(tools: AITool[], name: string): AITool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
}

/**
 * Build a set of spy-backed QuantCode service doubles + the deps the tools take.
 * `git.pushRefs` echoes the requested ref as an advanced outcome on the branch
 * the ref resolves to, so the tool reports the agent branch as `mutatedBranch`.
 */
function buildDeps(overrides: Partial<QuantCodeAgentToolDeps> = {}) {
  const pushRefs = vi.fn(async (_userId: string, _repoId: string, refs: Array<{ ref: string; newSha: string }>) => {
    const update = refs[0];
    const branch = update.ref.startsWith('refs/heads/')
      ? update.ref.slice('refs/heads/'.length)
      : update.ref;
    return {
      ok: true,
      updates: [{ ref: update.ref, branch, status: 'advanced' as const, newSha: update.newSha }],
    };
  });

  // A merge spy that MUST never be invoked by any tool.
  const mergePR = vi.fn(async () => {
    throw new Error('mergePR must never be called by an agent tool');
  });
  const createPR = vi.fn(async (input: Record<string, unknown>) => ({
    id: 'pr-1',
    number: 7,
    status: 'OPEN',
    repoId: input['repoId'],
    sourceBranch: input['sourceBranch'],
    targetBranch: input['targetBranch'],
  }));

  const evaluateMergeEligibility = vi.fn(async (prId: string) => ({
    prId,
    mergeable: false,
    reasons: ['Requires 1 approval(s), but only has 0'],
    checks: {
      prOpen: true,
      requiredApprovals: 1,
      approvals: 0,
      changesRequested: false,
      requireStatusChecks: false,
      ciStatus: 'NONE',
    },
  }));

  const git = { pushRefs } as unknown as QuantCodeAgentToolDeps['git'];
  const pullRequests = { createPR, mergePR } as unknown as QuantCodeAgentToolDeps['pullRequests'];
  const mergeEligibility = {
    evaluateMergeEligibility,
  } as unknown as QuantCodeAgentToolDeps['mergeEligibility'];
  const pipelines = {
    triggerPipeline: vi.fn(),
    getRunStatus: vi.fn(),
  } as unknown as QuantCodeAgentToolDeps['pipelines'];

  const prisma = {
    repository: {
      findUnique: vi.fn(async () => ({ id: REPO_ID, defaultBranch: DEFAULT_BRANCH })),
    },
  } as unknown as QuantCodeAgentToolDeps['prisma'];

  const deps: QuantCodeAgentToolDeps = {
    prisma,
    git,
    pullRequests,
    pipelines,
    mergeEligibility,
    // Deterministic base-branch resolution (the repo default branch).
    resolveBaseBranch: async () => DEFAULT_BRANCH,
    ...overrides,
  };

  return { deps, spies: { pushRefs, createPR, mergePR, evaluateMergeEligibility } };
}

// ---------------------------------------------------------------------------
// 1. Branch isolation (Requirement 7.2)
// ---------------------------------------------------------------------------

describe('QuantCode agent tools — branch isolation (Requirement 7.2)', () => {
  it('edit_file pushes to refs/heads/<agentBranch>, never the default branch', async () => {
    const { deps, spies } = buildDeps();
    const editFile = getTool(createQuantCodeAgentTools(deps), 'edit_file');

    const result = await editFile.handler(
      { path: 'src/a.ts', content: 'export const a = 1;\n' },
      agentContext(),
    );

    expect(result.success).toBe(true);
    expect(spies.pushRefs).toHaveBeenCalledTimes(1);

    const [userIdArg, repoIdArg, refUpdates] = spies.pushRefs.mock.calls[0];
    expect(userIdArg).toBe(USER_ID);
    expect(repoIdArg).toBe(REPO_ID);
    // The ref is derived from the AGENT branch only.
    expect(refUpdates[0].ref).toBe(`refs/heads/${AGENT_BRANCH}`);
    // ...and never targets the repo's default branch.
    expect(refUpdates[0].ref).not.toBe(`refs/heads/${DEFAULT_BRANCH}`);
    expect(refUpdates[0].ref).not.toContain(DEFAULT_BRANCH);
  });

  it('no pushRefs call across multiple edits ever targets the default branch', async () => {
    const { deps, spies } = buildDeps();
    const editFile = getTool(createQuantCodeAgentTools(deps), 'edit_file');

    await editFile.handler({ path: 'a.ts', content: 'a' }, agentContext());
    await editFile.handler({ path: 'b.ts', content: 'b' }, agentContext());

    for (const call of spies.pushRefs.mock.calls) {
      const refUpdates = call[2];
      for (const update of refUpdates) {
        expect(update.ref).toBe(`refs/heads/${AGENT_BRANCH}`);
        expect(update.ref).not.toBe(`refs/heads/${DEFAULT_BRANCH}`);
      }
    }
  });

  it('edit_file reports mutatedBranch == the agent branch (so the runtime guard passes)', async () => {
    const { deps } = buildDeps();
    const editFile = getTool(createQuantCodeAgentTools(deps), 'edit_file');

    const result = await editFile.handler(
      { path: 'src/a.ts', content: 'x' },
      agentContext(),
    );

    const data = result.data as { mutatedBranch?: string; mutatedFiles?: string[] };
    expect(data.mutatedBranch).toBe(AGENT_BRANCH);
    expect(data.mutatedBranch).not.toBe(DEFAULT_BRANCH);
    expect(data.mutatedFiles).toEqual(['src/a.ts']);
  });

  it('edit_file fails closed (no push) when no agent scope is present', async () => {
    const { deps, spies } = buildDeps();
    const editFile = getTool(createQuantCodeAgentTools(deps), 'edit_file');

    const result = await editFile.handler(
      { path: 'a.ts', content: 'x' },
      agentContext({ crossAppState: {} }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('MISSING_AGENT_SCOPE');
    expect(spies.pushRefs).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. Human-gated merge (Requirement 7.5)
// ---------------------------------------------------------------------------

describe('QuantCode agent tools — human-gated merge (Requirement 7.5)', () => {
  it('open_pr creates an OPEN PR (agent branch → base) and never merges', async () => {
    const { deps, spies } = buildDeps();
    const openPr = getTool(createQuantCodeAgentTools(deps), 'open_pr');

    const result = await openPr.handler(
      { title: 'Fix flaky test', body: 'patch' },
      agentContext(),
    );

    expect(result.success).toBe(true);
    // PR opened from the agent branch into the base branch, status OPEN.
    expect(spies.createPR).toHaveBeenCalledTimes(1);
    expect(spies.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId: REPO_ID,
        title: 'Fix flaky test',
        authorId: USER_ID,
        sourceBranch: AGENT_BRANCH,
        targetBranch: DEFAULT_BRANCH,
      }),
    );

    const data = result.data as { status?: string; sourceBranch?: string; targetBranch?: string; done?: boolean };
    expect(data.status).toBe('OPEN');
    expect(data.sourceBranch).toBe(AGENT_BRANCH);
    expect(data.targetBranch).toBe(DEFAULT_BRANCH);
    // Session is parked for human review.
    expect(data.done).toBe(true);

    // The merge API is NEVER called by the tool.
    expect(spies.mergePR).not.toHaveBeenCalled();
  });

  it('open_pr consults evaluateMergeEligibility READ-ONLY (informational only)', async () => {
    const { deps, spies } = buildDeps();
    const openPr = getTool(createQuantCodeAgentTools(deps), 'open_pr');

    await openPr.handler({ title: 'Fix' }, agentContext());

    // Read-only eligibility check on the created PR id.
    expect(spies.evaluateMergeEligibility).toHaveBeenCalledTimes(1);
    expect(spies.evaluateMergeEligibility).toHaveBeenCalledWith('pr-1');
    // Consulting eligibility must not trigger a merge.
    expect(spies.mergePR).not.toHaveBeenCalled();
  });

  it('does NOT merge even when the merge decision is mergeable: true', async () => {
    const { deps, spies } = buildDeps();
    // Force an eligible decision; the tool must STILL not merge.
    spies.evaluateMergeEligibility.mockResolvedValueOnce({
      prId: 'pr-1',
      mergeable: true,
      reasons: [],
      checks: {
        prOpen: true,
        requiredApprovals: 0,
        approvals: 0,
        changesRequested: false,
        requireStatusChecks: false,
        ciStatus: 'SUCCESS',
      },
    });
    const openPr = getTool(createQuantCodeAgentTools(deps), 'open_pr');

    const result = await openPr.handler({ title: 'Fix' }, agentContext());

    expect(result.success).toBe(true);
    const data = result.data as { status?: string; mergeDecision?: { mergeable?: boolean } };
    expect(data.status).toBe('OPEN'); // still OPEN, not merged
    expect(data.mergeDecision?.mergeable).toBe(true);
    // The human gate holds regardless of eligibility.
    expect(spies.mergePR).not.toHaveBeenCalled();
  });

  it('open_pr refuses to target the agent branch itself (no PR created)', async () => {
    const { deps, spies } = buildDeps({ resolveBaseBranch: async () => AGENT_BRANCH });
    const openPr = getTool(createQuantCodeAgentTools(deps), 'open_pr');

    const result = await openPr.handler({ title: 'Fix' }, agentContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe('INVALID_BASE_BRANCH');
    expect(spies.createPR).not.toHaveBeenCalled();
    expect(spies.mergePR).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Runtime fail-closed on an off-branch mutation (Requirement 7.2)
// ---------------------------------------------------------------------------

type SessionRow = {
  id: string;
  userId: string;
  repoId: string;
  instruction: string;
  status: string;
  branchRef: string;
  maxIterations: number;
  iterationCount: number;
  costBudget: number;
  costSpent: number;
  linkedPrId: string | null;
};

type TranscriptRow = {
  id: string;
  sessionId: string;
  seq: number;
  role: string;
  toolName: string | null;
  payload: unknown;
  tokensUsed: number;
};

/** In-memory prisma double (sessions + transcripts) — mirrors the 12.2 test. */
function createMockPrisma(initialSession: SessionRow) {
  const sessions = new Map<string, SessionRow>([[initialSession.id, { ...initialSession }]]);
  const transcripts: TranscriptRow[] = [];
  let transcriptId = 0;

  return {
    _sessions: sessions,
    _transcripts: transcripts,
    agentSession: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = sessions.get(where.id);
        return row ? { ...row } : null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
          const row = sessions.get(where.id);
          if (!row) throw new Error('session not found');
          const next = { ...row, ...data };
          sessions.set(where.id, next);
          return { ...next };
        },
      ),
    },
    agentTranscript: {
      findFirst: vi.fn(async ({ where }: { where: { sessionId: string } }) => {
        const rows = transcripts
          .filter((t) => t.sessionId === where.sessionId)
          .sort((a, b) => b.seq - a.seq);
        return rows[0] ? { seq: rows[0].seq } : null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<TranscriptRow, 'id'> }) => {
        const row: TranscriptRow = { id: `t-${++transcriptId}`, ...data };
        transcripts.push(row);
        return { ...row };
      }),
    },
  };
}

const BASE_SESSION: SessionRow = {
  id: 'sess-1',
  userId: USER_ID,
  repoId: REPO_ID,
  instruction: 'fix the failing test',
  status: 'RUNNING',
  branchRef: AGENT_BRANCH,
  maxIterations: 5,
  iterationCount: 0,
  costBudget: 100,
  costSpent: 0,
  linkedPrId: null,
};

function loopReturning(observation: Observation): ToolExecutionLoop {
  return {
    selectTool: vi.fn(() => ({ toolName: 'edit_file', args: { path: 'a.ts' } })),
    execute: vi.fn(async () => observation),
  };
}

describe('AgentRuntime.step — fails closed on a write off the agent branch (Requirement 7.2)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma(BASE_SESSION);
  });

  it('rejects (409) and marks the session FAILED when a tool mutates the default branch', async () => {
    const loop = loopReturning({
      ok: true,
      mutatedFiles: ['README.md'],
      mutatedBranch: DEFAULT_BRANCH, // off the agent branch — must fail closed
    });
    const runtime = new AgentRuntime(prisma as never, { loop });

    await expect(runtime.step('sess-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'BRANCH_ISOLATION_VIOLATION',
    });

    const session = await prisma.agentSession.findUnique({ where: { id: 'sess-1' } });
    expect(session?.status).toBe('FAILED');
    // The counter did NOT advance for the rejected (off-branch) mutation.
    expect(session?.iterationCount).toBe(0);
    // The rejection is auditable.
    expect(prisma._transcripts[0].payload).toMatchObject({ rejected: true });
  });

  it('accepts a mutation confined to the agent branch (no isolation violation)', async () => {
    const loop = loopReturning({
      ok: true,
      mutatedFiles: ['a.ts'],
      mutatedBranch: AGENT_BRANCH, // confined to the agent branch
    });
    const runtime = new AgentRuntime(prisma as never, { loop });

    const result = await runtime.step('sess-1');

    expect(result.outcome).toBe('executed');
    expect(result.session.status).toBe('RUNNING');
    expect(result.session.iterationCount).toBe(1);
  });
});
