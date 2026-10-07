// @vitest-environment node
// ============================================================================
// Feature: quantmail-superhub, Phase-6 isolation security regression (V14)
// Task 23.2 — "Write security regression for Phase-6 isolation classes"
// ============================================================================
//
// This suite is the consolidated Phase-6 isolation HARD GATE: it asserts each
// Phase-6 cross-tenant / cross-owner isolation vulnerability class is CLOSED
// against the REAL implementations shipped in Tasks 20.1 (AgentEmailBus) and
// 23.1 (the cross-cutting ownership/tenant authorization filter wired into the
// Answer Engine retriever and the Agent Runtime).
//
//   V14  Cross-tenant agent-bus send             — Task 23.2 (Req 12.3)
//   Cross-tenant data access across pillars      — Task 23.2 (Req 22.1, 22.2)
//
// _Requirements: 12.3, 22.1, 22.2_
//
// STRATEGY
//   Every class is asserted against the REAL code paths — modules are consumed
//   ONLY through their public barrels (`../modules/company`, `../modules/answers`,
//   `../modules/agent`) plus the shared filter (`../shared/ownership-authz`),
//   never by reaching into `services/*` (preserving the SRP boundary):
//
//     * V14 drives the REAL `AgentEmailBus.send` (from the company barrel) with a
//       two-tenant worker population and asserts a cross-TENANT send (and a
//       cross-ORG send) is REJECTED and FAILS CLOSED — the mail pipeline
//       (`MailDeliveryPort.deliver`) is NEVER called and NO `AgentBusEmailMeta`
//       sidecar (nor work item) is persisted. The same-tenant send is accepted
//       (no false positive).
//
//     * ANSWER ENGINE retrieval denies cross-tenant/cross-owner access — the REAL
//       `Retriever.retrieve` (from the answers barrel) never returns another
//       tenant's/owner's chunks under the default owner-only filter, and fails
//       closed when an injected ownership port denies every chunk.
//
//     * AGENT RUNTIME denies a cross-tenant tool action — the REAL
//       `AgentRuntime.step` (from the agent barrel) on a resource owned by
//       another tenant fails closed with 403 OWNERSHIP_AUTHZ_DENIED and marks
//       the session FAILED.
//
// The in-memory prisma double + spy-delivery patterns mirror the existing tests
// (agent-bus-cross-tenant-rejection.property.test.ts,
// cross-cutting-authz-observability.service.test.ts). No QuantChat code is
// touched; this is a test-only regression net.

import { describe, it, expect, vi } from 'vitest';

// --- Pillar barrels (public module surfaces only) --------------------------
import {
  AgentEmailBus,
  type MailDeliveryPort,
  type DeliverBusMailInput,
} from '../modules/company';
import {
  Retriever,
  InMemoryKeywordSearchPort,
  InMemoryVectorSearchPort,
  type InMemoryChunk,
} from '../modules/answers';
import {
  AgentRuntime,
  type ResourceOwnershipPort,
} from '../modules/agent';
import type { ToolExecutionLoop, Observation } from '../modules/agent';
import type { OwnershipAuthzPort } from '../shared/ownership-authz';

// ===========================================================================
// V14 — AgentEmailBus rejects a cross-tenant (cross-org) send (Req 12.3)
// ===========================================================================

/** One agent worker in the two-tenant fixture. */
interface FixtureWorker {
  id: string;
  orgId: string;
  tenantId: string;
  role: string;
}

const addressOf = (w: FixtureWorker): string =>
  `${w.id}.${w.orgId}@agents.${w.tenantId}.quantmail`;
const identityIdOf = (w: FixtureWorker): string => `id-${w.id}`;

/**
 * Build an in-memory Prisma double seeded from an explicit worker fixture, each
 * worker carrying an ACTIVE, tenant-scoped mailbox identity. Mirrors the mock
 * shape consumed by `AgentEmailBus` in the existing bus tests.
 */
function createBusPrisma(workers: FixtureWorker[]) {
  let seq = 0;
  const workItems = new Map<string, Record<string, unknown>>();
  const metas: Array<Record<string, unknown>> = [];

  const workerRows = new Map<string, Record<string, unknown>>();
  const identityRows = new Map<string, Record<string, unknown>>();
  const orgRows = new Map<string, Record<string, unknown>>();

  for (const w of workers) {
    workerRows.set(w.id, {
      id: w.id,
      orgId: w.orgId,
      tenantId: w.tenantId,
      role: w.role,
      mailboxIdentityId: identityIdOf(w),
    });
    identityRows.set(identityIdOf(w), {
      id: identityIdOf(w),
      orgId: w.orgId,
      tenantId: w.tenantId,
      roleKey: w.role,
      address: addressOf(w),
      status: 'ACTIVE',
    });
    if (!orgRows.has(w.orgId)) {
      orgRows.set(w.orgId, { id: w.orgId, ceoUserId: `ceo-${w.orgId}`, tenantId: w.tenantId });
    }
  }

  return {
    _workItems: workItems,
    _metas: metas,
    agentWorker: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => workerRows.get(where.id) ?? null),
    },
    agentMailboxIdentity: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => identityRows.get(where.id) ?? null),
    },
    agentOrg: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orgRows.get(where.id) ?? null),
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
      findMany: vi.fn(async () => metas.slice()),
    },
  };
}

/** A `MailDeliveryPort` spy: records every delivery so we can assert NONE. */
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

// Tenant A / org-1 sender + same-tenant peer; tenant B / org-2 outsiders.
const ALICE: FixtureWorker = { id: 'wA', orgId: 'org-1', tenantId: 'tenant-A', role: 'PLANNER' };
const ALICE_PEER: FixtureWorker = { id: 'wA2', orgId: 'org-1', tenantId: 'tenant-A', role: 'CODER' };
const BOB_OTHER_TENANT: FixtureWorker = { id: 'wB', orgId: 'org-2', tenantId: 'tenant-B', role: 'CODER' };
// Same tenant string but a DIFFERENT org — still outside the sender's org.
const CARLA_OTHER_ORG: FixtureWorker = { id: 'wC', orgId: 'org-9', tenantId: 'tenant-A', role: 'REVIEWER' };

const ALL_WORKERS = [ALICE, ALICE_PEER, BOB_OTHER_TENANT, CARLA_OTHER_ORG];

describe('Feature: quantmail-superhub, Phase-6 isolation security regression (V14): cross-tenant agent-bus send is REJECTED (Req 12.3)', () => {
  it('V14: a send to a recipient in ANOTHER TENANT fails closed — no mail delivered, no AgentBusEmailMeta row, no work item', async () => {
    const prisma = createBusPrisma(ALL_WORKERS);
    const delivery = spyDelivery();
    const bus = new AgentEmailBus(prisma as never, { mailDelivery: delivery });

    await expect(
      bus.send(ALICE.id, [BOB_OTHER_TENANT.id], 'task_assign', 'cross-tenant payload'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'CROSS_TENANT_BUS_REJECTED' });

    // FAIL CLOSED: nothing left the bus, nothing was persisted.
    expect(delivery.calls).toHaveLength(0);
    expect(prisma.agentBusEmailMeta.create).not.toHaveBeenCalled();
    expect(prisma.agentWorkItem.create).not.toHaveBeenCalled();
    expect(prisma._metas).toHaveLength(0);
  });

  it('V14: a send to a recipient in ANOTHER ORG (same tenant string) is also rejected — org isolation, not just tenant', async () => {
    const prisma = createBusPrisma(ALL_WORKERS);
    const delivery = spyDelivery();
    const bus = new AgentEmailBus(prisma as never, { mailDelivery: delivery });

    await expect(
      bus.send(ALICE.id, [CARLA_OTHER_ORG.id], 'status', 'cross-org payload'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'CROSS_TENANT_BUS_REJECTED' });

    expect(delivery.calls).toHaveLength(0);
    expect(prisma.agentBusEmailMeta.create).not.toHaveBeenCalled();
  });

  it('V14: a MIXED recipient set (one same-tenant peer + one cross-tenant) is rejected WHOLESALE — no partial delivery to the legal peer', async () => {
    const prisma = createBusPrisma(ALL_WORKERS);
    const delivery = spyDelivery();
    const bus = new AgentEmailBus(prisma as never, { mailDelivery: delivery });

    await expect(
      bus.send(ALICE.id, [ALICE_PEER.id, BOB_OTHER_TENANT.id], 'pr_ready', 'mixed payload'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'CROSS_TENANT_BUS_REJECTED' });

    // The whole send fails closed — the legal same-tenant peer gets nothing.
    expect(delivery.calls).toHaveLength(0);
    expect(prisma.agentBusEmailMeta.create).not.toHaveBeenCalled();
  });

  it('control: a SAME-tenant, same-org send is accepted — exactly one delivery + one sidecar (no false positive)', async () => {
    const prisma = createBusPrisma(ALL_WORKERS);
    const delivery = spyDelivery();
    const bus = new AgentEmailBus(prisma as never, { mailDelivery: delivery });

    const msg = await bus.send(ALICE.id, [ALICE_PEER.id], 'task_assign', 'in-tenant payload');

    expect(delivery.calls).toHaveLength(1);
    expect(delivery.calls[0].fromAddress).toBe(addressOf(ALICE));
    expect(delivery.calls[0].toAddresses).toEqual([addressOf(ALICE_PEER)]);
    expect(delivery.calls[0].label).toBe('agent-bus');
    expect(prisma.agentBusEmailMeta.create).toHaveBeenCalledTimes(1);
    expect(msg.fromWorkerId).toBe(ALICE.id);
    expect(msg.toWorkerIds).toEqual([ALICE_PEER.id]);
    expect(msg.orgId).toBe(ALICE.orgId);
  });
});

// ===========================================================================
// Cross-tenant data access denied across pillars (Req 22.1, 22.2)
// ===========================================================================

const fixedEmbedder = { async embedQuery() { return [1, 0, 0]; } };

function ownedChunk(id: string, userId: string, emailId: string): InMemoryChunk {
  return { id, userId, sourceType: 'email', sourceRef: { emailId }, text: 'quarterly revenue', embedding: [1, 0, 0] };
}

describe('Feature: quantmail-superhub, Phase-6 isolation security regression: Answer Engine retrieval denies cross-tenant data access (Req 22.1)', () => {
  it("never returns another owner's/tenant's chunks under the default owner-only filter", async () => {
    // tenant-A owner `alice` and tenant-B owner `bob` share an identical corpus.
    const corpus = [
      ownedChunk('c-alice', 'alice', 'em-a'),
      ownedChunk('c-bob', 'bob', 'em-b'),
    ];
    const retriever = new Retriever({
      embedder: fixedEmbedder,
      vectorStore: new InMemoryVectorSearchPort([...corpus]),
      keywordStore: new InMemoryKeywordSearchPort([...corpus]),
    });

    // Bob (a different tenant/owner) queries the SAME text Alice owns.
    const bobResults = await retriever.retrieve('bob', 'quarterly revenue');
    expect(bobResults.length).toBeGreaterThan(0);
    expect(bobResults.every((r) => r.userId === 'bob')).toBe(true);
    expect(bobResults.map((r) => r.chunkId)).not.toContain('c-alice');

    // And symmetrically Alice never sees Bob's chunk.
    const aliceResults = await retriever.retrieve('alice', 'quarterly revenue');
    expect(aliceResults.every((r) => r.userId === 'alice')).toBe(true);
    expect(aliceResults.map((r) => r.chunkId)).not.toContain('c-bob');
  });

  it('fails closed (returns nothing) when the injected ownership port DENIES every chunk', async () => {
    const corpus = [ownedChunk('c-alice', 'alice', 'em-a')];
    const denyAll: OwnershipAuthzPort = { isAuthorized: vi.fn(() => false) };
    const retriever = new Retriever({
      embedder: fixedEmbedder,
      vectorStore: new InMemoryVectorSearchPort([...corpus]),
      keywordStore: new InMemoryKeywordSearchPort([...corpus]),
      authz: denyAll,
    });

    const results = await retriever.retrieve('alice', 'quarterly revenue');
    expect(results).toEqual([]);
    expect(denyAll.isAuthorized).toHaveBeenCalled();
  });
});

// --- Agent Runtime cross-tenant tool-action denial -------------------------

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

function createAgentPrisma(initial: SessionRow) {
  const sessions = new Map<string, SessionRow>([[initial.id, { ...initial }]]);
  const transcripts: Array<Record<string, unknown>> = [];
  let tid = 0;
  return {
    _sessions: sessions,
    _transcripts: transcripts,
    agentSession: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = sessions.get(where.id);
        return row ? { ...row } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
        const row = sessions.get(where.id)!;
        const next = { ...row, ...data };
        sessions.set(where.id, next);
        return { ...next };
      }),
    },
    agentTranscript: {
      findFirst: vi.fn(async ({ where }: { where: { sessionId: string } }) => {
        const rows = transcripts
          .filter((t) => t['sessionId'] === where.sessionId)
          .sort((a, b) => (b['seq'] as number) - (a['seq'] as number));
        return rows[0] ? { seq: rows[0]['seq'] } : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `t-${++tid}`, ...data };
        transcripts.push(row);
        return { ...row };
      }),
    },
  };
}

const AGENT_SESSION: SessionRow = {
  id: 'sess-1',
  userId: 'owner-1', // tenant-A principal
  repoId: 'repo-1',
  instruction: 'do the task',
  status: 'RUNNING',
  branchRef: 'agent/sess-1',
  maxIterations: 5,
  iterationCount: 0,
  costBudget: 100,
  costSpent: 0,
  linkedPrId: null,
};

function loopThatActs(obs: Observation): ToolExecutionLoop {
  return {
    selectTool: vi.fn(() => ({ toolName: 'edit_file', args: {} })),
    execute: vi.fn(async () => obs),
  };
}

describe('Feature: quantmail-superhub, Phase-6 isolation security regression: Agent Runtime denies a cross-tenant tool action (Req 22.1, 22.2)', () => {
  it('DENIES a step on a resource owned by ANOTHER TENANT — fails closed 403, marks session FAILED, no tool runs', async () => {
    const prisma = createAgentPrisma(AGENT_SESSION);
    // The repo is owned by a different owner in a DIFFERENT tenant; the session
    // principal is not a tenant admin, so the same-tenant allowance never applies.
    const resourceOwnership: ResourceOwnershipPort = {
      resolveRepoOwner: vi.fn(async () => ({ ownerId: 'other-owner', tenantId: 'tenant-B' })),
    };
    const runtime = new AgentRuntime(prisma as never, {
      loop: loopThatActs({ ok: true, mutatedBranch: 'agent/sess-1' }),
      resourceOwnership,
    });

    await expect(runtime.step('sess-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'OWNERSHIP_AUTHZ_DENIED',
    });

    const session = await prisma.agentSession.findUnique({ where: { id: 'sess-1' } });
    expect(session?.status).toBe('FAILED');
    expect(session?.iterationCount).toBe(0); // the tool never executed
    expect(prisma._transcripts[0]).toMatchObject({
      role: 'OBSERVATION',
      payload: expect.objectContaining({ rejected: true }),
    });
  });

  it('control: ALLOWS a step when the session principal owns the target resource (no false positive)', async () => {
    const prisma = createAgentPrisma(AGENT_SESSION);
    const resourceOwnership: ResourceOwnershipPort = {
      resolveRepoOwner: vi.fn(async () => ({ ownerId: 'owner-1' })), // == session.userId
    };
    const runtime = new AgentRuntime(prisma as never, {
      loop: loopThatActs({ ok: true, mutatedBranch: 'agent/sess-1', tokensUsed: 1 }),
      resourceOwnership,
    });

    const result = await runtime.step('sess-1');
    expect(result.outcome).toBe('executed');
    expect(result.session.status).toBe('RUNNING');
  });
});
