// ============================================================================
// Unit tests — PrismaKeyStorage bundle/session edge cases
// Spec: quantchat-launch-readiness, Task 2.5
// Design: Component 1, Algorithm 1; Requirements 1.2, 1.3, 2.2, 3.4.
//
// Covers:
//   * missing-field rejection (Req 1.3) — exercised against the real upload
//     Zod schema gate (`uploadBundleSchema`), which reports the missing field.
//   * signature-verification failure leaves any prior bundle unchanged (Req 1.2)
//   * empty results for an absent bundle / absent session (Req 1.6 / 3.4)
//   * one-time prekey batch validation: empty / >100 / duplicates (Req 2.2),
//     and that a rejected batch persists nothing.
//
// Drives the REAL PrismaKeyStorage + EncryptionService against the in-memory
// fake Prisma (no live Postgres in the sandbox).
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { PrismaKeyStorage } from '../services/prisma-key-storage';
import { EncryptionService, type PreKeyBundle } from '../services/encryption.service';
import { uploadBundleSchema } from '../routes/encryption';
import { createFakeKeyPrisma, asPrismaClient } from './fake-key-prisma';

/** Build a bundle whose signed-prekey signature verifies (matches the service's HMAC check). */
function validBundle(overrides: Partial<PreKeyBundle> = {}): PreKeyBundle {
  const identityKey = overrides.identityKey ?? 'identity-key-1';
  const signedPreKey = overrides.signedPreKey ?? 'signed-prekey-1';
  const signedPreKeySignature = crypto
    .createHmac('sha256', identityKey)
    .update(signedPreKey)
    .digest('hex');
  return {
    identityKey,
    signedPreKey,
    signedPreKeySignature,
    registrationId: overrides.registrationId ?? 42,
    ...overrides,
  };
}

describe('PrismaKeyStorage — bundle/session edge cases (Task 2.5)', () => {
  // --------------------------------------------------------------------------
  // Requirement 1.3 — missing-field rejection (indicates which field is missing)
  // --------------------------------------------------------------------------
  describe('missing-field rejection (Req 1.3)', () => {
    const required: Array<keyof PreKeyBundle> = [
      'identityKey',
      'signedPreKey',
      'signedPreKeySignature',
      'registrationId',
    ];

    it('accepts a complete bundle', () => {
      const result = uploadBundleSchema.safeParse(validBundle());
      expect(result.success).toBe(true);
    });

    for (const field of required) {
      it(`rejects a bundle missing "${field}" and reports that field`, () => {
        const bundle: Record<string, unknown> = { ...validBundle() };
        delete bundle[field];

        const result = uploadBundleSchema.safeParse(bundle);

        expect(result.success).toBe(false);
        if (!result.success) {
          const offendingPaths = result.error.issues.map((issue) => issue.path.join('.'));
          expect(offendingPaths).toContain(field);
        }
      });
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 1.2 — bad signature rejected; prior persisted bundle unchanged
  // --------------------------------------------------------------------------
  describe('signature-verification failure (Req 1.2)', () => {
    it('rejects a bad signature and leaves the previously persisted bundle unchanged', async () => {
      const prisma = createFakeKeyPrisma();
      const storage = new PrismaKeyStorage(asPrismaClient(prisma));
      const service = new EncryptionService(storage);

      const original = validBundle({ identityKey: 'id-A', signedPreKey: 'spk-A' });
      await service.uploadPreKeyBundle('user-1', original);

      const tampered: PreKeyBundle = {
        ...validBundle({ identityKey: 'id-B', signedPreKey: 'spk-B' }),
        signedPreKeySignature: 'not-a-valid-signature',
      };

      await expect(service.uploadPreKeyBundle('user-1', tampered)).rejects.toThrow(
        'Invalid signed prekey signature',
      );

      // The prior bundle is untouched (no partial overwrite).
      const stored = await storage.getBundle('user-1');
      expect(stored).toEqual({
        identityKey: original.identityKey,
        signedPreKey: original.signedPreKey,
        signedPreKeySignature: original.signedPreKeySignature,
        registrationId: original.registrationId,
      });
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 1.6 / 3.4 — empty result for absent bundle / session
  // --------------------------------------------------------------------------
  describe('empty results for absent records (Req 1.6, 3.4)', () => {
    it('returns null for a bundle that was never persisted', async () => {
      const storage = new PrismaKeyStorage(asPrismaClient(createFakeKeyPrisma()));
      expect(await storage.getBundle('nobody')).toBeNull();
    });

    it('returns null for a session pair that was never persisted', async () => {
      const storage = new PrismaKeyStorage(asPrismaClient(createFakeKeyPrisma()));
      expect(await storage.getSession('alice', 'bob')).toBeNull();
    });

    it('returns null for a different session pair than the one stored', async () => {
      const storage = new PrismaKeyStorage(asPrismaClient(createFakeKeyPrisma()));
      await storage.storeSession({
        id: 's1',
        initiatorId: 'alice',
        responderId: 'bob',
        rootKey: 'rk',
        established: true,
        createdAt: new Date(),
      });
      // Reversed direction is a distinct (initiatorId, responderId) key.
      expect(await storage.getSession('bob', 'alice')).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 2.2 — one-time prekey batch validation (rejects, persists nothing)
  // --------------------------------------------------------------------------
  describe('one-time prekey batch validation (Req 2.2)', () => {
    async function freshWithBundle(): Promise<{
      storage: PrismaKeyStorage;
    }> {
      const storage = new PrismaKeyStorage(asPrismaClient(createFakeKeyPrisma()));
      await storage.storeBundle('user-1', validBundle());
      return { storage };
    }

    it('rejects an empty batch', async () => {
      const { storage } = await freshWithBundle();
      await expect(storage.storeOneTimePreKeys('user-1', [])).rejects.toThrow();
      expect(await storage.countOneTimePreKeys('user-1')).toBe(0);
    });

    it('rejects a batch larger than 100', async () => {
      const { storage } = await freshWithBundle();
      const tooMany = Array.from({ length: 101 }, (_, i) => `k-${i}`);
      await expect(storage.storeOneTimePreKeys('user-1', tooMany)).rejects.toThrow();
      expect(await storage.countOneTimePreKeys('user-1')).toBe(0);
    });

    it('rejects a batch containing duplicates within itself', async () => {
      const { storage } = await freshWithBundle();
      await expect(storage.storeOneTimePreKeys('user-1', ['dup', 'dup', 'x'])).rejects.toThrow();
      expect(await storage.countOneTimePreKeys('user-1')).toBe(0);
    });

    it('rejects a batch with a key already present in the pool, persisting nothing new', async () => {
      const { storage } = await freshWithBundle();
      await storage.storeOneTimePreKeys('user-1', ['a', 'b', 'c']);
      expect(await storage.countOneTimePreKeys('user-1')).toBe(3);

      await expect(storage.storeOneTimePreKeys('user-1', ['c', 'd'])).rejects.toThrow();
      // The whole second batch is rejected — count stays at 3 (no 'd' added).
      expect(await storage.countOneTimePreKeys('user-1')).toBe(3);
    });

    it('accepts and persists a valid batch (boundary: exactly 100)', async () => {
      const { storage } = await freshWithBundle();
      const batch = Array.from({ length: 100 }, (_, i) => `key-${i}`);
      await storage.storeOneTimePreKeys('user-1', batch);
      expect(await storage.countOneTimePreKeys('user-1')).toBe(100);
    });
  });
});
