// ============================================================================
// Property test — PrismaKeyStorage key durability
// Spec: quantchat-launch-readiness, Task 2.4
// Design: Correctness Property 1 ("Key durability"), Component 1.
//
//   Property 1 — for any uploaded bundle, re-reading via a FRESH
//   PrismaKeyStorage instance (simulating a restart/redeploy) returns identical
//   public material; the same holds for stored X3DH sessions.
//
// Library: fast-check (per the design's Testing Strategy), minimum 100 runs.
// The in-memory fake Prisma's backing store is the "durable tier": constructing
// a new PrismaKeyStorage over the same fake models a process restart (storage
// object state is gone, persisted rows survive).
// ============================================================================

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PrismaKeyStorage } from '../services/prisma-key-storage';
import type { PreKeyBundle, KeySession } from '../services/encryption.service';
import { createFakeKeyPrisma, asPrismaClient } from './fake-key-prisma';

const nonEmpty = fc.string({ minLength: 1, maxLength: 64 });

const bundleArb: fc.Arbitrary<PreKeyBundle> = fc.record({
  identityKey: nonEmpty,
  signedPreKey: nonEmpty,
  signedPreKeySignature: nonEmpty,
  registrationId: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
});

const sessionArb: fc.Arbitrary<KeySession> = fc.record({
  id: fc.constant('ignored-on-store'),
  initiatorId: nonEmpty,
  responderId: nonEmpty,
  rootKey: nonEmpty,
  established: fc.boolean(),
  createdAt: fc.constant(new Date()),
});

// Feature: quantchat-launch-readiness, Property 1: Key durability
// **Validates: Requirements 1.5, 3.2**
describe('Feature: quantchat-launch-readiness, Property 1: Key durability', () => {
  it('a bundle re-read after a simulated restart returns identical public material', async () => {
    await fc.assert(
      fc.asyncProperty(nonEmpty, bundleArb, async (userId, bundle) => {
        const prisma = createFakeKeyPrisma();

        // Pre-restart instance writes the bundle.
        const writer = new PrismaKeyStorage(asPrismaClient(prisma));
        await writer.storeBundle(userId, bundle);

        // Simulate restart: brand-new instance over the same durable tier.
        const afterRestart = new PrismaKeyStorage(asPrismaClient(prisma));
        const reread = await afterRestart.getBundle(userId);

        // Identical public material is returned (Requirement 1.5).
        expect(reread).toEqual({
          identityKey: bundle.identityKey,
          signedPreKey: bundle.signedPreKey,
          signedPreKeySignature: bundle.signedPreKeySignature,
          registrationId: bundle.registrationId,
        });
      }),
      { numRuns: 120 },
    );
  });

  it('the latest re-uploaded bundle (one row per user) survives a restart', async () => {
    await fc.assert(
      fc.asyncProperty(nonEmpty, bundleArb, bundleArb, async (userId, first, second) => {
        const prisma = createFakeKeyPrisma();
        const writer = new PrismaKeyStorage(asPrismaClient(prisma));
        await writer.storeBundle(userId, first);
        await writer.storeBundle(userId, second); // atomic replace (upsert)

        const afterRestart = new PrismaKeyStorage(asPrismaClient(prisma));
        const reread = await afterRestart.getBundle(userId);

        expect(reread).toEqual({
          identityKey: second.identityKey,
          signedPreKey: second.signedPreKey,
          signedPreKeySignature: second.signedPreKeySignature,
          registrationId: second.registrationId,
        });
      }),
      { numRuns: 100 },
    );
  });

  it('a stored session re-read after a simulated restart returns identical material', async () => {
    await fc.assert(
      fc.asyncProperty(sessionArb, async (session) => {
        const prisma = createFakeKeyPrisma();

        const writer = new PrismaKeyStorage(asPrismaClient(prisma));
        await writer.storeSession(session);

        const afterRestart = new PrismaKeyStorage(asPrismaClient(prisma));
        const reread = await afterRestart.getSession(session.initiatorId, session.responderId);

        expect(reread).not.toBeNull();
        expect(reread).toMatchObject({
          initiatorId: session.initiatorId,
          responderId: session.responderId,
          rootKey: session.rootKey,
          established: session.established,
        });
      }),
      { numRuns: 120 },
    );
  });
});
