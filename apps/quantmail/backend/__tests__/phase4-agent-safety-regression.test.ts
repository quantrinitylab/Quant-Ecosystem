// @vitest-environment node
// ============================================================================
// Feature: quantmail-superhub, Phase-4 agent-safety regression (HARD-GATE assertions)
// Task 13.2 — "Write security regression for Phase-4 agent-safety classes"
// ============================================================================
//
// This suite is the consolidated Phase-4 HARD GATE: it asserts that each
// Phase-4 agent-safety vulnerability class (V11–V13) is closed against the REAL
// implementations shipped in Tasks 12.1–12.4. It is the regression net that
// must stay green before any later agentic pillar (Company OS / autonomous
// handlers) is enabled.
//
//   V11  Agent unbounded iterations              — Task 13.2 (Req 7.3)
//   V12  Agent writes to base branch             — Task 13.2 (Req 7.2)
//   V13  Agent tool side-effects outside scoped APIs — Task 13.2 (Req 7.6)
//
// _Requirements: 7.2, 7.3, 7.6_
//
// STRATEGY
//   Every class is asserted against the REAL code paths — no mock of the
//   runtime or the tools themselves:
//     * V11 drives the REAL `AgentRuntime.step` (agent-runtime.service.ts) with
//       an adversarial loop that ALWAYS wants to act, across many more steps
//       than the bound, and asserts `iterationCount <= maxIterations` after
//       every step and that the session stops (AWAITING_REVIEW) at the bound.
//     * V12 exercises the REAL `createQuantCodeAgentTools` `edit_file` to prove
//       its push ref is derived from the agent branch ONLY (git.pushRefs never
//       receives `refs/heads/<defaultBranch>`), and the REAL `AgentRuntime.step`
//       to prove an observation mutating off-branch fails closed (409) and marks
//       the session FAILED.
//     * V13 wires the five REAL tools onto spy-backed QuantCode services and
//       asserts EVERY side-effect flows only through those injected scoped APIs
//       (git / pullRequests / pipelines / mergeEligibility), that no merge API
//       is ever invoked, and that a scope-less tool invocation fails closed
//       (MISSING_AGENT_SCOPE) with no side effect.
//
// The in-memory prisma double + spy-service patterns mirror the existing agent
// tests (agent-runtime-step.service.test.ts, agent-iteration-bound.property.test.ts,
// agent-branch-isolation-human-gated-merge.service.test.ts). No QuantChat code
// is touched.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import type { AITool, AssistantContext } from '@quant/ai';
import { AgentRuntime } from '../modules/agent/services/agent-runtime.service';
import {
  createQuantCodeAgentTools,
  type QuantCodeAgentToolDeps,
} from '../modules/agent/services/quantcode-agent-tools';
import type {
  ToolExecutionLoop,
  Observation,
} from '../modules/agent/services/tool-execution-loop';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const REPO_ID = 'repo-1';
const DEFAULT_BRANCH = 'main';
const AGENT_BRANCH = 'agent/sess-1';
const USER_ID = 'owner-1';

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

/** In-memory prisma double (sessions + transcripts) — mirrors the 12.2 tests. */
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

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
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
    ...overrides,
  };
}

/** A loop that always selects a tool and returns a fixed observation. */
function loopReturning(observation: Observation): ToolExecutionLoop {
  return {
    selectTool: vi.fn(() => ({ toolName: 'edit_file', args: { path: 'a.ts' } })),
    execute: vi.fn(async () => observation),
  };
}

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

function getTool(tools: AITool[], name: string): AITool {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
}

/**
 * Build spy-backed QuantCode service doubles + the deps the tools take. The
 * `mergePR` spy is wired to THROW: if any tool ever reaches a merge API the
 * test fails loudly. `git.pushRefs` echoes the requested ref as an advanced
 * outcome so `edit_file` reports the agent branch as `mutatedBranch`.
 */
function buildToolDeps(overrides: Partial<QuantCodeAgentToolDeps> = {}) {
  const pushRefs = vi.fn(
    async (_userId: string, _repoId: string, refs: Array<{ ref: string; newSha: string }>) => {
      const update = refs[0];
      const branch = update.ref.startsWith('refs/heads/')
        ? update.ref.slice('refs/heads/'.length)
        : update.ref;
      return {
        ok: true,
        updates: [{ ref: update.ref, branch, status: 'advanced' as const, newSha: update.newSha }],
      };
    },
  );

  // A merge spy that MUST never be invoked by any tool (V13 / Req 7.5–7.6).
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

  const triggerPipeline = vi.fn(async (_repoId: string, ref: string) => ({
    id: 'run-1',
    ref,
    status: 'RUNNING',
  }));
  const getRunStatus = vi.fn(async (runId: string) => ({
    runId,
    status: 'SUCCESS',
    branch: AGENT_BRANCH,
    jobs: [{ name: 'build', status: 'SUCCESS' }],
  }));

  const git = { pushRefs } as unknown as QuantCodeAgentToolDeps['git'];
  const pullRequests = { createPR, mergePR } as unknown as QuantCodeAgentToolDeps['pullRequests'];
  const mergeEligibility = {
    evaluateMergeEligibility,
  } as unknown as QuantCodeAgentToolDeps['mergeEligibility'];
  const pipelines = {
    triggerPipeline,
    getRunStatus,
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
    resolveBaseBranch: async () => DEFAULT_BRANCH,
    ...overrides,
  };

  return {
    deps,
    spies: {
      pushRefs,
      createPR,
      mergePR,
      evaluateMergeEligibility,
      triggerPipeline,
      getRunStatus,
    },
  };
}

// ===========================================================================
// V11 — Agent never exceeds the iteration bound (Requirement 7.3)
// ===========================================================================

describe('V11: agent never exceeds the iteration bound (Req 7.3)', () => {
  /**
   * The adversary: a loop that ALWAYS wants to act. It always selects a tool
   * and always reports a legal mutation on the agent branch with zero cost, so
   * the ONLY thing that can stop it is the iteration bound.
   */
  function alwaysActingLoop(): ToolExecutionLoop {
    const observation: Observation = {
      ok: true,
      output: { patched: true },
      tokensUsed: 1,
      costDelta: 0,
      mutatedFiles: ['a.ts'],
      mutatedBranch: AGENT_BRANCH,
    };
    return {
      selectTool: vi.fn(() => ({ toolName: 'edit_file', args: { path: 'a.ts' } })),
      execute: vi.fn(async () => observation),
    };
  }

  it('across an adversarial run, iterationCount <= maxIterations after every step and the session stops at the bound', async () => {
    const maxIterations = 5;
    const prisma = createMockPrisma(
      makeSession({ maxIterations, iterationCount: 0, costBudget: Number.MAX_SAFE_INTEGER }),
    );
    const loop = alwaysActingLoop();
    const runtime = new AgentRuntime(prisma as never, { loop });

    // Drive FAR more steps than the bound — the misbehaving loop never quits.
    let boundReached = false;
    let transcriptsAtStop = 0;
    for (let i = 0; i < maxIterations + 20; i++) {
      const result = await runtime.step('sess-1');

      // THE INVARIANT: never exceed the bound.
      expect(result.session.iterationCount).toBeLessThanOrEqual(maxIterations);

      if (!boundReached && result.session.iterationCount >= maxIterations) {
        boundReached = true;
        transcriptsAtStop = prisma._transcripts.length;
        expect(result.session.status).toBe('AWAITING_REVIEW');
      } else if (boundReached) {
        // Past the bound every further step is a pure no-op.
        expect(result.outcome).toBe('stopped');
        expect(result.session.status).toBe('AWAITING_REVIEW');
        expect(result.session.iterationCount).toBe(maxIterations);
        expect(prisma._transcripts.length).toBe(transcriptsAtStop);
      }
    }

    expect(boundReached).toBe(true);
    // The loop got to execute a tool at most `maxIterations` times — never more.
    expect((loop.execute as ReturnType<typeof vi.fn>).mock.calls.length).toBe(maxIterations);
    const final = await prisma.agentSession.findUnique({ where: { id: 'sess-1' } });
    expect(final?.iterationCount).toBe(maxIterations);
    expect(final?.status).toBe('AWAITING_REVIEW');
  });

  it('holds for any randomized bound and starting counter (no run pushes the counter past the bound)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }).chain((maxIterations) =>
          fc.record({
            maxIterations: fc.constant(maxIterations),
            initialCount: fc.integer({ min: 0, max: maxIterations }),
            extraSteps: fc.integer({ min: 5, max: 30 }),
          }),
        ),
        async ({ maxIterations, initialCount, extraSteps }) => {
          const prisma = createMockPrisma(
            makeSession({
              maxIterations,
              iterationCount: initialCount,
              costBudget: Number.MAX_SAFE_INTEGER,
            }),
          );
          const loop = alwaysActingLoop();
          const runtime = new AgentRuntime(prisma as never, { loop });

          for (let i = 0; i < maxIterations + extraSteps; i++) {
            const result = await runtime.step('sess-1');
            expect(result.session.iterationCount).toBeLessThanOrEqual(maxIterations);
          }

          const final = await prisma.agentSession.findUnique({ where: { id: 'sess-1' } });
          expect(final?.iterationCount).toBe(maxIterations);
          expect(final?.status).toBe('AWAITING_REVIEW');
          // Tool executions are capped by the remaining headroom, not step count.
          expect((loop.execute as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
            maxIterations - initialCount,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ===========================================================================
// V12 — Agent never writes to the base branch (Requirement 7.2)
// ===========================================================================

describe('V12: agent never writes to the base branch (Req 7.2)', () => {
  it('edit_file derives its push ref from the agent branch ONLY — git.pushRefs never targets refs/heads/<defaultBranch>', async () => {
    const { deps, spies } = buildToolDeps();
    const editFile = getTool(createQuantCodeAgentTools(deps), 'edit_file');

    // Even when the planner tries to smuggle a base-branch arg, the tool ignores
    // it and derives the ref from the agent scope only.
    await editFile.handler(
      { path: 'src/a.ts', content: 'export const a = 1;\n', ref: `refs/heads/${DEFAULT_BRANCH}` },
      agentContext(),
    );
    await editFile.handler({ path: 'src/b.ts', content: 'b' }, agentContext());

    expect(spies.pushRefs).toHaveBeenCalledTimes(2);
    for (const call of spies.pushRefs.mock.calls) {
      const refUpdates = call[2] as Array<{ ref: string }>;
      for (const update of refUpdates) {
        expect(update.ref).toBe(`refs/heads/${AGENT_BRANCH}`);
        expect(update.ref).not.toBe(`refs/heads/${DEFAULT_BRANCH}`);
        expect(update.ref).not.toContain(DEFAULT_BRANCH);
      }
    }
  });

  it('edit_file reports mutatedBranch == the agent branch (so the runtime isolation guard passes)', async () => {
    const { deps } = buildToolDeps();
    const editFile = getTool(createQuantCodeAgentTools(deps), 'edit_file');

    const result = await editFile.handler({ path: 'src/a.ts', content: 'x' }, agentContext());
    const data = result.data as { mutatedBranch?: string };
    expect(data.mutatedBranch).toBe(AGENT_BRANCH);
    expect(data.mutatedBranch).not.toBe(DEFAULT_BRANCH);
  });

  it('the runtime FAILS CLOSED (409) and marks the session FAILED when a tool reports a mutation off the agent branch', async () => {
    const prisma = createMockPrisma(makeSession());
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
    // The counter did NOT advance for the rejected off-branch mutation.
    expect(session?.iterationCount).toBe(0);
    // The rejection is auditable.
    expect(prisma._transcripts[0].payload).toMatchObject({ rejected: true });
  });

  it('the runtime accepts a mutation confined to the agent branch (no false positive)', async () => {
    const prisma = createMockPrisma(makeSession());
    const loop = loopReturning({ ok: true, mutatedFiles: ['a.ts'], mutatedBranch: AGENT_BRANCH });
    const runtime = new AgentRuntime(prisma as never, { loop });

    const result = await runtime.step('sess-1');
    expect(result.outcome).toBe('executed');
    expect(result.session.status).toBe('RUNNING');
    expect(result.session.iterationCount).toBe(1);
  });
});

// ===========================================================================
// V13 — Tool side-effects confined to QuantCode scoped APIs (Requirement 7.6)
// ===========================================================================

describe('V13: tool side-effects confined to QuantCode scoped APIs (Req 7.6)', () => {
  it('every mutating tool acts ONLY through the injected QuantCode services, and no merge API is ever invoked', async () => {
    const { deps, spies } = buildToolDeps();
    const tools = createQuantCodeAgentTools(deps);

    // edit_file → GitService.pushRefs (agent branch).
    await getTool(tools, 'edit_file').handler({ path: 'a.ts', content: 'x' }, agentContext());
    // open_pr → PullRequestService.createPR + MergeEligibilityService (read-only).
    await getTool(tools, 'open_pr').handler({ title: 'Fix flaky test' }, agentContext());
    // run_ci → PipelineService.triggerPipeline + getRunStatus.
    await getTool(tools, 'run_ci').handler({}, agentContext());

    // Side-effects flowed ONLY through the scoped QuantCode services.
    expect(spies.pushRefs).toHaveBeenCalledTimes(1);
    expect(spies.createPR).toHaveBeenCalledTimes(1);
    expect(spies.triggerPipeline).toHaveBeenCalledTimes(1);
    expect(spies.getRunStatus).toHaveBeenCalledTimes(1);
    expect(spies.evaluateMergeEligibility).toHaveBeenCalledTimes(1);

    // The scoped writes targeted the agent branch / repo only.
    expect(spies.pushRefs.mock.calls[0][2][0].ref).toBe(`refs/heads/${AGENT_BRANCH}`);
    expect(spies.createPR).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBranch: AGENT_BRANCH, targetBranch: DEFAULT_BRANCH }),
    );
    expect(spies.triggerPipeline.mock.calls[0][1]).toBe(`refs/heads/${AGENT_BRANCH}`);

    // CRITICAL: no tool ever reaches a merge API — the merge stays a human action.
    expect(spies.mergePR).not.toHaveBeenCalled();
  });

  it('open_pr never merges even when the merge decision is mergeable: true', async () => {
    const { deps, spies } = buildToolDeps();
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
    const data = result.data as { status?: string; done?: boolean };
    expect(result.success).toBe(true);
    expect(data.status).toBe('OPEN'); // still OPEN, not merged
    expect(data.done).toBe(true); // parked for human review
    expect(spies.mergePR).not.toHaveBeenCalled();
  });

  it('a scope-less tool invocation fails closed (MISSING_AGENT_SCOPE) with NO side effect', async () => {
    const { deps, spies } = buildToolDeps();
    const tools = createQuantCodeAgentTools(deps);
    const noScope = agentContext({ crossAppState: {} });

    for (const name of ['read_file', 'search_repo', 'edit_file', 'open_pr', 'run_ci']) {
      const args =
        name === 'edit_file'
          ? { path: 'a.ts', content: 'x' }
          : name === 'open_pr'
            ? { title: 'Fix' }
            : name === 'read_file'
              ? { path: 'a.ts' }
              : name === 'search_repo'
                ? { query: 'x' }
                : {};
      const result = await getTool(tools, name).handler(args, noScope);
      expect(result.success).toBe(false);
      expect(result.error).toBe('MISSING_AGENT_SCOPE');
    }

    // Failing closed means NONE of the scoped services were touched.
    expect(spies.pushRefs).not.toHaveBeenCalled();
    expect(spies.createPR).not.toHaveBeenCalled();
    expect(spies.triggerPipeline).not.toHaveBeenCalled();
    expect(spies.getRunStatus).not.toHaveBeenCalled();
    expect(spies.evaluateMergeEligibility).not.toHaveBeenCalled();
    expect(spies.mergePR).not.toHaveBeenCalled();
  });
});
