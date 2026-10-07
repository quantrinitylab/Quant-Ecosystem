// @vitest-environment node
// ============================================================================
// quantmail-superhub · Task 20.1 — Unit tests for AgentEmailBus
// send / poll / observe (Requirements 12.1, 12.2, 12.3, 12.4)
// ============================================================================
//
// Tests the REAL implementation from Task 20.1
// (`modules/company/services/agent-email-bus.ts`) against a mocked Prisma client
// and an injected `MailDeliveryPort` spy — no live mail domain, no @quant/ai, no
// network, no real database.
//
// COVERAGE
//   send
//     - delivers through the mail pipeline with the reserved `agent-bus` label
//       and the X-Quant-Agent-Org/-From-Role/-Msg-Type headers (Req 12.1, 12.2);
//     - threads to a newly-created AgentWorkItem and binds its busThreadId on the
//       first delivery (Req 12.1);
//     - carries artifacts as attachments and returns them on the message (Req 12.4);
//     - persists an AgentBusEmailMeta sidecar and returns an AgentBusMessage;
//     - reuses an existing work item's thread when workItemId is supplied;
//     - FAILS CLOSED with no delivery/persistence when a recipient is in another
//       tenant, another org, or is not an ACTIVE agent identity (Req 12.3);
//     - rejects an unknown msg type and an empty recipient set.
//   poll      - returns only messages addressed to the worker, scoped to its org.
//   observe   - returns every message for the org.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentEmailBus,
  type MailDeliveryPort,
  type DeliverBusMailInput,
} from '../modules/company/services/agent-email-bus';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface WorkerRow {
  id: string;
  orgId: string;
  tenantId: string;
  role: string;
  mailboxIdentityId: string | null;
}
interface IdentityRow {
  id: string;
  orgId: string;
  tenantId: string;
  roleKey: string | null;
  address: string;
  status: string;
}

// Org A / tenant A: a planner (sender) and a coder (recipient).
const ORG_A = { id: 'org-A', ceoUserId: 'ceo-A', tenantId: 'tenant-A' };

const WORKERS: Record<string, WorkerRow> = {
  'w-planner': { id: 'w-planner', orgId: 'org-A', tenantId: 'tenant-A', role: 'PLANNER', mailboxIdentityId: 'id-planner' },
  'w-coder': { id: 'w-coder', orgId: 'org-A', tenantId: 'tenant-A', role: 'CODER', mailboxIdentityId: 'id-coder' },
  // Same tenant, DIFFERENT org.
  'w-other-org': { id: 'w-other-org', orgId: 'org-B', tenantId: 'tenant-A', role: 'CODER', mailboxIdentityId: 'id-other-org' },
  // DIFFERENT tenant.
  'w-other-tenant': { id: 'w-other-tenant', orgId: 'org-C', tenantId: 'tenant-C', role: 'CODER', mailboxIdentityId: 'id-other-tenant' },
  // Same org/tenant but its identity is ARCHIVED (not an active agent identity).
  'w-archived': { id: 'w-archived', orgId: 'org-A', tenantId: 'tenant-A', role: 'CODER', mailboxIdentityId: 'id-archived' },
  // Same org/tenant but has NO identity at all.
  'w-noidentity': { id: 'w-noidentity', orgId: 'org-A', tenantId: 'tenant-A', role: 'CODER', mailboxIdentityId: null },
};

const IDENTITIES: Record<string, IdentityRow> = {
  'id-planner': { id: 'id-planner', orgId: 'org-A', tenantId: 'tenant-A', roleKey: 'PLANNER', address: 'planner-1.org-a@agents.tenant-a.quantmail', status: 'ACTIVE' },
  'id-coder': { id: 'id-coder', orgId: 'org-A', tenantId: 'tenant-A', roleKey: 'CODER', address: 'coder-1.org-a@agents.tenant-a.quantmail', status: 'ACTIVE' },
  'id-other-org': { id: 'id-other-org', orgId: 'org-B', tenantId: 'tenant-A', roleKey: 'CODER', address: 'coder-1.org-b@agents.tenant-a.quantmail', status: 'ACTIVE' },
  'id-other-tenant': { id: 'id-other-tenant', orgId: 'org-C', tenantId: 'tenant-C', roleKey: 'CODER', address: 'coder-1.org-c@agents.tenant-c.quantmail', status: 'ACTIVE' },
  'id-archived': { id: 'id-archived', orgId: 'org-A', tenantId: 'tenant-A', roleKey: 'CODER', address: 'coder-2.org-a@agents.tenant-a.quantmail', status: 'ARCHIVED' },
};

// ---------------------------------------------------------------------------
// Mock Prisma + spy MailDeliveryPort
// ---------------------------------------------------------------------------

function createMockPrisma() {
  let seq = 0;
  const workItems = new Map<string, Record<string, unknown>>();
  const metas: Array<Record<string, unknown>> = [];

  return {
    _workItems: workItems,
    _metas: metas,
    agentWorker: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => WORKERS[where.id] ?? null),
    },
    agentMailboxIdentity: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => IDENTITIES[where.id] ?? null),
    },
    agentOrg: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === ORG_A.id ? { ...ORG_A } : null)),
    },
    agentWorkItem: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => workItems.get(where.id) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `wi-${++seq}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        workItems.set(row.id as string, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { ...(workItems.get(where.id) ?? { id: where.id }), ...data };
        workItems.set(where.id, row);
        return row;
      }),
    },
    agentBusEmailMeta: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `meta-${++seq}`, ...data, createdAt: new Date(Date.now() + seq) };
        metas.push(row);
        return row;
      }),
      findMany: vi.fn(async ({ where }: { where?: { orgId?: string } } = {}) => {
        const rows = where?.orgId ? metas.filter((m) => m.orgId === where.orgId) : metas.slice();
        return rows.slice().sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
      }),
    },
  };
}

function spyDelivery(): MailDeliveryPort & { calls: DeliverBusMailInput[] } {
  let n = 0;
  const calls: DeliverBusMailInput[] = [];
  return {
    calls,
    async deliver(input: DeliverBusMailInput) {
      calls.push(input);
      n += 1;
      return { emailId: `email-${n}`, threadId: input.threadId ?? `thread-${n}` };
    },
  };
}

function makeBus(prisma: ReturnType<typeof createMockPrisma>, delivery: MailDeliveryPort) {
  return new AgentEmailBus(prisma as never, { mailDelivery: delivery });
}

// ===========================================================================
// send
// ===========================================================================

describe('AgentEmailBus.send', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let delivery: ReturnType<typeof spyDelivery>;

  beforeEach(() => {
    prisma = createMockPrisma();
    delivery = spyDelivery();
  });

  it('delivers with the agent-bus label + the three headers, threaded to a new work item (Req 12.1, 12.2)', async () => {
    const bus = makeBus(prisma, delivery);

    const msg = await bus.send('w-planner', ['w-coder'], 'task_assign', 'Build the game loop', [], {
      title: 'Game loop',
    });

    // One delivery through the pipeline, carrying the reserved label + headers.
    expect(delivery.calls).toHaveLength(1);
    const d = delivery.calls[0];
    expect(d.label).toBe('agent-bus');
    expect(d.headers).toEqual({
      'X-Quant-Agent-Org': 'org-A',
      'X-Quant-Agent-From-Role': 'planner',
      'X-Quant-Agent-Msg-Type': 'task_assign',
    });
    expect(d.fromAddress).toBe(IDENTITIES['id-planner'].address);
    expect(d.toAddresses).toEqual([IDENTITIES['id-coder'].address]);
    expect(d.ownerUserId).toBe('ceo-A');

    // A work item was created and its busThreadId bound on first delivery.
    expect(prisma.agentWorkItem.create).toHaveBeenCalledTimes(1);
    expect(prisma.agentWorkItem.update).toHaveBeenCalledTimes(1);
    const created = Array.from(prisma._workItems.values())[0] as Record<string, unknown>;
    expect(created.busThreadId).toBe(msg.threadId);
    expect(created.assignedWorkerId).toBe('w-coder');

    // The returned structured message + the persisted sidecar.
    expect(msg).toMatchObject({
      orgId: 'org-A',
      fromWorkerId: 'w-planner',
      fromRole: 'planner',
      toWorkerIds: ['w-coder'],
      msgType: 'task_assign',
    });
    expect(prisma.agentBusEmailMeta.create).toHaveBeenCalledTimes(1);
    const metaData = prisma.agentBusEmailMeta.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(metaData.msgType).toBe('TASK_ASSIGN');
    expect(metaData.label).toBe('agent-bus');
    expect(metaData.toWorkerIds).toEqual(['w-coder']);
  });

  it('carries artifacts as attachments and returns them on the message (Req 12.4)', async () => {
    const bus = makeBus(prisma, delivery);
    const artifacts = [
      { filename: 'change.diff', kind: 'diff' as const, content: '--- a\n+++ b' },
      { filename: 'ci.log', kind: 'log' as const, url: 'https://blobs/ci.log' },
    ];

    const msg = await bus.send('w-coder', ['w-planner'], 'pr_ready', 'PR is up', artifacts);

    expect(delivery.calls[0].artifacts).toHaveLength(2);
    expect(delivery.calls[0].artifacts[0]).toMatchObject({ filename: 'change.diff', kind: 'diff' });
    expect(msg.artifacts.map((a) => a.filename)).toEqual(['change.diff', 'ci.log']);
  });

  it('threads onto an existing work item, reusing its busThreadId (Req 12.1)', async () => {
    const bus = makeBus(prisma, delivery);
    // First message creates the work item + thread.
    const first = await bus.send('w-planner', ['w-coder'], 'task_assign', 'do it');
    prisma.agentWorkItem.create.mockClear();

    // Second message threads onto the same work item.
    const second = await bus.send('w-coder', ['w-planner'], 'status', 'on it', [], {
      workItemId: first.workItemId,
    });

    expect(prisma.agentWorkItem.create).not.toHaveBeenCalled();
    expect(second.workItemId).toBe(first.workItemId);
    expect(second.threadId).toBe(first.threadId);
    expect(delivery.calls[1].threadId).toBe(first.threadId);
  });

  it('rejects a recipient in a different tenant and delivers nothing (Req 12.3)', async () => {
    const bus = makeBus(prisma, delivery);

    await expect(
      bus.send('w-planner', ['w-other-tenant'], 'task_assign', 'leak'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'CROSS_TENANT_BUS_REJECTED' });

    expect(delivery.calls).toHaveLength(0);
    expect(prisma.agentBusEmailMeta.create).not.toHaveBeenCalled();
  });

  it('rejects a recipient in a different org (same tenant) and delivers nothing (Req 12.3)', async () => {
    const bus = makeBus(prisma, delivery);

    await expect(
      bus.send('w-planner', ['w-other-org'], 'task_assign', 'cross-org'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'CROSS_TENANT_BUS_REJECTED' });

    expect(delivery.calls).toHaveLength(0);
    expect(prisma.agentBusEmailMeta.create).not.toHaveBeenCalled();
  });

  it('rejects when ANY recipient in a set is cross-tenant (all-or-nothing, Req 12.3)', async () => {
    const bus = makeBus(prisma, delivery);

    await expect(
      bus.send('w-planner', ['w-coder', 'w-other-tenant'], 'task_assign', 'mixed'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'CROSS_TENANT_BUS_REJECTED' });

    expect(delivery.calls).toHaveLength(0);
  });

  it('rejects a recipient whose agent identity is not ACTIVE (Req 12.3)', async () => {
    const bus = makeBus(prisma, delivery);

    await expect(
      bus.send('w-planner', ['w-archived'], 'task_assign', 'to archived'),
    ).rejects.toMatchObject({ statusCode: 422, code: 'NOT_AGENT_IDENTITY' });
    expect(delivery.calls).toHaveLength(0);
  });

  it('rejects a sender/recipient with no mailbox identity (Req 12.3)', async () => {
    const bus = makeBus(prisma, delivery);

    await expect(
      bus.send('w-planner', ['w-noidentity'], 'task_assign', 'to none'),
    ).rejects.toMatchObject({ statusCode: 422, code: 'NOT_AGENT_IDENTITY' });
  });

  it('rejects an unknown message type and an empty recipient set', async () => {
    const bus = makeBus(prisma, delivery);

    await expect(
      bus.send('w-planner', ['w-coder'], 'not_a_type' as never, 'x'),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_MSG_TYPE' });

    await expect(
      bus.send('w-planner', [], 'status', 'x'),
    ).rejects.toMatchObject({ statusCode: 400, code: 'NO_RECIPIENTS' });
  });
});

// ===========================================================================
// poll / observe
// ===========================================================================

describe('AgentEmailBus.poll / observe', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let delivery: ReturnType<typeof spyDelivery>;

  beforeEach(() => {
    prisma = createMockPrisma();
    delivery = spyDelivery();
  });

  it('poll returns only the messages addressed to the worker; observe returns all org messages', async () => {
    const bus = makeBus(prisma, delivery);

    // planner -> coder, then coder -> planner.
    await bus.send('w-planner', ['w-coder'], 'task_assign', 'assign');
    await bus.send('w-coder', ['w-planner'], 'status', 'working');

    const coderInbox = await bus.poll('w-coder');
    expect(coderInbox).toHaveLength(1);
    expect(coderInbox[0]).toMatchObject({ fromWorkerId: 'w-planner', msgType: 'task_assign', toWorkerIds: ['w-coder'] });

    const plannerInbox = await bus.poll('w-planner');
    expect(plannerInbox).toHaveLength(1);
    expect(plannerInbox[0]).toMatchObject({ fromWorkerId: 'w-coder', msgType: 'status' });

    const all = await bus.observe('org-A');
    expect(all).toHaveLength(2);
    expect(all.map((m) => m.msgType)).toEqual(['task_assign', 'status']);
  });

  it('poll rejects an unknown worker', async () => {
    const bus = makeBus(prisma, delivery);
    await expect(bus.poll('nope')).rejects.toMatchObject({ statusCode: 404, code: 'WORKER_NOT_FOUND' });
  });
});
