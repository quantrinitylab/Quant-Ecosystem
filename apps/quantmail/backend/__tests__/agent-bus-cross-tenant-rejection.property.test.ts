// @vitest-environment node
// ============================================================================
// Task 20.2 — Property test: the agent bus never sends across tenants
// quantmail-superhub · Phase 6 — Agent Company OS (Pillar 5)
// ============================================================================
//
// Feature: quantmail-superhub, Property 7b: agent bus never sends across tenants
//
// **Property P7b (cross-tenant bus rejection)** — for ANY sender/recipient set
// drawn from an arbitrary multi-tenant / multi-org population of agent workers,
// a bus message is delivered IF AND ONLY IF the sender AND every (deduped)
// recipient is an ACTIVE agent identity within the SAME org AND the SAME
// tenant. In every other case — any recipient that is cross-org, cross-tenant,
// archived, or identity-less, or an empty recipient set — the send is REJECTED
// and FAILS CLOSED: the mail pipeline (`MailDeliveryPort.deliver`) is NEVER
// called and NO `AgentBusEmailMeta` sidecar (nor work item) is persisted.
//
// **Validates: Requirements 12.3**
//   - 12.3 — agent-bus messages may only flow between same-org, same-tenant
//            agent identities; cross-tenant sends are rejected (no leak).
//
// HARNESS: tests the REAL `AgentEmailBus` from Task 20.1
// (`modules/company/services/agent-email-bus.ts`) against a mocked Prisma client
// DRIVEN BY the randomly-generated population, plus an injected
// `MailDeliveryPort` spy (mirrors the mock-Prisma + spy-delivery pattern in
// `agent-email-bus.service.test.ts`). No live mail domain, no @quant/ai, no
// network, no real database. Library: fast-check, >= 100 runs.

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import {
  AgentEmailBus,
  ALL_MSG_TYPES,
  type AgentBusMsgType,
  type MailDeliveryPort,
  type DeliverBusMailInput,
} from '../modules/company/services/agent-email-bus';

// ---------------------------------------------------------------------------
// Generated population model
// ---------------------------------------------------------------------------

/** One agent worker in the generated population. */
interface GenWorker {
  id: string;
  orgId: string;
  tenantId: string;
  role: string;
  /** Whether this worker has an ACTIVE / ARCHIVED / no agent mailbox identity. */
  identity: 'active' | 'archived' | 'none';
}

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

/** The mailbox address minted for a worker that has an identity. */
const addressOf = (w: GenWorker): string =>
  `${w.id}.${w.orgId}@agents.${w.tenantId}.quantmail`;

const identityIdOf = (w: GenWorker): string => `id-${w.id}`;

// ---------------------------------------------------------------------------
// Mock Prisma DRIVEN by the generated population + spy MailDeliveryPort
// ---------------------------------------------------------------------------

function createMockPrisma(population: GenWorker[]) {
  let seq = 0;
  const workItems = new Map<string, Record<string, unknown>>();
  const metas: Array<Record<string, unknown>> = [];

  // Build worker + identity + org lookup tables from the population.
  const workers = new Map<string, WorkerRow>();
  const identities = new Map<string, IdentityRow>();
  const orgs = new Map<string, { id: string; ceoUserId: string; tenantId: string }>();

  for (const w of population) {
    const hasIdentity = w.identity !== 'none';
    workers.set(w.id, {
      id: w.id,
      orgId: w.orgId,
      tenantId: w.tenantId,
      role: w.role,
      mailboxIdentityId: hasIdentity ? identityIdOf(w) : null,
    });
    if (hasIdentity) {
      identities.set(identityIdOf(w), {
        id: identityIdOf(w),
        orgId: w.orgId,
        tenantId: w.tenantId,
        roleKey: w.role,
        address: addressOf(w),
        status: w.identity === 'active' ? 'ACTIVE' : 'ARCHIVED',
      });
    }
    // Every org referenced in the population resolves (with a tenant-scoped CEO).
    if (!orgs.has(w.orgId)) {
      orgs.set(w.orgId, { id: w.orgId, ceoUserId: `ceo-${w.orgId}`, tenantId: w.tenantId });
    }
  }

  const create = {
    _workItems: workItems,
    _metas: metas,
    agentWorker: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => workers.get(where.id) ?? null),
    },
    agentMailboxIdentity: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => identities.get(where.id) ?? null),
    },
    agentOrg: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => orgs.get(where.id) ?? null),
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
  return create;
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

// ---------------------------------------------------------------------------
// Generators — random multi-tenant / multi-org worker populations
// ---------------------------------------------------------------------------

// Small pools keep collisions frequent so BOTH the success path (same
// org+tenant, all active) and the reject path are exercised within 100+ runs.
const TENANT_POOL = ['tenant-A', 'tenant-B'] as const;
const ORG_POOL = ['org-1', 'org-2'] as const;
const ROLE_POOL = ['PLANNER', 'CODER', 'REVIEWER', 'TESTER'] as const;

/**
 * Identity state, biased toward ACTIVE so a same-org/tenant set is reachable
 * (active 4 : archived 1 : none 1, via repeated constants).
 */
const identityStateArb = fc.constantFrom(
  'active',
  'active',
  'active',
  'active',
  'archived',
  'none',
) as fc.Arbitrary<'active' | 'archived' | 'none'>;

/** A population of 2..6 workers; ids are clean + unique by position. */
const populationArb: fc.Arbitrary<GenWorker[]> = fc
  .array(
    fc.record({
      orgId: fc.constantFrom(...ORG_POOL),
      tenantId: fc.constantFrom(...TENANT_POOL),
      role: fc.constantFrom(...ROLE_POOL),
      identity: identityStateArb,
    }),
    { minLength: 2, maxLength: 6 },
  )
  .map((rows) => rows.map((r, i) => ({ id: `w${i}`, ...r })));

const msgTypeArb: fc.Arbitrary<AgentBusMsgType> = fc.constantFrom(...ALL_MSG_TYPES);

// ===========================================================================
// P7b — the bus never sends across tenants
// ===========================================================================

describe('Feature: quantmail-superhub, Property 7b: agent bus never sends across tenants', () => {
  it('delivers iff sender + all recipients are ACTIVE same-org/tenant agent identities, else fails closed (Req 12.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        populationArb,
        fc.nat(),
        // Recipient subset as indices into the population (may repeat / be empty).
        fc.array(fc.nat(), { minLength: 0, maxLength: 6 }),
        msgTypeArb,
        async (population, senderNat, recipientNats, msgType) => {
          const byId = new Map(population.map((w) => [w.id, w]));
          const sender = population[senderNat % population.length];

          // Map recipient indices -> worker ids, then dedup (mirrors send()).
          const recipientIds = recipientNats.map((n) => population[n % population.length].id);
          const dedupRecipientIds = Array.from(new Set(recipientIds));

          const prisma = createMockPrisma(population);
          const delivery = spyDelivery();
          const bus = new AgentEmailBus(prisma as never, { mailDelivery: delivery });

          // -------- Oracle: when SHOULD this send succeed? --------------------
          const senderActive = sender.identity === 'active';
          const recipientsActive = dedupRecipientIds.every((id) => byId.get(id)!.identity === 'active');
          const sameScope = dedupRecipientIds.every((id) => {
            const r = byId.get(id)!;
            return r.orgId === sender.orgId && r.tenantId === sender.tenantId;
          });
          const shouldSucceed =
            dedupRecipientIds.length > 0 && senderActive && recipientsActive && sameScope;

          if (shouldSucceed) {
            const msg = await bus.send(sender.id, recipientIds, msgType, 'payload');

            // Delivered exactly once, to exactly the (deduped) recipient addrs.
            expect(delivery.calls).toHaveLength(1);
            const expectedAddrs = dedupRecipientIds.map((id) => addressOf(byId.get(id)!));
            expect(delivery.calls[0].toAddresses).toEqual(expectedAddrs);
            expect(delivery.calls[0].fromAddress).toBe(addressOf(sender));
            expect(delivery.calls[0].label).toBe('agent-bus');

            // A sidecar was persisted exactly once.
            expect(prisma.agentBusEmailMeta.create).toHaveBeenCalledTimes(1);

            // Every party on the returned message shares the sender's org+tenant.
            expect(msg.fromWorkerId).toBe(sender.id);
            expect(msg.orgId).toBe(sender.orgId);
            expect(new Set(msg.toWorkerIds)).toEqual(new Set(dedupRecipientIds));
            for (const id of msg.toWorkerIds) {
              const r = byId.get(id)!;
              expect(r.orgId).toBe(sender.orgId);
              expect(r.tenantId).toBe(sender.tenantId);
            }
          } else {
            // FAIL CLOSED: send rejects, nothing delivered, nothing persisted.
            await expect(bus.send(sender.id, recipientIds, msgType, 'payload')).rejects.toBeTruthy();

            expect(delivery.calls).toHaveLength(0);
            expect(prisma.agentBusEmailMeta.create).not.toHaveBeenCalled();
            expect(prisma.agentWorkItem.create).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
