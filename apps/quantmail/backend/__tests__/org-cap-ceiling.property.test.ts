// @vitest-environment node
// ============================================================================
// Task 21.2 — Property test: org caps are never exceeded
// quantmail-superhub · Phase 6 — Agent Company OS (Pillar 6)
// ============================================================================
//
// Feature: quantmail-superhub, Property 6: org costSpent <= budgetCap and totalIterations <= maxIterations
//
// **Property P6 (org budget/iteration ceiling)** — for ANY supervision run,
// `org.costSpent <= budgetCap` and `org.totalIterations <= maxIterations`
// ALWAYS hold. No matter how much the workforce has spent, how high the prior
// org counters already are, or how many agent-bus messages were observed in the
// tick, a `supervise` pass reconciles + CLAMPS the org caps so neither ceiling
// can ever be breached — and the clamped values it returns are exactly the
// values it persists.
//
// **Validates: Requirements 13.1, 13.2**
//
// HARNESS: tests the REAL `CompanyOrchestrator.supervise()` implementation from
// task 21.1 (`modules/company/services/company-orchestrator.service.ts`),
// consumed through the company module barrel (`modules/company`). The only
// seams are an injected stateful in-memory Prisma double (orgs + workers), an
// injected fake `AgentEmailBus` (only `observe` is exercised, exactly as the
// real `supervise` uses it), and a no-op identity provisioner — all modeled on
// the conventions in `company-orchestrator-supervise.service.test.ts`. No live
// `@quant/ai`, no network, no real database, no real mail pipeline. Library:
// fast-check, >= 100 runs per property (the ecosystem's JS property-testing
// tool).

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { CompanyOrchestrator } from '../modules/company';
import type {
  AgentBusMessage,
  AgentBusMsgType,
} from '../modules/company/services/agent-email-bus';
import type { AgentIdentityProvisioner } from '../modules/company/services/agent-identity-provisioner';

// ---------------------------------------------------------------------------
// Stateful in-memory prisma double (orgs + workers) — same shape as the
// supervise unit test's `createMockPrisma`, but PERSISTS updates so a series of
// supervise passes can be driven against one evolving org row.
// ---------------------------------------------------------------------------

interface OrgRow {
  id: string;
  ceoUserId: string;
  tenantId: string;
  goalText: string;
  status: string;
  workspaceRepoId: string | null;
  budgetCap: number;
  costSpent: number;
  maxIterations: number;
  totalIterations: number;
}

interface WorkerRow {
  id: string;
  orgId: string;
  tenantId: string;
  role: string;
  modelRef: string;
  mailboxIdentityId: string | null;
  toolScope: unknown;
  status: string;
  budgetShare: number;
  costSpent: number;
}

function createStatefulPrisma(org: OrgRow, workers: WorkerRow[]) {
  const orgs = new Map<string, OrgRow>([[org.id, { ...org }]]);
  const workerRows = new Map<string, WorkerRow>(workers.map((w) => [w.id, { ...w }]));
  const orgUpdates: Array<Record<string, unknown>> = [];

  return {
    orgUpdates,
    agentOrg: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = orgs.get(where.id);
        return row ? { ...row } : null;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<OrgRow> }) => {
          const row = orgs.get(where.id);
          if (!row) throw new Error('org not found');
          const next = { ...row, ...data };
          orgs.set(where.id, next);
          orgUpdates.push(data);
          return { ...next };
        },
      ),
    },
    agentWorker: {
      findMany: vi.fn(async () => Array.from(workerRows.values()).map((w) => ({ ...w }))),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Partial<WorkerRow> }) => {
          const row = workerRows.get(where.id);
          if (!row) throw new Error('worker not found');
          const next = { ...row, ...data };
          workerRows.set(where.id, next);
          return { ...next };
        },
      ),
    },
  };
}

/** A fake email bus exposing only `observe` (the surface `supervise` uses). */
function fakeBus(messages: AgentBusMessage[]) {
  return { observe: vi.fn(async (_orgId: string) => messages) };
}

/** A no-op identity provisioner (revoke is recorded but irrelevant to P6). */
function noopProvisioner(): AgentIdentityProvisioner {
  return {
    provision: () => ({ mailboxIdentityId: 'x', address: 'x@agents.local' }),
    revoke: () => {},
  };
}

const ALL_MSG_TYPES: AgentBusMsgType[] = [
  'task_assign',
  'pr_ready',
  'change_request',
  'ci_result',
  'status',
  'escalation',
  'done',
];

const WORKER_STATUSES = ['SPAWNING', 'ACTIVE', 'PAUSED', 'RETIRED'];

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** A worker row generator, parameterized by the (already chosen) budget cap. */
function workerArb(budgetCap: number) {
  return fc.record({
    // costSpent can range above the cap to stress the org-cap clamp.
    costSpent: fc.integer({ min: 0, max: Math.max(1, budgetCap) * 2 }),
    budgetShare: fc.integer({ min: 0, max: Math.max(1, budgetCap) }),
    status: fc.constantFrom(...WORKER_STATUSES),
    role: fc.constantFrom('CODER', 'REVIEWER', 'TESTER', 'PLANNER', 'DEBUGGER'),
  });
}

/** A bus-message generator over a pool of possible sender ids. */
function messageArb(senderPool: string[]) {
  return fc.record({
    fromWorkerId: fc.constantFrom(...senderPool),
    msgType: fc.constantFrom(...ALL_MSG_TYPES),
    workItemId: fc.constantFrom('wi-1', 'wi-2', 'wi-3', 'wi-4'),
  });
}

function buildMessage(
  fromWorkerId: string,
  msgType: AgentBusMsgType,
  workItemId: string,
  i: number,
): AgentBusMessage {
  return {
    emailId: `e-${i}`,
    orgId: 'org-p6',
    threadId: `t-${workItemId}`,
    workItemId,
    fromWorkerId,
    fromRole: 'coder',
    toWorkerIds: ['planner-1'],
    msgType,
    artifacts: [],
  };
}

/**
 * The full randomized supervision scenario: caps, the prior org counters (which
 * may already sit above the caps to stress the clamp), a workforce, and an
 * observed agent-bus message burst.
 */
const scenarioArb = fc
  .record({
    budgetCap: fc.integer({ min: 1, max: 5000 }),
    maxIterations: fc.integer({ min: 1, max: 300 }),
  })
  .chain(({ budgetCap, maxIterations }) =>
    fc
      .record({
        workers: fc.array(workerArb(budgetCap), { minLength: 0, maxLength: 8 }),
      })
      .chain(({ workers }) => {
        const workerIds = workers.map((_, i) => `w${i}`);
        // Senders are drawn from real worker ids plus a couple of unknown ids
        // (messages from non-workforce senders must not break the invariants).
        const senderPool = workerIds.length > 0 ? [...workerIds, 'ghost-1'] : ['ghost-1'];
        return fc.record({
          budgetCap: fc.constant(budgetCap),
          maxIterations: fc.constant(maxIterations),
          // Prior counters can START above the caps — the clamp must fix it.
          priorCostSpent: fc.integer({ min: 0, max: budgetCap * 2 }),
          priorTotalIterations: fc.integer({ min: 0, max: maxIterations * 2 }),
          workers: fc.constant(workers),
          messages: fc.array(messageArb(senderPool), { minLength: 0, maxLength: 400 }),
        });
      }),
  );

function makeScenario(s: {
  budgetCap: number;
  maxIterations: number;
  priorCostSpent: number;
  priorTotalIterations: number;
  workers: Array<{ costSpent: number; budgetShare: number; status: string; role: string }>;
  messages: Array<{ fromWorkerId: string; msgType: AgentBusMsgType; workItemId: string }>;
}) {
  const org: OrgRow = {
    id: 'org-p6',
    ceoUserId: 'ceo-1',
    tenantId: 'tenant-1',
    goalText: 'ship it',
    status: 'RUNNING',
    workspaceRepoId: 'repo-1',
    budgetCap: s.budgetCap,
    costSpent: s.priorCostSpent,
    maxIterations: s.maxIterations,
    totalIterations: s.priorTotalIterations,
  };
  const workers: WorkerRow[] = s.workers.map((w, i) => ({
    id: `w${i}`,
    orgId: 'org-p6',
    tenantId: 'tenant-1',
    role: w.role,
    modelRef: 'claude-sonnet-4',
    mailboxIdentityId: `id-w${i}`,
    toolScope: [],
    status: w.status,
    budgetShare: w.budgetShare,
    costSpent: w.costSpent,
  }));
  const messages = s.messages.map((m, i) =>
    buildMessage(m.fromWorkerId, m.msgType, m.workItemId, i),
  );
  return { org, workers, messages };
}

// ===========================================================================

describe('Feature: quantmail-superhub, Property 6: org costSpent <= budgetCap and totalIterations <= maxIterations', () => {
  // P6 core: a single supervise pass NEVER reports (nor persists) an org spend
  // above the budget cap or an iteration count above the iteration cap — for
  // any workforce spend, any prior counters, and any observed bus burst.
  it('a single supervise pass keeps costSpent <= budgetCap and totalIterations <= maxIterations (Req 13.1, 13.2)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const { org, workers, messages } = makeScenario(s);
        const prisma = createStatefulPrisma(org, workers);
        const orchestrator = new CompanyOrchestrator(prisma as never, {
          emailBus: fakeBus(messages) as never,
          identityProvisioner: noopProvisioner(),
        });

        const tick = await orchestrator.supervise('org-p6');

        // === THE INVARIANTS (Req 13.1, 13.2) ===============================
        expect(tick.costSpent).toBeLessThanOrEqual(tick.budgetCap);
        expect(tick.costSpent).toBeGreaterThanOrEqual(0);
        expect(tick.totalIterations).toBeLessThanOrEqual(tick.maxIterations);
        expect(tick.totalIterations).toBeGreaterThanOrEqual(0);

        // The caps echoed on the tick are the org's configured caps.
        expect(tick.budgetCap).toBe(s.budgetCap);
        expect(tick.maxIterations).toBe(s.maxIterations);

        // Whatever was PERSISTED must respect the caps too (clamp is durable).
        for (const data of prisma.orgUpdates) {
          if (typeof data.costSpent === 'number') {
            expect(data.costSpent).toBeLessThanOrEqual(s.budgetCap);
            expect(data.costSpent).toBeGreaterThanOrEqual(0);
          }
          if (typeof data.totalIterations === 'number') {
            expect(data.totalIterations).toBeLessThanOrEqual(s.maxIterations);
            expect(data.totalIterations).toBeGreaterThanOrEqual(0);
          }
        }

        // The reload of the org reflects the clamped (capped) state.
        const reloaded = await prisma.agentOrg.findUnique({ where: { id: 'org-p6' } });
        expect(reloaded?.costSpent).toBeLessThanOrEqual(s.budgetCap);
        expect(reloaded?.totalIterations).toBeLessThanOrEqual(s.maxIterations);
      }),
      { numRuns: 200 },
    );
  });

  // P6 durability: repeatedly supervising the SAME evolving org (re-observing
  // ever-larger bus bursts) can never push the persisted counters past the caps.
  // The ceilings are stable across an arbitrary number of passes.
  it('the caps hold across an arbitrary number of supervise passes on the same org (Req 13.1, 13.2)', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        fc.integer({ min: 2, max: 6 }),
        async (s, passes) => {
          const { org, workers, messages } = makeScenario(s);
          const prisma = createStatefulPrisma(org, workers);

          for (let p = 0; p < passes; p++) {
            // Each pass observes a growing burst (still bounded) to push the
            // iteration signal monotonically upward toward / past the cap.
            const burst = messages.concat(
              Array.from({ length: p * 50 }, (_, i) =>
                buildMessage('ghost-1', 'status', 'wi-1', 10_000 + i),
              ),
            );
            const orchestrator = new CompanyOrchestrator(prisma as never, {
              emailBus: fakeBus(burst) as never,
              identityProvisioner: noopProvisioner(),
            });

            const tick = await orchestrator.supervise('org-p6');

            expect(tick.costSpent).toBeLessThanOrEqual(tick.budgetCap);
            expect(tick.totalIterations).toBeLessThanOrEqual(tick.maxIterations);

            const reloaded = await prisma.agentOrg.findUnique({ where: { id: 'org-p6' } });
            expect(reloaded?.costSpent).toBeLessThanOrEqual(s.budgetCap);
            expect(reloaded?.totalIterations).toBeLessThanOrEqual(s.maxIterations);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
