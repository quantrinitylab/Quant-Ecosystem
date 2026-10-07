// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 21.1 — Unit tests for CompanyOrchestrator.supervise
// (Requirements 12.5, 13.1, 13.2, 13.3, 13.4)
// ============================================================================
//
// Tests the REAL implementation from Task 21.1
// (`modules/company/services/company-orchestrator.service.ts`) against a mocked
// Prisma client, an injected fake `AgentEmailBus` (only `observe` is used), and
// a spy `AgentIdentityProvisioner` recording every `revoke`. No live `@quant/ai`
// engine, no network, no real database, no real mail pipeline.
//
// COVERAGE
//   - org cap reconciliation keeps costSpent <= budgetCap and totalIterations <=
//     maxIterations even when worker spend / message volume exceed them
//     (Req 13.1, 13.2 — the clamp);
//   - reaching the budget cap RETIRES every live worker and revokes its identity
//     (Req 13.3);
//   - reaching the iteration cap PAUSES every live worker (Req 13.3);
//   - an over-budget worker (own spend >= its share) is RETIRED (Req 13.4);
//   - a looping worker (repeated identical bus messages) is PAUSED (Req 13.4);
//   - a stalled worker (no recent progress) is PAUSED (Req 13.4);
//   - a healthy worker making progress is left untouched;
//   - already paused/retired workers are not re-actioned (idempotent);
//   - budget pressure is flagged on the tick (Req 12.5);
//   - a missing org throws 404 ORG_NOT_FOUND.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CompanyOrchestrator,
  type TenantOwnershipPort,
} from '../modules/company/services/company-orchestrator.service';
import type { AgentBusMessage, AgentBusMsgType } from '../modules/company/services/agent-email-bus';
import type { AgentIdentityProvisioner } from '../modules/company/services/agent-identity-provisioner';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

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

function worker(partial: Partial<WorkerRow> & { id: string }): WorkerRow {
  return {
    orgId: 'org-1',
    tenantId: 'tenant-1',
    role: 'CODER',
    modelRef: 'claude-sonnet-4',
    mailboxIdentityId: `ident-${partial.id}`,
    toolScope: [],
    status: 'ACTIVE',
    budgetShare: 100,
    costSpent: 0,
    ...partial,
  };
}

function createMockPrisma(opts: { org: Record<string, unknown> | null; workers: WorkerRow[] }) {
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  return {
    updates,
    agentOrg: {
      findUnique: vi.fn(async () => (opts.org ? { ...opts.org } : null)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: where.id,
        ...data,
      })),
    },
    agentWorker: {
      findMany: vi.fn(async () => opts.workers.map((w) => ({ ...w }))),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ where, data });
        return { id: where.id, ...data };
      }),
    },
  };
}

/** A fake email bus exposing only `observe` (the surface `supervise` uses). */
function fakeBus(messages: AgentBusMessage[]) {
  return { observe: vi.fn(async (_orgId: string) => messages) };
}

/** A spy identity provisioner that records every revoked identity id. */
function spyProvisioner(): AgentIdentityProvisioner & { revoked: string[] } {
  const revoked: string[] = [];
  return {
    revoked,
    provision: () => ({ mailboxIdentityId: 'x', address: 'x@agents.local' }),
    revoke: (id: string) => {
      revoked.push(id);
    },
  };
}

function ownership(): TenantOwnershipPort {
  return { resolveOwnedTenant: vi.fn(async () => 'tenant-1') };
}

function makeOrchestrator(opts: {
  prisma: ReturnType<typeof createMockPrisma>;
  bus: ReturnType<typeof fakeBus>;
  provisioner?: AgentIdentityProvisioner;
  supervision?: Record<string, number>;
}) {
  return new CompanyOrchestrator(opts.prisma as never, {
    tenantOwnership: ownership(),
    emailBus: opts.bus as never,
    identityProvisioner: opts.provisioner,
    supervision: opts.supervision,
  });
}

const ORG = {
  id: 'org-1',
  ceoUserId: 'ceo-1',
  tenantId: 'tenant-1',
  goalText: 'goal',
  status: 'RUNNING',
  workspaceRepoId: 'repo-1',
  budgetCap: 1000,
  costSpent: 0,
  maxIterations: 100,
  totalIterations: 0,
};

/** Build a bus message from a sender with a given type + work item. */
function msg(
  fromWorkerId: string,
  msgType: AgentBusMsgType,
  workItemId: string,
): AgentBusMessage {
  return {
    emailId: `e-${Math.random()}`,
    orgId: 'org-1',
    threadId: `t-${workItemId}`,
    workItemId,
    fromWorkerId,
    fromRole: 'coder',
    toWorkerIds: ['planner-1'],
    msgType,
    artifacts: [],
  };
}

// ===========================================================================

describe('CompanyOrchestrator.supervise', () => {
  let provisioner: ReturnType<typeof spyProvisioner>;

  beforeEach(() => {
    provisioner = spyProvisioner();
  });

  it('throws 404 ORG_NOT_FOUND when the org is missing', async () => {
    const prisma = createMockPrisma({ org: null, workers: [] });
    const orchestrator = makeOrchestrator({ prisma, bus: fakeBus([]), provisioner });
    await expect(orchestrator.supervise('missing')).rejects.toMatchObject({
      statusCode: 404,
      code: 'ORG_NOT_FOUND',
    });
  });

  it('keeps costSpent <= budgetCap and totalIterations <= maxIterations by clamping (Req 13.1, 13.2)', async () => {
    // Worker spend (1500) and message volume (way over) exceed the caps.
    const workers = [worker({ id: 'w1', costSpent: 800, budgetShare: 10_000 }), worker({ id: 'w2', costSpent: 700, budgetShare: 10_000 })];
    const messages = Array.from({ length: 250 }, (_, i) => msg('w1', 'status', `wi-${i}`));
    const prisma = createMockPrisma({ org: { ...ORG, maxIterations: 100 }, workers });
    const orchestrator = makeOrchestrator({ prisma, bus: fakeBus(messages), provisioner });

    const tick = await orchestrator.supervise('org-1');

    expect(tick.costSpent).toBeLessThanOrEqual(tick.budgetCap);
    expect(tick.costSpent).toBe(1000); // clamped to budgetCap
    expect(tick.totalIterations).toBeLessThanOrEqual(tick.maxIterations);
    expect(tick.totalIterations).toBe(100); // clamped to maxIterations
    expect(tick.budgetCapReached).toBe(true);
    // The persisted org row carries the clamped values too.
    const orgUpdate = prisma.agentOrg.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(orgUpdate.data.costSpent).toBe(1000);
    expect(orgUpdate.data.totalIterations).toBe(100);
  });

  it('RETIRES every live worker and revokes its identity when the budget cap is reached (Req 13.3)', async () => {
    const workers = [
      worker({ id: 'w1', costSpent: 600, budgetShare: 10_000, mailboxIdentityId: 'id-1' }),
      worker({ id: 'w2', costSpent: 600, budgetShare: 10_000, mailboxIdentityId: 'id-2' }),
    ];
    const prisma = createMockPrisma({ org: { ...ORG, budgetCap: 1000 }, workers });
    const orchestrator = makeOrchestrator({ prisma, bus: fakeBus([]), provisioner });

    const tick = await orchestrator.supervise('org-1');

    expect(tick.budgetCapReached).toBe(true);
    expect(tick.retiredWorkerIds.sort()).toEqual(['w1', 'w2']);
    expect(tick.pausedWorkerIds).toEqual([]);
    // Each retired worker's mailbox identity is revoked for audit.
    expect(provisioner.revoked.sort()).toEqual(['id-1', 'id-2']);
    // Both were flipped to RETIRED.
    const statuses = prisma.updates.map((u) => u.data.status);
    expect(statuses.every((s) => s === 'RETIRED')).toBe(true);
    expect(tick.actions.every((a) => a.action === 'retired' && a.reasons.includes('budget_cap'))).toBe(true);
  });

  it('PAUSES every live worker when the iteration cap is reached (Req 13.3)', async () => {
    const workers = [worker({ id: 'w1' }), worker({ id: 'w2' })];
    // 5 messages with maxIterations 5 → iteration cap reached, budget fine.
    const messages = [msg('w1', 'status', 'a'), msg('w1', 'status', 'b'), msg('w2', 'status', 'c'), msg('w2', 'status', 'd'), msg('w1', 'status', 'e')];
    const prisma = createMockPrisma({ org: { ...ORG, maxIterations: 5, budgetCap: 100_000 }, workers });
    const orchestrator = makeOrchestrator({ prisma, bus: fakeBus(messages), provisioner, supervision: { stallThreshold: 99, loopThreshold: 99 } });

    const tick = await orchestrator.supervise('org-1');

    expect(tick.iterationCapReached).toBe(true);
    expect(tick.budgetCapReached).toBe(false);
    expect(tick.pausedWorkerIds.sort()).toEqual(['w1', 'w2']);
    expect(tick.retiredWorkerIds).toEqual([]);
    expect(provisioner.revoked).toEqual([]);
    expect(prisma.updates.every((u) => u.data.status === 'PAUSED')).toBe(true);
  });

  it('RETIRES an over-budget worker (own spend >= its share) while sparing a healthy one (Req 13.4)', async () => {
    const workers = [
      worker({ id: 'spent', costSpent: 100, budgetShare: 100, mailboxIdentityId: 'id-spent' }), // over its share
      worker({ id: 'ok', costSpent: 10, budgetShare: 100 }),
    ];
    const prisma = createMockPrisma({ org: { ...ORG, budgetCap: 100_000 }, workers });
    const orchestrator = makeOrchestrator({ prisma, bus: fakeBus([]), provisioner });

    const tick = await orchestrator.supervise('org-1');

    expect(tick.budgetCapReached).toBe(false);
    expect(tick.retiredWorkerIds).toEqual(['spent']);
    expect(tick.pausedWorkerIds).toEqual([]);
    expect(provisioner.revoked).toEqual(['id-spent']);
    expect(tick.actions).toEqual([
      { workerId: 'spent', action: 'retired', reasons: ['over_budget'] },
    ]);
  });

  it('PAUSES a looping worker (repeated identical messages) (Req 13.4)', async () => {
    const workers = [worker({ id: 'loop' }), worker({ id: 'ok' })];
    // Same (msgType, workItemId) emitted 3x by `loop` → loop at default threshold 3.
    const messages = [
      msg('loop', 'status', 'wi-1'),
      msg('loop', 'status', 'wi-1'),
      msg('loop', 'status', 'wi-1'),
      msg('ok', 'pr_ready', 'wi-2'),
    ];
    const prisma = createMockPrisma({ org: { ...ORG, budgetCap: 100_000, maxIterations: 100_000 }, workers });
    const orchestrator = makeOrchestrator({ prisma, bus: fakeBus(messages), provisioner });

    const tick = await orchestrator.supervise('org-1');

    expect(tick.loopingWorkerIds).toEqual(['loop']);
    expect(tick.pausedWorkerIds).toEqual(['loop']);
    expect(tick.retiredWorkerIds).toEqual([]);
    const action = tick.actions.find((a) => a.workerId === 'loop');
    expect(action).toMatchObject({ action: 'paused' });
    expect(action?.reasons).toContain('loop');
  });

  it('PAUSES a stalled worker (no recent progress) and spares a worker making progress (Req 13.4)', async () => {
    const workers = [worker({ id: 'stall' }), worker({ id: 'busy' })];
    const messages = [
      // `stall`: 3 trailing non-progress (status) messages on distinct items → stalled, not a loop.
      msg('stall', 'status', 'a'),
      msg('stall', 'status', 'b'),
      msg('stall', 'status', 'c'),
      // `busy`: ends on a progress message → not stalled.
      msg('busy', 'status', 'd'),
      msg('busy', 'status', 'e'),
      msg('busy', 'pr_ready', 'f'),
    ];
    const prisma = createMockPrisma({ org: { ...ORG, budgetCap: 100_000, maxIterations: 100_000 }, workers });
    const orchestrator = makeOrchestrator({ prisma, bus: fakeBus(messages), provisioner });

    const tick = await orchestrator.supervise('org-1');

    expect(tick.stalledWorkerIds).toEqual(['stall']);
    expect(tick.pausedWorkerIds).toEqual(['stall']);
    expect(tick.retiredWorkerIds).toEqual([]);
    expect(tick.actions.find((a) => a.workerId === 'busy')).toBeUndefined();
  });

  it('leaves a healthy worker untouched and does not re-action paused/retired workers (idempotent)', async () => {
    const workers = [
      worker({ id: 'healthy', costSpent: 5, status: 'ACTIVE' }),
      worker({ id: 'already-paused', status: 'PAUSED', costSpent: 9999, budgetShare: 1 }),
      worker({ id: 'already-retired', status: 'RETIRED', costSpent: 9999, budgetShare: 1 }),
    ];
    const messages = [msg('healthy', 'pr_ready', 'wi-1')];
    const prisma = createMockPrisma({ org: { ...ORG, budgetCap: 100_000, maxIterations: 100_000 }, workers });
    const orchestrator = makeOrchestrator({ prisma, bus: fakeBus(messages), provisioner });

    const tick = await orchestrator.supervise('org-1');

    expect(tick.actions).toEqual([]);
    expect(tick.pausedWorkerIds).toEqual([]);
    expect(tick.retiredWorkerIds).toEqual([]);
    // No worker rows were updated (the already-paused/retired ones are skipped).
    expect(prisma.agentWorker.update).not.toHaveBeenCalled();
    expect(provisioner.revoked).toEqual([]);
  });

  it('flags budget pressure on the tick when spend crosses the pressure ratio (Req 12.5)', async () => {
    // 920 / 1000 = 92% > default 90% pressure ratio, but below the cap.
    const workers = [worker({ id: 'w1', costSpent: 920, budgetShare: 10_000 })];
    const prisma = createMockPrisma({ org: { ...ORG, budgetCap: 1000 }, workers });
    const orchestrator = makeOrchestrator({ prisma, bus: fakeBus([]), provisioner });

    const tick = await orchestrator.supervise('org-1');

    expect(tick.budgetPressure).toBe(true);
    expect(tick.budgetCapReached).toBe(false);
    // Pressure alone does not stop the worker.
    expect(tick.retiredWorkerIds).toEqual([]);
    expect(tick.pausedWorkerIds).toEqual([]);
  });
});
