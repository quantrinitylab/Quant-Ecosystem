// @vitest-environment node
// ============================================================================
// Task 12.3 — Property test: iteration bound is never exceeded
// quantmail-superhub · Phase 4 — Claude Code / Codex Agentic Layer (Pillar 3)
// ============================================================================
//
// Feature: quantmail-superhub, Property 3: agent iterationCount never exceeds maxIterations
//
// **Property P3 (bounded autonomy)** — for any session config and any run
// length, `iterationCount <= maxIterations` ALWAYS holds and the session stops
// at the bound. Equivalently: driving `AgentRuntime.step()` arbitrarily many
// more times than `maxIterations` against a MISBEHAVING loop that always wants
// to act (always selects a tool, always mutates the agent branch) can never
// push the counter past the bound; once the bound is reached the session is
// stopped (status AWAITING_REVIEW), no further tool executes, and no further
// transcript entry is appended.
//
// **Validates: Requirements 7.3**
//
// HARNESS: tests the REAL `AgentRuntime.step()` implementation from task 12.2
// (`modules/agent/services/agent-runtime.service.ts`). The only seams are the
// injected in-memory prisma double (sessions + transcripts) and the injected
// tool-execution loop — both modeled exactly on the conventions in the existing
// `agent-runtime-step.service.test.ts`. No mocks of the runtime itself, no
// network. Library: fast-check, >= 100 runs per property (the ecosystem's JS
// property-testing tool).

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { AgentRuntime } from '../modules/agent/services/agent-runtime.service';
import type {
  ToolExecutionLoop,
  Observation,
} from '../modules/agent/services/tool-execution-loop';

// ---------------------------------------------------------------------------
// Stateful in-memory prisma double (sessions + transcripts) — same shape as
// the existing step test's `createMockPrisma`.
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

const SESSION_ID = 'sess-p3';
const BRANCH_REF = `agent/${SESSION_ID}`;

/**
 * The adversary: a loop that ALWAYS wants to act. It always selects a tool and
 * its execution always reports a (legal) mutation on the agent branch. With
 * `costDelta: 0` and a generous cost budget, the ONLY thing that can ever stop
 * this loop is the iteration bound — which is exactly what P3 asserts.
 */
function alwaysActingLoop(): ToolExecutionLoop {
  const observation: Observation = {
    ok: true,
    output: { patched: true },
    tokensUsed: 1,
    costDelta: 0,
    mutatedFiles: ['a.ts'],
    mutatedBranch: BRANCH_REF,
  };
  return {
    selectTool: vi.fn(() => ({ toolName: 'edit_file', args: { path: 'a.ts' } })),
    execute: vi.fn(async () => observation),
  };
}

function makeSession(maxIterations: number, iterationCount: number): SessionRow {
  return {
    id: SESSION_ID,
    userId: 'owner-1',
    repoId: 'repo-1',
    instruction: 'keep editing forever',
    // Start RUNNING so the only stop condition under test is the bound.
    status: 'RUNNING',
    branchRef: BRANCH_REF,
    maxIterations,
    iterationCount,
    // Generous, non-binding cost budget so cost can never stop the loop first.
    costBudget: Number.MAX_SAFE_INTEGER,
    costSpent: 0,
    linkedPrId: null,
  };
}

describe('Feature: quantmail-superhub, Property 3: agent iterationCount never exceeds maxIterations', () => {
  // P3 core: for randomized bound + initial counter, drive step() many more
  // times than the bound. After EVERY step the invariant holds; once the bound
  // is reached the session is stopped and runs nothing further.
  it('iterationCount <= maxIterations after every step, and the session stops at the bound (Req 7.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // maxIterations in 1..20
        fc.integer({ min: 1, max: 20 }).chain((maxIterations) =>
          fc.record({
            maxIterations: fc.constant(maxIterations),
            // randomized initial iterationCount within the valid [0..max] range
            initialCount: fc.integer({ min: 0, max: maxIterations }),
            // drive MANY more steps than the bound (at least maxIterations + 5)
            extraSteps: fc.integer({ min: 5, max: 40 }),
          }),
        ),
        async ({ maxIterations, initialCount, extraSteps }) => {
          const prisma = createMockPrisma(makeSession(maxIterations, initialCount));
          const loop = alwaysActingLoop();
          const runtime = new AgentRuntime(prisma as never, { loop });

          const totalSteps = maxIterations + extraSteps; // strictly > maxIterations
          let boundReached = false;
          let transcriptsAtStop = 0;

          for (let i = 0; i < totalSteps; i++) {
            const result = await runtime.step(SESSION_ID);

            // === THE INVARIANT (Req 7.3): never exceed the bound ===========
            expect(result.session.iterationCount).toBeLessThanOrEqual(maxIterations);

            if (!boundReached) {
              if (result.session.iterationCount >= maxIterations) {
                // First moment the bound is reached: the session must be stopped
                // for human review.
                boundReached = true;
                transcriptsAtStop = prisma._transcripts.length;
                expect(result.session.status).toBe('AWAITING_REVIEW');
              }
            } else {
              // Already at the bound: every further step is a pure no-op.
              expect(result.outcome).toBe('stopped');
              expect(result.session.status).toBe('AWAITING_REVIEW');
              expect(result.session.iterationCount).toBe(maxIterations);
              // No extra tool executed and no transcript appended past the stop.
              expect(prisma._transcripts.length).toBe(transcriptsAtStop);
            }
          }

          // Having driven > maxIterations steps, the bound is always reached and
          // the counter settles exactly at the bound.
          expect(boundReached).toBe(true);
          const finalSession = await prisma.agentSession.findUnique({ where: { id: SESSION_ID } });
          expect(finalSession?.iterationCount).toBe(maxIterations);
          expect(finalSession?.status).toBe('AWAITING_REVIEW');
        },
      ),
      { numRuns: 200 },
    );
  });

  // P3 corollary: the number of tool EXECUTIONS the misbehaving loop ever gets
  // to perform is capped by the remaining headroom (maxIterations - initial),
  // regardless of how many times step() is called. The bound is a hard ceiling
  // on real work, not merely on the counter value.
  it('the loop executes a tool at most (maxIterations - initialCount) times no matter how often step() is called (Req 7.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }).chain((maxIterations) =>
          fc.record({
            maxIterations: fc.constant(maxIterations),
            initialCount: fc.integer({ min: 0, max: maxIterations }),
            extraSteps: fc.integer({ min: 5, max: 40 }),
          }),
        ),
        async ({ maxIterations, initialCount, extraSteps }) => {
          const prisma = createMockPrisma(makeSession(maxIterations, initialCount));
          const loop = alwaysActingLoop();
          const runtime = new AgentRuntime(prisma as never, { loop });

          const totalSteps = maxIterations + extraSteps;
          for (let i = 0; i < totalSteps; i++) {
            await runtime.step(SESSION_ID);
          }

          const headroom = maxIterations - initialCount;
          // The tool was executed exactly `headroom` times (each successful
          // iteration advanced the counter by one until the bound), and never
          // more — even though step() was called strictly more than that.
          expect(loop.execute).toHaveBeenCalledTimes(headroom);
          // Exactly one auditable transcript entry per executed iteration.
          expect(prisma._transcripts.length).toBe(headroom);
        },
      ),
      { numRuns: 200 },
    );
  });
});
