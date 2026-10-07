// ============================================================================
// quantmail-superhub · Task 12.2 — AgentRuntime.step tool-execution loop
// (Requirements 7.2, 7.3, 7.4)
// ============================================================================
//
// Covers ONE iteration of the bounded plan→act loop and its invariants:
//   * 7.3 BOUNDED AUTONOMY — iterationCount <= maxIterations always; the session
//     stops (AWAITING_REVIEW) when the bound is reached and runs no extra tool.
//   * 7.2 BRANCH ISOLATION — a tool that mutates off the agent branch fails
//     closed (409) and marks the session FAILED.
//   * 7.4 AUDITABILITY — every executed step appends a monotonic AgentTranscript
//     entry with the tool name, payload, and tokens used.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRuntime } from '../modules/agent/services/agent-runtime.service';
import type {
  ToolExecutionLoop,
  ToolCall,
  Observation,
  AgentStepState,
} from '../modules/agent/services/tool-execution-loop';

// ---------------------------------------------------------------------------
// Stateful in-memory prisma double (sessions + transcripts)
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

const BASE_SESSION: SessionRow = {
  id: 'sess-1',
  userId: 'owner-1',
  repoId: 'repo-1',
  instruction: 'fix the failing test',
  status: 'PLANNING',
  branchRef: 'agent/sess-1',
  maxIterations: 3,
  iterationCount: 0,
  costBudget: 100,
  costSpent: 0,
  linkedPrId: null,
};

/** A loop that always selects the same tool and returns a fixed observation. */
function fixedLoop(observation: Observation, call?: ToolCall): ToolExecutionLoop {
  return {
    selectTool: vi.fn(() => call ?? { toolName: 'edit_file', args: { path: 'a.ts' } }),
    execute: vi.fn(async () => observation),
  };
}

describe('AgentRuntime.step (Requirements 7.2, 7.3, 7.4)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma(BASE_SESSION);
  });

  it('executes one iteration: appends a transcript entry, advances the counter, and goes RUNNING', async () => {
    const loop = fixedLoop({
      ok: true,
      output: { patched: true },
      tokensUsed: 42,
      costDelta: 5,
      mutatedFiles: ['a.ts'],
      mutatedBranch: 'agent/sess-1',
    });
    const runtime = new AgentRuntime(prisma as never, { loop });

    const result = await runtime.step('sess-1');

    expect(result.outcome).toBe('executed');
    expect(result.session.iterationCount).toBe(1);
    expect(result.session.costSpent).toBe(5);
    expect(result.session.status).toBe('RUNNING');
    // 7.4: one auditable transcript entry with tool name + tokens.
    expect(prisma._transcripts).toHaveLength(1);
    expect(prisma._transcripts[0]).toMatchObject({
      seq: 1,
      role: 'TOOL_CALL',
      toolName: 'edit_file',
      tokensUsed: 42,
    });
  });

  it('stops at the bound without running a tool when iterationCount == maxIterations (Req 7.3)', async () => {
    prisma._sessions.set('sess-1', {
      ...BASE_SESSION,
      status: 'RUNNING',
      iterationCount: 3,
      maxIterations: 3,
    });
    const loop = fixedLoop({ ok: true });
    const runtime = new AgentRuntime(prisma as never, { loop });

    const result = await runtime.step('sess-1');

    expect(result.outcome).toBe('stopped');
    expect(result.reason).toBe('maxIterations reached');
    expect(result.session.status).toBe('AWAITING_REVIEW');
    // No tool ran, no transcript appended.
    expect(loop.selectTool).not.toHaveBeenCalled();
    expect(loop.execute).not.toHaveBeenCalled();
    expect(prisma._transcripts).toHaveLength(0);
  });

  it('stops the session when the final allowed iteration reaches the bound', async () => {
    prisma._sessions.set('sess-1', {
      ...BASE_SESSION,
      status: 'RUNNING',
      iterationCount: 2,
      maxIterations: 3,
    });
    const loop = fixedLoop({ ok: true, mutatedBranch: 'agent/sess-1' });
    const runtime = new AgentRuntime(prisma as never, { loop });

    const result = await runtime.step('sess-1');

    expect(result.session.iterationCount).toBe(3);
    expect(result.outcome).toBe('stopped');
    expect(result.session.status).toBe('AWAITING_REVIEW');
  });

  it('INVARIANT: iterationCount never exceeds maxIterations across a full run (Req 7.3)', async () => {
    // Drive the loop to exhaustion; a misbehaving loop always wants to act.
    prisma._sessions.set('sess-1', { ...BASE_SESSION, status: 'RUNNING', maxIterations: 5 });
    const loop = fixedLoop({ ok: true, mutatedBranch: 'agent/sess-1', tokensUsed: 1 });
    const runtime = new AgentRuntime(prisma as never, { loop });

    for (let i = 0; i < 20; i++) {
      const result = await runtime.step('sess-1');
      // The bound holds after every single step.
      expect(result.session.iterationCount).toBeLessThanOrEqual(5);
    }

    const finalSession = await prisma.agentSession.findUnique({ where: { id: 'sess-1' } });
    expect(finalSession?.iterationCount).toBe(5);
    expect(finalSession?.status).toBe('AWAITING_REVIEW');
  });

  it('FAILS CLOSED when a tool mutates a branch other than the agent branch (Req 7.2)', async () => {
    const loop = fixedLoop({
      ok: true,
      mutatedFiles: ['README.md'],
      mutatedBranch: 'main', // off the agent branch
    });
    const runtime = new AgentRuntime(prisma as never, { loop });

    await expect(runtime.step('sess-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'BRANCH_ISOLATION_VIOLATION',
    });

    const session = await prisma.agentSession.findUnique({ where: { id: 'sess-1' } });
    expect(session?.status).toBe('FAILED');
    // The counter did NOT advance for the rejected mutation.
    expect(session?.iterationCount).toBe(0);
    // The rejection is auditable.
    expect(prisma._transcripts[0]).toMatchObject({
      role: 'OBSERVATION',
      toolName: 'edit_file',
    });
    expect(prisma._transcripts[0].payload).toMatchObject({ rejected: true });
  });

  it('finalizes for human review when the loop selects no tool', async () => {
    const loop: ToolExecutionLoop = {
      selectTool: vi.fn(() => null),
      execute: vi.fn(),
    };
    const runtime = new AgentRuntime(prisma as never, { loop });

    const result = await runtime.step('sess-1');

    expect(result.outcome).toBe('completed');
    expect(result.session.status).toBe('AWAITING_REVIEW');
    expect(loop.execute).not.toHaveBeenCalled();
    expect(prisma._transcripts[0]).toMatchObject({ role: 'MESSAGE', toolName: null });
  });

  it('is a no-op that reports stopped for an already-terminal session', async () => {
    prisma._sessions.set('sess-1', { ...BASE_SESSION, status: 'DONE' });
    const loop = fixedLoop({ ok: true });
    const runtime = new AgentRuntime(prisma as never, { loop });

    const result = await runtime.step('sess-1');

    expect(result.outcome).toBe('stopped');
    expect(loop.selectTool).not.toHaveBeenCalled();
    expect(prisma._transcripts).toHaveLength(0);
  });

  it('stops when the cost budget is exhausted', async () => {
    prisma._sessions.set('sess-1', {
      ...BASE_SESSION,
      status: 'RUNNING',
      costBudget: 10,
      costSpent: 8,
    });
    const loop = fixedLoop({ ok: true, costDelta: 5, mutatedBranch: 'agent/sess-1' });
    const runtime = new AgentRuntime(prisma as never, { loop });

    const result = await runtime.step('sess-1');

    expect(result.session.costSpent).toBe(13);
    expect(result.outcome).toBe('stopped');
    expect(result.reason).toBe('cost budget exhausted');
    expect(result.session.status).toBe('AWAITING_REVIEW');
  });

  it('records monotonically increasing transcript seq across steps', async () => {
    prisma._sessions.set('sess-1', { ...BASE_SESSION, status: 'RUNNING', maxIterations: 10 });
    const loop = fixedLoop({ ok: true, mutatedBranch: 'agent/sess-1' });
    const runtime = new AgentRuntime(prisma as never, { loop });

    await runtime.step('sess-1');
    await runtime.step('sess-1');
    await runtime.step('sess-1');

    const seqs = prisma._transcripts.map((t) => t.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  it('passes the isolated branch and bound to the loop via step state', async () => {
    let seen: AgentStepState | undefined;
    const loop: ToolExecutionLoop = {
      selectTool: vi.fn((state: AgentStepState) => {
        seen = state;
        return { toolName: 'read_file', args: {} };
      }),
      execute: vi.fn(async () => ({ ok: true })),
    };
    const runtime = new AgentRuntime(prisma as never, { loop });

    await runtime.step('sess-1');

    expect(seen?.branchRef).toBe('agent/sess-1');
    expect(seen?.maxIterations).toBe(3);
    expect(seen?.iterationCount).toBe(0);
  });

  it('throws 404 when the session does not exist', async () => {
    const runtime = new AgentRuntime(prisma as never, { loop: fixedLoop({ ok: true }) });

    await expect(runtime.step('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'SESSION_NOT_FOUND',
    });
  });
});
