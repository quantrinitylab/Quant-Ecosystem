// ============================================================================
// QC-F-541 — Outbox `claimBatch` ka 'claim' asal claim NAHI tha
//
// Defect (origin/main @ a6c72cae2 par firsthand pusht): `claimBatch` ek
// standalone `$queryRaw` SELECT tha — `FOR UPDATE SKIP LOCKED` ke row locks
// statement khatm hote hi chhoot jaate the, SELECT ke baad koi status/lease
// write NAHI hota tha, aur schema me reservation ka koi column hi NAHI tha.
// Do DeliveryWorker instances (har replica apna worker chalata hai) ek hi
// unprocessed batch ko claim karke har event ko DO baar deliver kar sakte
// the — offline recipient par duplicate push pakka tha (push-dispatcher me
// koi dedup NAHI hai).
//
// Fix (brief specialist-qc-f-541-buildprep.md, READY): claim ab ek interactive
// `$transaction` ke andar hota hai aur har claimed row par `claimedAt` /
// `leaseExpiresAt` lease stamp hoti hai (migration 0106); live lease wali
// rows claim se bahar; markProcessed/markFailed lease saaf karte hain;
// worker ka backoff-skip claim ko release karta hai (warna lease retry ko
// 5s ki jagah 120s par dhakel deti).
//
// Tier-1 (ye suite, hamesha chalti hai): ASAL PrismaOutboxService +
// fake-outbox-prisma — ek transactional in-memory double jo $transaction ko
// serialize karta hai aur claim predicate ko SQL ke hu-ba-hu shabdon me lagu
// karta hai. HEADER WARNING: ye double Postgres ke SKIP LOCKED ko MODEL
// karta hai, asal lock NAHI hai.
// Tier-2 (neeche, TEST_DATABASE_URL-gated): wahi cases asal Postgres par.
// TEST_DATABASE_URL na ho to Tier-2 imaandaari se skip hoti hai — nakli pass
// NAHI. "Asal lock parkha gaya" ka daawa Tier-2 green hue bina NAHI hoga
// (HG-541-7).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  PrismaOutboxService,
  MAX_DELIVERY_ATTEMPTS,
  OUTBOX_CLAIM_LEASE_MS,
} from '../services/outbox.service';
import { DeliveryWorker } from '../services/delivery-worker';
import { createFakeOutboxPrisma, asOutboxPrismaClient, type FakeOutboxRow } from './fake-outbox-prisma';
import {
  Clock,
  FailureBudget,
  FakeBackplane,
  FakePresence,
  FakePushDispatcher,
} from './fake-delivery-deps';

const T0 = 1_700_000_000_000;
const LEASE_MS = 60_000;

interface VirtualClock {
  ms: number;
}

function makeService(
  fake: ReturnType<typeof createFakeOutboxPrisma>,
  clock: VirtualClock,
  leaseMs: number = LEASE_MS,
): PrismaOutboxService {
  return new PrismaOutboxService(asOutboxPrismaClient(fake), {
    leaseMs,
    now: () => new Date(clock.ms),
  });
}

function seedRows(
  fake: ReturnType<typeof createFakeOutboxPrisma>,
  count: number,
  extra: Partial<FakeOutboxRow> = {},
): FakeOutboxRow[] {
  return Array.from({ length: count }, (_, i) =>
    fake.__seed({
      conversationId: 'conv-541',
      messageId: `msg-541-${i}`,
      recipientIds: ['user-541'],
      createdAt: new Date(T0 + i * 1_000),
      ...extra,
    }),
  );
}

describe('QC-F-541 Tier-1 — PrismaOutboxService claim lease (asal service, transactional double)', () => {
  it('1. concurrent claimBatch calls return DISJOINT sets (union = saari rows)', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    const rows = seedRows(fake, 10);

    const [a, b] = await Promise.all([svc.claimBatch(10), svc.claimBatch(10)]);

    const aIds = new Set(a.map((e) => e.id));
    const bIds = b.map((e) => e.id);
    expect(bIds.filter((id) => aIds.has(id))).toEqual([]);
    expect(new Set([...aIds, ...bIds]).size).toBe(10);
    expect(a.length + b.length).toBe(10);

    // Har claimed row par lease stamp asal me likha gaya hai.
    for (const row of rows) {
      expect(row.claimedAt).toEqual(new Date(T0));
      expect(row.leaseExpiresAt).toEqual(new Date(T0 + LEASE_MS));
    }
  });

  it('2. live lease wali row dusre claim se bahar hai; lautaya event stamp carry karta hai', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    seedRows(fake, 1);

    const first = await svc.claimBatch(10);
    expect(first).toHaveLength(1);
    expect(first[0]!.claimedAt).toEqual(new Date(T0));
    expect(first[0]!.leaseExpiresAt).toEqual(new Date(T0 + LEASE_MS));

    const second = await svc.claimBatch(10);
    expect(second).toEqual([]);
  });

  it('3. lease-expired row dobara claim-yogya hai, naye stamp ke saath', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    const [expired] = seedRows(fake, 1, {
      claimedAt: new Date(T0 - 120_000),
      leaseExpiresAt: new Date(T0 - 1),
    });
    const [boundary] = seedRows(fake, 1, {
      messageId: 'msg-541-boundary',
      claimedAt: new Date(T0 - LEASE_MS),
      leaseExpiresAt: new Date(T0), // <= now → claimable (predicate band)
    });

    const claimed = await svc.claimBatch(10);
    expect(claimed.map((e) => e.id).sort()).toEqual([expired!.id, boundary!.id].sort());
    expect(expired!.claimedAt).toEqual(new Date(T0));
    expect(expired!.leaseExpiresAt).toEqual(new Date(T0 + LEASE_MS));
  });

  it('4. markProcessed lease saaf karta hai aur row phir kabhi claim NAHI hoti', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    const [row] = seedRows(fake, 1);

    const [event] = await svc.claimBatch(10);
    expect(row!.claimedAt).toEqual(new Date(T0)); // lease asal me lagi thi…
    await svc.markProcessed(event!.id);

    expect(row!.processedAt).toEqual(new Date(T0));
    expect(row!.claimedAt).toBeNull();
    expect(row!.leaseExpiresAt).toBeNull();

    clock.ms = T0 + LEASE_MS + 1; // lease samay bhi beet gaya
    expect(await svc.claimBatch(10)).toEqual([]);
  });

  it('5. markFailed lease saaf karta hai — row turant dobara claim-yogya', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    const [row] = seedRows(fake, 1);

    const [event] = await svc.claimBatch(10);
    expect(row!.claimedAt).toEqual(new Date(T0)); // lease asal me lagi thi…
    await svc.markFailed(event!.id, 'boom');

    expect(row!.attempts).toBe(1);
    expect(row!.lastError).toBe('boom');
    expect(row!.claimedAt).toBeNull();
    expect(row!.leaseExpiresAt).toBeNull();

    // Ghadi aage badhaaye bina — lease se bandhi NAHI, turant claim-yogya.
    const reclaimed = await svc.claimBatch(10);
    expect(reclaimed.map((e) => e.id)).toEqual([row!.id]);
  });

  it('6. dead-letter band barkarar: attempts > MAX claim NAHI, attempts == MAX claim hota hai', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    const [atMax] = seedRows(fake, 1, { attempts: MAX_DELIVERY_ATTEMPTS });
    seedRows(fake, 1, { messageId: 'msg-541-dead', attempts: MAX_DELIVERY_ATTEMPTS + 1 });

    const claimed = await svc.claimBatch(10);
    expect(claimed.map((e) => e.id)).toEqual([atMax!.id]);
  });

  it('7. releaseClaim lease saaf karta hai — row turant claim-yogya, attempts aparivartit', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    const [row] = seedRows(fake, 1);

    const [event] = await svc.claimBatch(10);
    await svc.releaseClaim(event!.id);

    expect(row!.claimedAt).toBeNull();
    expect(row!.leaseExpiresAt).toBeNull();
    expect(row!.processedAt).toBeNull();
    expect(row!.attempts).toBe(0);

    const reclaimed = await svc.claimBatch(10);
    expect(reclaimed.map((e) => e.id)).toEqual([row!.id]);
  });

  it('8. releaseClaim processed row ko NAHI chhedta (terminal claim-state)', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    const [row] = seedRows(fake, 1);

    const [event] = await svc.claimBatch(10);
    await svc.markProcessed(event!.id);
    await svc.releaseClaim(event!.id);

    expect(row!.processedAt).toEqual(new Date(T0));
    expect(await svc.claimBatch(10)).toEqual([]);
  });

  it('9. exactly-once dispatch (worker star): do workers, ek hi asal service, OFFLINE recipient — kul push exactly 1', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    const [row] = seedRows(fake, 1, { recipientIds: ['offline-user'] });

    const backplane = new FakeBackplane();
    const presence = new FakePresence([]); // koi online NAHI → push raasta
    const push = new FakePushDispatcher();
    const deps = { outbox: svc, backplane, presence, pushDispatcher: push };
    const w1 = new DeliveryWorker(deps);
    const w2 = new DeliveryWorker(deps);

    await Promise.all([w1.tick(), w2.tick()]);

    expect(push.dispatched).toHaveLength(1);
    expect(push.dispatched[0]!.userId).toBe('offline-user');
    expect(backplane.published).toHaveLength(0);
    expect(row!.processedAt).not.toBeNull();
  });

  it('10. exactly-once dispatch (worker star): do workers, ONLINE recipient — kul publish exactly 1', async () => {
    const fake = createFakeOutboxPrisma();
    const clock: VirtualClock = { ms: T0 };
    const svc = makeService(fake, clock);
    seedRows(fake, 1, { recipientIds: ['online-user'] });

    const backplane = new FakeBackplane();
    const presence = new FakePresence(['online-user']);
    const push = new FakePushDispatcher();
    const deps = { outbox: svc, backplane, presence, pushDispatcher: push };
    const w1 = new DeliveryWorker(deps);
    const w2 = new DeliveryWorker(deps);

    await Promise.all([w1.tick(), w2.tick()]);

    expect(backplane.published).toHaveLength(1);
    expect(push.dispatched).toHaveLength(0);
  });

  it('11. backoff-skip claim ko RELEASE karta hai — retry backoff (5s) par hota hai, lease (120s) par NAHI', async () => {
    const fake = createFakeOutboxPrisma();
    const clock = new Clock(0);
    // Worker aur service EK hi ghadi baant-te hain (production me dono
    // Date.now hain); lease asal default 120s hai.
    const svc = new PrismaOutboxService(asOutboxPrismaClient(fake), {
      leaseMs: OUTBOX_CLAIM_LEASE_MS,
      now: () => new Date(clock.ms),
    });
    const [row] = seedRows(fake, 1, {
      recipientIds: ['online-user'],
      createdAt: new Date(0),
    });

    const failures = new FailureBudget(1); // pehli delivery nakam, phir theek
    const backplane = new FakeBackplane(failures);
    const presence = new FakePresence(['online-user']);
    const push = new FakePushDispatcher();
    const worker = new DeliveryWorker(
      { outbox: svc, backplane, presence, pushDispatcher: push },
      { now: clock.now },
    );

    // Tick 1 @ t=0: delivery fail → markFailed (attempts=1, lease saaf).
    expect(await worker.tick()).toBe(0);
    expect(row!.attempts).toBe(1);
    expect(row!.leaseExpiresAt).toBeNull();

    // Tick 2 @ t=4999 (backoff 5s se pehle): worker claim karke SKIP karta
    // hai — skip ke baad lease RELEASED honi chahiye, warna row 120s tak band.
    clock.ms = 4_999;
    expect(await worker.tick()).toBe(0);
    expect(row!.attempts).toBe(1);
    expect(backplane.published).toHaveLength(0);
    expect(row!.claimedAt).toBeNull();
    expect(row!.leaseExpiresAt).toBeNull();

    // Tick 3 @ t=5000 (backoff poora): retry turant hota hai aur safal.
    clock.ms = 5_000;
    expect(await worker.tick()).toBe(1);
    expect(backplane.published).toHaveLength(1);
    expect(row!.processedAt).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tier-2 — asal Postgres (HG-541-7 ka hissa). Sirf tab chalega jab
// TEST_DATABASE_URL ek DISPOSABLE, migrated test database ki taraf ishara
// kare (ye suite table saaf karke seed karti hai). Na ho to skip — imaandaar
// skip, nakli pass NAHI.
// ---------------------------------------------------------------------------
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeTier2 = TEST_DATABASE_URL ? describe : describe.skip;

describeTier2('QC-F-541 Tier-2 — asal Postgres par claim lease', () => {
  it('concurrent claims disjoint hain aur live lease dusre claim ko rokta hai', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL as string } },
    });
    try {
      await prisma.messageOutbox.deleteMany({});
      const svc = new PrismaOutboxService(prisma);
      for (let i = 0; i < 10; i += 1) {
        await prisma.messageOutbox.create({
          data: {
            conversationId: 'conv-541-t2',
            messageId: `msg-541-t2-${i}`,
            recipientIds: ['user-541-t2'],
            createdAt: new Date(Date.now() + i * 1_000),
          },
        });
      }

      const [a, b] = await Promise.all([svc.claimBatch(10), svc.claimBatch(10)]);
      const aIds = new Set(a.map((e) => e.id));
      expect(b.filter((e) => aIds.has(e.id))).toEqual([]);
      expect(a.length + b.length).toBe(10);

      // Saari rows leased hain — teesra claim khaali.
      expect(await svc.claimBatch(10)).toEqual([]);
    } finally {
      await prisma.messageOutbox.deleteMany({});
      await prisma.$disconnect();
    }
  });
});
