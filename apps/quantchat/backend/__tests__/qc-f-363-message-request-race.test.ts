// ===========================================================================
// QC-F-363 — Message-request ACCEPT/DECLINE race regression tests
// ===========================================================================
//
// The defect (loop-audit security, origin/main @ a698993b0): accept() read
// the request status OUTSIDE its transaction (loadForResponse) and the
// transaction's final update was unconditional (`where: { id }` only — no
// status predicate). Two concurrent accepts (double-tap, two devices,
// client retry) both saw PENDING and both ran the whole transaction:
// TWO DIRECT conversations + TWO first messages for ONE request, the row
// pointing at only the last writer. decline() had no transaction and the
// same unconditional update, so accept‖decline could end DECLINED with a
// live conversation attached (or a declined request silently ACCEPTED).
// accept() also never re-checked the sender inside the transaction, so a
// sender deleted after sending still got a conversation delivered.
//
// The fix pinned here (specialist-qc-f-363-buildprep.md §5, the QC-F-095
// CAS precedent): the FIRST step inside accept's transaction is an atomic
// claim — `updateMany({ where: { id, status: 'PENDING' }, data: {
// status: 'ACCEPTED', respondedAt } })`. The claim loser (count 0) writes
// nothing, re-reads the row after the transaction, and answers with the
// sequential truth (winner's conversationId, or 409 if DECLINED). The
// sender-liveness check (missing row or deletedAt → 410
// MESSAGE_REQUEST_SENDER_GONE, transaction rolls back, request stays
// PENDING) runs inside the transaction after the claim, before any
// create. decline() is a single CAS updateMany + the same reread map.
//
// Harness (qc-f-095-amend-concurrency pattern): ONE shared store with
// per-caller client views (two MessageRequestService instances = the
// recipient's two devices). The claim (updateMany) does its
// check-and-set SYNCHRONOUSLY in the call body — atomic under JS
// interleaving exactly the way the row lock makes it atomic in Postgres;
// $transaction models snapshot rollback. Deterministic gates (onLoad
// barrier + txGate) park a caller at an exact point so the interleaving
// that constitutes the defect is REPRODUCED, never left to timing luck:
// both callers load PENDING first, then one side is held while the
// other commits. The client deliberately serves BOTH surfaces (update
// AND updateMany), so this same file runs against the ORIGINAL service
// for the negative control.
//
// EPISTEMIC LIMIT (brief §6.1, stated honestly): these tests pin the
// LOGIC. Postgres atomicity itself rests on the single-statement CAS
// row-lock semantics — the same basis the shipped QC-F-095 amend stands
// on. "Tests green" here is never "the race was proven on a real DB";
// that proof belongs to the verify lane on staging.
//
// Negative-control signature on the ORIGINAL service (brief §6.3):
//   FAIL (6 parts): R1, R2(i), R2(ii), G1, G2, S0
//   PASS (7 controls): R3, R5, G3, S1, S2, C1, C2
// ===========================================================================

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MessageRequestService } from '../services/message-request.service';

const S = 'user_sender';
const T = 'user_target';

interface FakeUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  deletedAt: Date | null;
  preferences: unknown;
}

interface FakeRequest {
  id: string;
  senderId: string;
  targetId: string;
  firstMessage: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  conversationId: string | null;
  createdAt: Date;
  respondedAt: Date | null;
}

interface FakeConversation {
  id: string;
  [key: string]: unknown;
}

interface FakeMember {
  conversationId: string;
  userId: string;
  role: string;
  leftAt: Date | null;
  [key: string]: unknown;
}

interface FakeMessage {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  content: string | null;
  [key: string]: unknown;
}

interface Store {
  users: Map<string, FakeUser>;
  requests: FakeRequest[];
  conversations: FakeConversation[];
  members: FakeMember[];
  messages: FakeMessage[];
  closeFriends: Array<{ userId: string; friendId: string }>;
  /** While > 0, message.create throws (transient DB failure) and decrements. */
  failNextMessageCreates: number;
  reqSeq: number;
  convSeq: number;
  msgSeq: number;
}

interface ClientHooks {
  /** Awaited inside messageRequest.findUnique (id lookups only), after the
   *  row is read — lets a test hold BOTH callers at "loaded PENDING". */
  onLoad?: () => Promise<void> | void;
  /** Runs when this client's $transaction is entered. */
  onTransactionEnter?: () => void;
  /** If set, this client's $transaction waits for it before executing —
   *  parks a caller mid-response so a test can interleave deterministically. */
  txGate?: Promise<void>;
}

function makeUser(id: string, over: Partial<FakeUser> = {}): FakeUser {
  return {
    id,
    username: id.replace('user_', ''),
    displayName: `User ${id.replace('user_', '')}`,
    avatarUrl: null,
    status: 'ACTIVE',
    deletedAt: null,
    preferences: null,
    ...over,
  };
}

function makeStore(): Store {
  return {
    users: new Map([
      [S, makeUser(S)],
      [T, makeUser(T)],
    ]),
    requests: [],
    conversations: [],
    members: [],
    messages: [],
    closeFriends: [],
    failNextMessageCreates: 0,
    reqSeq: 0,
    convSeq: 0,
    msgSeq: 0,
  };
}

/** Seed a PENDING request row directly (the create path is C2's subject). */
function seedRequest(store: Store, firstMessage = 'salaam, pehla message'): FakeRequest {
  const row: FakeRequest = {
    id: `req_${++store.reqSeq}`,
    senderId: S,
    targetId: T,
    firstMessage,
    status: 'PENDING',
    conversationId: null,
    createdAt: new Date(Date.now() + store.reqSeq),
    respondedAt: null,
  };
  store.requests.push(row);
  return row;
}

function deferred() {
  let resolveFn!: () => void;
  const promise = new Promise<void>((r) => {
    resolveFn = r;
  });
  return { promise, resolve: resolveFn };
}

/** A barrier that releases only once `expected` callers have loaded. */
function loadBarrier(expected: number) {
  const gate = deferred();
  const allLoaded = deferred();
  let seen = 0;
  const onLoad = async () => {
    seen += 1;
    if (seen === expected) allLoaded.resolve();
    await gate.promise;
  };
  return { onLoad, allLoaded: allLoaded.promise, release: () => gate.resolve() };
}

function makeClient(store: Store, hooks: ClientHooks = {}) {
  const partyOf = (u: FakeUser) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
  });

  const client = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.users.get(where.id);
        return row ? { ...row } : null;
      },
    },
    closeFriend: {
      findMany: async ({ where }: { where: { userId: string; friendId: string } }) =>
        store.closeFriends.filter(
          (e) => e.userId === where.userId && e.friendId === where.friendId,
        ),
    },
    conversation: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row: FakeConversation = { id: `conv_${++store.convSeq}`, ...data };
        store.conversations.push(row);
        return row;
      },
      findMany: async ({ where }: { where: { id: { in: string[] }; type: string } }) =>
        store.conversations.filter(
          (c) => where.id.in.includes(c.id) && c.type === where.type,
        ),
    },
    conversationMember: {
      createMany: async ({ data }: { data: FakeMember[] }) => {
        store.members.push(...data);
        return { count: data.length };
      },
      findMany: async ({
        where,
      }: {
        where: {
          userId?: string;
          conversationId?: string | { in: string[] };
          leftAt?: null;
        };
      }) => {
        let rows = store.members.filter((m) => m.leftAt == null);
        if (where.userId) rows = rows.filter((m) => m.userId === where.userId);
        const convFilter = where.conversationId;
        if (typeof convFilter === 'string') {
          rows = rows.filter((m) => m.conversationId === convFilter);
        } else if (convFilter) {
          rows = rows.filter((m) => convFilter.in.includes(m.conversationId));
        }
        return rows;
      },
    },
    message: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (store.failNextMessageCreates > 0) {
          store.failNextMessageCreates -= 1;
          throw new Error('DB temporarily unavailable');
        }
        const row: FakeMessage = {
          id: `msg_${++store.msgSeq}`,
          conversationId: String(data.conversationId),
          senderId: String(data.senderId),
          type: String(data.type),
          content: (data.content as string | null) ?? null,
          ...data,
        };
        store.messages.push(row);
        return row;
      },
    },
    messageRequest: {
      findUnique: async ({
        where,
      }: {
        where: {
          id?: string;
          senderId_targetId?: { senderId: string; targetId: string };
        };
      }) => {
        let row: FakeRequest | null = null;
        if (where.id) {
          row = store.requests.find((r) => r.id === where.id) ?? null;
        } else if (where.senderId_targetId) {
          const pair = where.senderId_targetId;
          row =
            store.requests.find(
              (r) => r.senderId === pair.senderId && r.targetId === pair.targetId,
            ) ?? null;
        }
        // The load hook fires for id lookups (loadForResponse + rereads);
        // pair lookups (createRequest idempotency) are not race choreography.
        if (where.id && hooks.onLoad) await hooks.onLoad();
        return row ? { ...row } : null;
      },
      findMany: async ({
        where,
        include,
      }: {
        where: { targetId?: string; senderId?: string; status?: string };
        include?: { sender?: unknown; target?: unknown };
      }) => {
        let rows = [...store.requests];
        if (where.targetId) rows = rows.filter((r) => r.targetId === where.targetId);
        if (where.senderId) rows = rows.filter((r) => r.senderId === where.senderId);
        if (where.status) rows = rows.filter((r) => r.status === where.status);
        rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows.map((r) => ({
          ...r,
          ...(include?.sender ? { sender: partyOf(store.users.get(r.senderId)!) } : {}),
          ...(include?.target ? { target: partyOf(store.users.get(r.targetId)!) } : {}),
        }));
      },
      count: async ({ where }: { where: { senderId: string; status: string } }) =>
        store.requests.filter(
          (r) => r.senderId === where.senderId && r.status === where.status,
        ).length,
      create: async ({
        data,
      }: {
        data: Omit<FakeRequest, 'id' | 'createdAt' | 'respondedAt' | 'conversationId'> & {
          status: 'PENDING';
        };
      }) => {
        if (
          store.requests.some(
            (r) => r.senderId === data.senderId && r.targetId === data.targetId,
          )
        ) {
          const err = new Error('Unique constraint failed') as Error & { code: string };
          err.code = 'P2002';
          throw err;
        }
        const row: FakeRequest = {
          id: `req_${++store.reqSeq}`,
          conversationId: null,
          createdAt: new Date(Date.now() + store.reqSeq),
          respondedAt: null,
          ...data,
        };
        store.requests.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeRequest>;
      }) => {
        const row = store.requests.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      // The atomic claim: check-and-set runs synchronously in the call
      // body, so no other caller's code can interleave between the
      // predicate check and the write — the JS model of the Postgres
      // row lock a single conditional UPDATE takes (QC-F-095 header).
      updateMany: (args: unknown) => {
        const { where, data } = args as {
          where: { id: string; status: 'PENDING' };
          data: Partial<FakeRequest>;
        };
        const row = store.requests.find(
          (r) => r.id === where.id && r.status === where.status,
        );
        if (!row) return Promise.resolve({ count: 0 });
        Object.assign(row, data);
        return Promise.resolve({ count: 1 });
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      hooks.onTransactionEnter?.();
      if (hooks.txGate) await hooks.txGate;
      const requestSnapshot = store.requests.map((r) => ({ ...r }));
      const convLen = store.conversations.length;
      const memberLen = store.members.length;
      const msgLen = store.messages.length;
      const convSeq = store.convSeq;
      const msgSeq = store.msgSeq;
      try {
        return await fn(client);
      } catch (error) {
        store.requests.splice(0, store.requests.length, ...requestSnapshot);
        store.conversations.length = convLen;
        store.members.length = memberLen;
        store.messages.length = msgLen;
        store.convSeq = convSeq;
        store.msgSeq = msgSeq;
        throw error;
      }
    },
  };

  return client;
}

function serviceFor(store: Store, hooks: ClientHooks = {}) {
  return new MessageRequestService(makeClient(store, hooks) as never);
}

describe('QC-F-363 message-request accept/decline races', () => {
  it('R1: two concurrent accepts create exactly ONE conversation and ONE message; both callers get the same conversationId', async () => {
    const store = makeStore();
    const req = seedRequest(store);
    const barrier = loadBarrier(2);
    const loserGate = deferred();
    const loserEntered = deferred();

    const winner = serviceFor(store, { onLoad: barrier.onLoad });
    const loser = serviceFor(store, {
      onLoad: barrier.onLoad,
      txGate: loserGate.promise,
      onTransactionEnter: () => loserEntered.resolve(),
    });

    const pWinner = winner.accept(req.id, T);
    const pLoser = loser.accept(req.id, T);
    const settled = Promise.allSettled([pWinner, pLoser]);

    // Both callers have loaded the row as PENDING — the defect's window.
    await barrier.allLoaded;
    barrier.release();

    // The loser is parked inside its transaction; the winner commits fully.
    await loserEntered.promise;
    const winnerResult = await pWinner;
    expect(store.conversations).toHaveLength(1);
    expect(store.messages).toHaveLength(1);

    loserGate.resolve();
    const [w, l] = await settled;
    expect(w.status).toBe('fulfilled');
    expect(l.status).toBe('fulfilled');
    if (l.status !== 'fulfilled') throw new Error('loser must fulfil');

    // Still exactly one of everything, and the loser was answered with
    // the winner's REAL conversation (the sequential-idempotent truth),
    // not a second one and not a fake success.
    expect(store.conversations).toHaveLength(1);
    expect(store.members).toHaveLength(2);
    expect(store.messages).toHaveLength(1);
    expect(l.value.conversationId).toBe(winnerResult.conversationId);
    expect(l.value.request.status).toBe('ACCEPTED');
    expect(l.value.request.conversationId).toBe(winnerResult.conversationId);
    const row = store.requests[0]!;
    expect(row.status).toBe('ACCEPTED');
    expect(row.conversationId).toBe(winnerResult.conversationId);
  });

  it('R2(i): accept wins the race — decline gets 409 and the terminal state is ACCEPTED with its conversation', async () => {
    const store = makeStore();
    const req = seedRequest(store);
    const barrier = loadBarrier(2);

    const accepter = serviceFor(store, { onLoad: barrier.onLoad });
    const decliner = serviceFor(store, { onLoad: barrier.onLoad });

    const pAccept = accepter.accept(req.id, T);
    const pDecline = decliner.decline(req.id, T);
    const settled = Promise.allSettled([pAccept, pDecline]);

    await barrier.allLoaded;
    barrier.release();

    const [a, d] = await settled;
    expect(a.status).toBe('fulfilled');
    expect(d.status).toBe('rejected');
    if (d.status !== 'rejected') throw new Error('decline must reject');
    expect(d.reason).toMatchObject({
      statusCode: 409,
      code: 'MESSAGE_REQUEST_NOT_PENDING',
    });

    const row = store.requests[0]!;
    expect(row.status).toBe('ACCEPTED');
    expect(row.conversationId).not.toBeNull();
    expect(store.conversations).toHaveLength(1);
    expect(store.conversations[0]!.id).toBe(row.conversationId);
    expect(store.messages).toHaveLength(1);
  });

  it('R2(ii): decline wins the race — accept gets 409, NO conversation exists, and DECLINED never carries a conversationId', async () => {
    const store = makeStore();
    const req = seedRequest(store);
    const barrier = loadBarrier(2);
    const acceptGate = deferred();
    const acceptEntered = deferred();

    const accepter = serviceFor(store, {
      onLoad: barrier.onLoad,
      txGate: acceptGate.promise,
      onTransactionEnter: () => acceptEntered.resolve(),
    });
    const decliner = serviceFor(store, { onLoad: barrier.onLoad });

    const pAccept = accepter.accept(req.id, T);
    const pDecline = decliner.decline(req.id, T);
    const settled = Promise.allSettled([pAccept, pDecline]);

    await barrier.allLoaded;
    barrier.release();

    // Accept is parked inside its transaction; decline commits first.
    await acceptEntered.promise;
    const declineResult = await pDecline;
    expect(declineResult.request.status).toBe('DECLINED');
    expect(store.requests[0]!.status).toBe('DECLINED');

    acceptGate.resolve();
    const [a] = await settled;
    expect(a.status).toBe('rejected');
    if (a.status !== 'rejected') throw new Error('accept must reject');
    expect(a.reason).toMatchObject({
      statusCode: 409,
      code: 'MESSAGE_REQUEST_NOT_PENDING',
    });

    // The self-contradictory state (DECLINED + conversationId + a live
    // conversation) is structurally impossible now.
    const row = store.requests[0]!;
    expect(row.status).toBe('DECLINED');
    expect(row.conversationId).toBeNull();
    expect(store.conversations).toHaveLength(0);
    expect(store.messages).toHaveLength(0);
  });

  it('R3: two concurrent declines — both succeed idempotently, terminal DECLINED, nothing created (control)', async () => {
    const store = makeStore();
    const req = seedRequest(store);
    const barrier = loadBarrier(2);

    const d1 = serviceFor(store, { onLoad: barrier.onLoad });
    const d2 = serviceFor(store, { onLoad: barrier.onLoad });

    const p1 = d1.decline(req.id, T);
    const p2 = d2.decline(req.id, T);
    const settled = Promise.allSettled([p1, p2]);

    await barrier.allLoaded;
    barrier.release();

    const [r1, r2] = await settled;
    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');
    const row = store.requests[0]!;
    expect(row.status).toBe('DECLINED');
    expect(row.conversationId).toBeNull();
    expect(store.conversations).toHaveLength(0);
    expect(store.messages).toHaveLength(0);
  });

  it('R5: winner transaction fails transiently and rolls back — the parked loser then wins; exactly one conversation overall (control)', async () => {
    const store = makeStore();
    store.failNextMessageCreates = 1;
    const req = seedRequest(store);
    const barrier = loadBarrier(2);
    const loserGate = deferred();
    const loserEntered = deferred();

    const winner = serviceFor(store, { onLoad: barrier.onLoad });
    const loser = serviceFor(store, {
      onLoad: barrier.onLoad,
      txGate: loserGate.promise,
      onTransactionEnter: () => loserEntered.resolve(),
    });

    const pWinner = winner.accept(req.id, T);
    const pLoser = loser.accept(req.id, T);
    const settled = Promise.allSettled([pWinner, pLoser]);

    await barrier.allLoaded;
    barrier.release();
    await loserEntered.promise;

    // The winner's transaction dies at message.create and rolls back:
    // the claim rolls back with it — request PENDING, nothing created.
    await expect(pWinner).rejects.toThrow('DB temporarily unavailable');
    expect(store.requests[0]!.status).toBe('PENDING');
    expect(store.conversations).toHaveLength(0);
    expect(store.messages).toHaveLength(0);

    loserGate.resolve();
    const [, l] = await settled;
    expect(l.status).toBe('fulfilled');
    if (l.status !== 'fulfilled') throw new Error('loser must fulfil');
    expect(store.conversations).toHaveLength(1);
    expect(store.messages).toHaveLength(1);
    const row = store.requests[0]!;
    expect(row.status).toBe('ACCEPTED');
    expect(row.conversationId).toBe(l.value.conversationId);
  });

  it('G1: sender soft-deleted after sending — accept answers 410 MESSAGE_REQUEST_SENDER_GONE, creates nothing, request stays PENDING and declinable', async () => {
    const store = makeStore();
    const req = seedRequest(store);
    store.users.get(S)!.deletedAt = new Date();

    const svc = serviceFor(store);
    await expect(svc.accept(req.id, T)).rejects.toMatchObject({
      statusCode: 410,
      code: 'MESSAGE_REQUEST_SENDER_GONE',
    });
    expect(store.conversations).toHaveLength(0);
    expect(store.messages).toHaveLength(0);
    // Rollback honesty: the request was NOT flipped to a false DECLINED
    // and NOT half-accepted — it is still PENDING…
    expect(store.requests[0]!.status).toBe('PENDING');
    expect(store.requests[0]!.conversationId).toBeNull();
    // …so the recipient can still clear it from the inbox by declining.
    const declined = await svc.decline(req.id, T);
    expect(declined.request.status).toBe('DECLINED');
  });

  it('G2: sender row missing entirely — accept answers the same 410 and creates nothing', async () => {
    const store = makeStore();
    const req = seedRequest(store);
    store.users.delete(S);

    const svc = serviceFor(store);
    await expect(svc.accept(req.id, T)).rejects.toMatchObject({
      statusCode: 410,
      code: 'MESSAGE_REQUEST_SENDER_GONE',
    });
    expect(store.conversations).toHaveLength(0);
    expect(store.messages).toHaveLength(0);
    expect(store.requests[0]!.status).toBe('PENDING');
  });

  it("G3: sender status is NOT re-gated — a PENDING_VERIFICATION sender's request still accepts (control)", async () => {
    const store = makeStore();
    const req = seedRequest(store);
    store.users.get(S)!.status = 'PENDING_VERIFICATION';

    const svc = serviceFor(store);
    const result = await svc.accept(req.id, T);
    expect(result.conversationId).toBeTruthy();
    expect(store.conversations).toHaveLength(1);
    expect(store.messages).toHaveLength(1);
    expect(store.requests[0]!.status).toBe('ACCEPTED');
  });

  it('S1: sequential double-accept stays idempotent — same conversation, nothing new (control)', async () => {
    const store = makeStore();
    const req = seedRequest(store);
    const svc = serviceFor(store);

    const first = await svc.accept(req.id, T);
    const second = await svc.accept(req.id, T);
    expect(second.conversationId).toBe(first.conversationId);
    expect(store.conversations).toHaveLength(1);
    expect(store.messages).toHaveLength(1);
  });

  it('S2: sequential wrong-order responses stay 409 MESSAGE_REQUEST_NOT_PENDING (control)', async () => {
    const store = makeStore();
    const svc = serviceFor(store);

    const req1 = seedRequest(store, 'pehla');
    await svc.decline(req1.id, T);
    await expect(svc.accept(req1.id, T)).rejects.toMatchObject({
      statusCode: 409,
      code: 'MESSAGE_REQUEST_NOT_PENDING',
    });

    const req2 = seedRequest(store, 'dusra');
    await svc.accept(req2.id, T);
    await expect(svc.decline(req2.id, T)).rejects.toMatchObject({
      statusCode: 409,
      code: 'MESSAGE_REQUEST_NOT_PENDING',
    });
  });

  it('C1: a single accept keeps its exact shapes — DIRECT conversation, sender OWNER with lastReadAt, target MEMBER without, first message as TEXT (control)', async () => {
    const store = makeStore();
    const req = seedRequest(store, 'pehla salaam');
    const svc = serviceFor(store);

    const result = await svc.accept(req.id, T);
    const conv = store.conversations[0]!;
    expect(conv.id).toBe(result.conversationId);
    expect(conv.type).toBe('DIRECT');
    expect(conv.createdBy).toBe(S);

    const senderMember = store.members.find((m) => m.userId === S)!;
    const targetMember = store.members.find((m) => m.userId === T)!;
    expect(senderMember.conversationId).toBe(conv.id);
    expect(senderMember.role).toBe('OWNER');
    expect(senderMember.lastReadAt).toBeInstanceOf(Date);
    expect(targetMember.conversationId).toBe(conv.id);
    expect(targetMember.role).toBe('MEMBER');
    expect(targetMember.lastReadAt).toBeNull();

    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]).toMatchObject({
      conversationId: conv.id,
      senderId: S,
      type: 'TEXT',
      content: 'pehla salaam',
    });
  });

  it('C2: createRequest is unchanged — duplicate PENDING is idempotent with the FIRST text, DECLINED pair re-request is 403 (control)', async () => {
    const store = makeStore();
    const svc = serviceFor(store);

    const first = await svc.createRequest(S, T, 'pehla text');
    expect(first.created).toBe(true);
    expect(first.request.status).toBe('PENDING');

    const dupe = await svc.createRequest(S, T, 'badla hua text');
    expect(dupe.created).toBe(false);
    expect(dupe.request.id).toBe(first.request.id);
    expect(dupe.request.firstMessage).toBe('pehla text');
    expect(store.requests).toHaveLength(1);

    await svc.decline(first.request.id, T);
    await expect(svc.createRequest(S, T, 'ek aur mauka?')).rejects.toMatchObject({
      statusCode: 403,
      code: 'MESSAGE_REQUEST_DECLINED',
    });
    expect(store.requests).toHaveLength(1);
  });

  it('S0: source pin — accept and decline both claim through a PENDING-predicated updateMany; decline has no unconditional update left', () => {
    const candidates = [
      resolve(process.cwd(), 'backend/services/message-request.service.ts'),
      resolve(process.cwd(), 'apps/quantchat/backend/services/message-request.service.ts'),
    ];
    const found = candidates.find((p) => existsSync(p));
    if (!found) throw new Error('Could not locate message-request.service.ts');
    const src = readFileSync(found, 'utf8');

    const acceptStart = src.indexOf('async accept(');
    const declineStart = src.indexOf('async decline(');
    expect(acceptStart).toBeGreaterThan(-1);
    expect(declineStart).toBeGreaterThan(acceptStart);
    const acceptSection = src.slice(acceptStart, declineStart);
    const declineSection = src.slice(declineStart);

    expect(acceptSection).toContain('updateMany');
    expect(acceptSection).toContain("status: 'PENDING'");
    expect(declineSection).toContain('updateMany');
    expect(declineSection).toContain("status: 'PENDING'");
    // The defect's exact shape in decline: an unconditional update by id.
    // (accept's final conversationId update keeps that shape ON PURPOSE —
    // it runs inside the claimed transaction — so this pin is scoped to
    // the decline section only.)
    expect(declineSection).not.toMatch(/messageRequest\.update\(\{/);
  });
});
