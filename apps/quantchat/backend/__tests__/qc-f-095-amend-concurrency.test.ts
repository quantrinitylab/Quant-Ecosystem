// ===========================================================================
// QC-F-095 AMEND — scheduled-message worker race regression tests
// ===========================================================================
//
// CODEX-REVIEW on PR #966 (head 1a792c5c) requested changes on the original
// QC-F-095 delivery gate:
//
//  1. The membership check and message creation were not atomic —
//     passesDeliveryGate read membership OUTSIDE deliver()'s transaction,
//     so a removal committing after the lookup but before tx.message.create
//     still injected the scheduled message after rights loss.
//  2. There was no row claim: every app replica runs a
//     ScheduledMessageWorker, and two workers could both poll the same
//     PENDING row, both pass the gate, each create a real Message, and each
//     unconditionally update the row to SENT — duplicate delivery. The
//     gate's own out-of-transaction CANCELLED update could likewise
//     overwrite a concurrent SENT.
//
// Fix pinned here: delivery is a single atomic authorization/claim
// operation inside ONE transaction — a conditional updateMany
// (PENDING → SENT) claims the row, membership is re-checked inside the
// transaction after the claim, and only then is the Message created. A
// deterministic gate failure inside the transaction flips the claimed row
// to CANCELLED and commits; a transient failure rolls the whole
// transaction back, leaving the row PENDING for the next tick.
//
// Fake design: one shared store (rows, memberships, created messages) with
// a per-worker client view — the way two replicas see one database. The
// claim (updateMany) does its check-and-set synchronously in the call
// body, which is atomic under JS interleaving exactly the way the row
// lock makes it atomic in Postgres; $transaction models rollback. Hooks
// let a test land a concurrent commit (revocation, cancellation) at a
// precise point in another worker's delivery.
//
// The client deliberately serves BOTH the pre-amend worker surface
// (top-level conversationMember.findFirst / scheduledMessage.update, a tx
// without updateMany) and the amended one, so this same file runs against
// the pre-amend worker for the negative control:
//  - cases 1, 2, 3a, 3b FAIL on the pre-amend worker (duplicate delivery,
//    injection after revocation, SENT overwritten / duplicated);
//  - case 4 (transient retry) passes on both — it pins behaviour the amend
//    must preserve.
// ===========================================================================

import { describe, expect, it, vi } from 'vitest';
import {
  ScheduledMessageWorker,
  type ScheduledMessageRecord,
} from '../services/scheduled-message-worker';

const CONV = 'conv-race';
const MEMBER = 'user_member';

const key = (userId: string, conversationId: string) => `${userId}::${conversationId}`;

/** Membership rows: key → leftAt (null = active member, Date = has left). */
type MembershipMap = Map<string, Date | null>;

interface SchedRow extends ScheduledMessageRecord {
  status: 'PENDING' | 'SENT' | 'CANCELLED';
}

interface CreatedMessage {
  conversationId: string;
  senderId: string;
  content: string;
  type?: string;
}

interface Store {
  rows: SchedRow[];
  memberships: MembershipMap;
  created: CreatedMessage[];
  /** While > 0, message.create throws (transient DB failure) and decrements. */
  failNextMessageCreates: number;
}

interface ClientHooks {
  /** Runs synchronously inside this client's claim, before the CAS check —
   *  models a concurrent commit landing as the delivery transaction begins. */
  onClaim?: (store: Store) => void;
  /** Runs when this client's $transaction is entered. */
  onTransactionEnter?: () => void;
  /** If set, this client's $transaction waits for it before executing —
   *  parks a worker mid-delivery so a test can interleave deterministically. */
  txGate?: Promise<void>;
}

function lookupMembership(store: Store, userId: string, conversationId: string) {
  const leftAt = store.memberships.get(key(userId, conversationId));
  if (leftAt === undefined || leftAt !== null) return null;
  return { id: `mem_${userId}_${conversationId}` };
}

function makeClient(store: Store, hooks: ClientHooks = {}) {
  const scheduledUpdate = async (args: unknown) => {
    const { where, data } = args as {
      where: { id: string };
      data: { status: SchedRow['status'] };
    };
    const row = store.rows.find((r) => r.id === where.id);
    if (row) row.status = data.status;
    return row;
  };

  // The atomic claim: check-and-set runs synchronously in the call body,
  // so no other worker's code can interleave between check and set.
  const scheduledUpdateMany = (args: unknown) => {
    hooks.onClaim?.(store);
    const { where, data } = args as {
      where: { id: string; status: SchedRow['status'] };
      data: { status: SchedRow['status'] };
    };
    const row = store.rows.find((r) => r.id === where.id);
    if (!row || row.status !== where.status) return Promise.resolve({ count: 0 });
    row.status = data.status;
    return Promise.resolve({ count: 1 });
  };

  const findFirst = async (args: unknown) => {
    const { where } = args as {
      where: { conversationId: string; userId: string; leftAt: null };
    };
    return lookupMembership(store, where.userId, where.conversationId);
  };

  const tx = {
    conversationMember: { findFirst },
    message: {
      create: async (args: unknown) => {
        if (store.failNextMessageCreates > 0) {
          store.failNextMessageCreates -= 1;
          throw new Error('DB temporarily unavailable');
        }
        const { data } = args as { data: CreatedMessage };
        store.created.push(data);
        return { id: `m_${store.created.length}`, ...data };
      },
    },
    conversation: { update: async () => ({}) },
    scheduledMessage: { updateMany: scheduledUpdateMany, update: scheduledUpdate },
  };

  return {
    // Pre-amend surface (the old gate used these top-level delegates).
    conversationMember: { findFirst },
    scheduledMessage: {
      findMany: async ({ where }: { where: { status: string; scheduledFor: { lte: Date } } }) =>
        store.rows
          .filter((r) => r.status === where.status && r.scheduledFor <= where.scheduledFor.lte)
          .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime()),
      update: scheduledUpdate,
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      hooks.onTransactionEnter?.();
      if (hooks.txGate) await hooks.txGate;
      const statusSnapshot = store.rows.map((r) => r.status);
      const createdSnapshot = store.created.length;
      try {
        return await fn(tx);
      } catch (error) {
        store.rows.forEach((r, i) => {
          r.status = statusSnapshot[i]!;
        });
        store.created.length = createdSnapshot;
        throw error;
      }
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const NOW = new Date('2025-01-01T12:00:00Z');

function makeStore(over: Partial<Store> = {}): Store {
  return {
    rows: [
      {
        id: 's1',
        userId: MEMBER,
        conversationId: CONV,
        content: 'race hello',
        scheduledFor: new Date('2025-01-01T11:59:50Z'),
        status: 'PENDING',
      },
    ],
    memberships: new Map([[key(MEMBER, CONV), null]]),
    created: [],
    failNextMessageCreates: 0,
    ...over,
  };
}

describe('QC-F-095 AMEND ScheduledMessageWorker delivery races', () => {
  it('1. two workers racing one due row deliver exactly one Message and one callback', async () => {
    const store = makeStore();
    const onDeliveredA = vi.fn();
    const onDeliveredB = vi.fn();
    const workerA = new ScheduledMessageWorker(makeClient(store) as never, {
      onDelivered: onDeliveredA,
    });
    const workerB = new ScheduledMessageWorker(makeClient(store) as never, {
      onDelivered: onDeliveredB,
    });

    const [deliveredA, deliveredB] = await Promise.all([workerA.tick(NOW), workerB.tick(NOW)]);

    expect(deliveredA + deliveredB).toBe(1);
    expect(store.created).toHaveLength(1);
    expect(store.created[0]).toMatchObject({ conversationId: CONV, senderId: MEMBER });
    expect(store.rows[0]!.status).toBe('SENT');
    expect(onDeliveredA.mock.calls.length + onDeliveredB.mock.calls.length).toBe(1);
  });

  it('2. membership revoked between poll and transaction → zero Messages, terminal CANCELLED', async () => {
    const store = makeStore();
    // The removal commits exactly as the delivery transaction begins —
    // after any pre-transaction lookup could have run, before the write.
    const client = makeClient(store, {
      onClaim: (s) => {
        s.memberships.set(key(MEMBER, CONV), new Date('2025-01-01T11:59:59Z'));
      },
    });
    const onDelivered = vi.fn();
    const onError = vi.fn();
    const worker = new ScheduledMessageWorker(client as never, { onDelivered, onError });

    const delivered = await worker.tick(NOW);

    expect(delivered).toBe(0);
    expect(store.created).toHaveLength(0);
    expect(store.rows[0]!.status).toBe('CANCELLED');
    expect(onDelivered).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    // Terminal: never retried, never delivered by a later tick.
    const again = await worker.tick(new Date('2025-01-01T12:00:30Z'));
    expect(again).toBe(0);
    expect(store.created).toHaveLength(0);
    expect(store.rows[0]!.status).toBe('CANCELLED');
  });

  it('3a. cancellation landing before the claim → no injection, CANCELLED stands', async () => {
    const store = makeStore();
    // An external cancel commits as the delivery transaction begins,
    // before the claim evaluates the row.
    const client = makeClient(store, {
      onClaim: (s) => {
        s.rows[0]!.status = 'CANCELLED';
      },
    });
    const onError = vi.fn();
    const worker = new ScheduledMessageWorker(client as never, { onError });

    const delivered = await worker.tick(NOW);

    expect(delivered).toBe(0);
    expect(store.created).toHaveLength(0);
    expect(store.rows[0]!.status).toBe('CANCELLED');
    expect(onError).not.toHaveBeenCalled();
  });

  it('3b. a stale worker parked mid-delivery cannot overwrite SENT or duplicate the Message', async () => {
    const store = makeStore();
    const gate = deferred();
    const entered = deferred();
    // Worker B polls the row while it is PENDING, then parks inside its
    // delivery step until the test releases it.
    const staleClient = makeClient(store, {
      txGate: gate.promise,
      onTransactionEnter: () => entered.resolve(),
    });
    const staleWorker = new ScheduledMessageWorker(staleClient as never);
    const freshWorker = new ScheduledMessageWorker(makeClient(store) as never);

    const staleTick = staleWorker.tick(NOW);
    await entered.promise; // B has the PENDING row and is parked mid-delivery

    // Worker A delivers the row for real in the meantime.
    const deliveredByA = await freshWorker.tick(NOW);
    expect(deliveredByA).toBe(1);
    expect(store.rows[0]!.status).toBe('SENT');

    // The scheduler leaves the conversation now — irrelevant post-delivery;
    // B's stale attempt must still not disturb the terminal state.
    store.memberships.set(key(MEMBER, CONV), new Date('2025-01-01T12:00:01Z'));
    gate.resolve();
    const deliveredByB = await staleTick;

    expect(deliveredByB).toBe(0);
    expect(store.created).toHaveLength(1);
    expect(store.rows[0]!.status).toBe('SENT');
  });

  it('4. transient DB failure inside delivery leaves the row PENDING; next tick delivers', async () => {
    const store = makeStore({ failNextMessageCreates: 1 });
    const onError = vi.fn();
    const worker = new ScheduledMessageWorker(makeClient(store) as never, { onError });

    const first = await worker.tick(NOW);
    expect(first).toBe(0);
    expect(store.rows[0]!.status).toBe('PENDING');
    expect(store.created).toHaveLength(0);
    expect(onError).toHaveBeenCalledTimes(1);

    const second = await worker.tick(new Date('2025-01-01T12:00:30Z'));
    expect(second).toBe(1);
    expect(store.rows[0]!.status).toBe('SENT');
    expect(store.created).toHaveLength(1);
  });
});
