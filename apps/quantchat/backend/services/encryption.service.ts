import * as crypto from 'node:crypto';
import { createAppError } from '@quant/server-core';
import type { OneTimePreKeyStore } from './prisma-key-storage';

/**
 * Narrow a {@link KeyStorage} to one that also manages a one-time prekey pool
 * (i.e. the durable {@link PrismaKeyStorage}). The in-memory storage used for
 * unit tests does not implement this surface, so callers degrade to
 * signedPreKey-only X3DH when it is absent.
 */
function supportsOneTimePreKeys(storage: KeyStorage): storage is KeyStorage & OneTimePreKeyStore {
  const candidate = storage as Partial<OneTimePreKeyStore>;
  return (
    typeof candidate.claimOneTimePreKey === 'function' &&
    typeof candidate.storeOneTimePreKeys === 'function'
  );
}

export interface PreKeyBundle {
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey?: string;
  registrationId: number;
}

export interface KeySession {
  id: string;
  initiatorId: string;
  responderId: string;
  rootKey: string;
  established: boolean;
  createdAt: Date;
}

export interface KeyStorage {
  storeBundle(userId: string, bundle: PreKeyBundle): Promise<void>;
  getBundle(userId: string): Promise<PreKeyBundle | null>;
  storeSession(session: KeySession): Promise<void>;
  getSession(initiatorId: string, responderId: string): Promise<KeySession | null>;
}

/**
 * In-memory key storage for development/testing.
 * In production, this would be backed by Prisma or a dedicated key store.
 */
export class InMemoryKeyStorage implements KeyStorage {
  private bundles = new Map<string, PreKeyBundle>();
  private sessions = new Map<string, KeySession>();

  async storeBundle(userId: string, bundle: PreKeyBundle): Promise<void> {
    this.bundles.set(userId, bundle);
  }

  async getBundle(userId: string): Promise<PreKeyBundle | null> {
    return this.bundles.get(userId) ?? null;
  }

  async storeSession(session: KeySession): Promise<void> {
    this.sessions.set(`${session.initiatorId}:${session.responderId}`, session);
  }

  async getSession(initiatorId: string, responderId: string): Promise<KeySession | null> {
    return this.sessions.get(`${initiatorId}:${responderId}`) ?? null;
  }
}

export class EncryptionService {
  constructor(private readonly storage: KeyStorage) {}

  async uploadPreKeyBundle(
    userId: string,
    bundle: PreKeyBundle,
    oneTimePreKeys?: string[],
  ): Promise<void> {
    // Verify the signed prekey signature BEFORE persisting anything, so an
    // invalid upload leaves any previously persisted bundle/pool unchanged
    // (Requirement 1.2).
    const expectedSig = crypto
      .createHmac('sha256', bundle.identityKey)
      .update(bundle.signedPreKey)
      .digest('hex');

    if (expectedSig !== bundle.signedPreKeySignature) {
      throw createAppError('Invalid signed prekey signature', 400, 'INVALID_SIGNATURE');
    }

    await this.storage.storeBundle(userId, bundle);

    // Persist the user's one-time prekey pool when supplied and supported by
    // the durable store (public keys only — Requirement 2.1, 16.1).
    if (oneTimePreKeys && oneTimePreKeys.length > 0 && supportsOneTimePreKeys(this.storage)) {
      await this.storage.storeOneTimePreKeys(userId, oneTimePreKeys);
    }
  }

  /**
   * Append a batch of PUBLIC one-time prekeys to a user's existing pool — the
   * server-side half of client replenishment (Requirement 2.8). Reuses the same
   * durable pool the publish path writes to: the batch is validated (1–100,
   * no in-batch/pool duplicates) and requires a previously registered bundle.
   *
   * Public key material only — the zero-knowledge invariant is preserved
   * (Requirement 16.1): the caller uploads one-time prekey *public* keys, never
   * private keys or ratchet secrets.
   */
  async addOneTimePreKeys(userId: string, oneTimePreKeys: string[]): Promise<void> {
    if (!supportsOneTimePreKeys(this.storage)) {
      throw createAppError(
        'One-time prekey storage is not available',
        400,
        'ONE_TIME_PREKEYS_UNSUPPORTED',
      );
    }
    await this.storage.storeOneTimePreKeys(userId, oneTimePreKeys);
  }

  /**
   * Return the count of remaining unclaimed one-time prekeys for a user, which
   * drives client-side replenishment (Requirements 2.7, 2.8). When the backing
   * store does not manage a one-time prekey pool (e.g. the in-memory store used
   * in tests), reports zero so the client falls back to a fresh upload.
   */
  async countOneTimePreKeys(userId: string): Promise<number> {
    if (!supportsOneTimePreKeys(this.storage)) {
      return 0;
    }
    return this.storage.countOneTimePreKeys(userId);
  }

  async getPreKeyBundle(userId: string): Promise<PreKeyBundle> {
    const bundle = await this.storage.getBundle(userId);
    if (!bundle) {
      throw createAppError('No prekey bundle found for user', 404, 'BUNDLE_NOT_FOUND');
    }
    return bundle;
  }

  /**
   * Fetch a peer's PUBLIC prekey bundle for session establishment, atomically
   * claiming (consuming) a single one-time prekey from their pool when one is
   * available (design Sequence 1; Requirements 16.3, plus one-time prekey claim
   * integration).
   *
   * Returns PUBLIC key material only — never private keys or ratchet secrets
   * (zero-knowledge invariant, Requirement 16.3). When no one-time prekey
   * remains, the bundle is returned without one so the caller falls back to
   * signedPreKey-only X3DH (Requirement 2.6).
   */
  async claimPreKeyBundle(userId: string): Promise<PreKeyBundle> {
    const bundle = await this.storage.getBundle(userId);
    if (!bundle) {
      throw createAppError('No prekey bundle found for user', 404, 'BUNDLE_NOT_FOUND');
    }

    // Public material only — drop any stored one-time prekey field and replace
    // it with a freshly, atomically claimed key (or none).
    const publicBundle: PreKeyBundle = {
      identityKey: bundle.identityKey,
      signedPreKey: bundle.signedPreKey,
      signedPreKeySignature: bundle.signedPreKeySignature,
      registrationId: bundle.registrationId,
    };

    if (supportsOneTimePreKeys(this.storage)) {
      const oneTimePreKey = await this.storage.claimOneTimePreKey(userId);
      if (oneTimePreKey) {
        publicBundle.oneTimePreKey = oneTimePreKey;
      }
    }

    return publicBundle;
  }

  async establishSession(initiatorId: string, responderId: string): Promise<KeySession> {
    const responderBundle = await this.storage.getBundle(responderId);
    if (!responderBundle) {
      throw createAppError('Responder has no prekey bundle', 404, 'BUNDLE_NOT_FOUND');
    }

    // X3DH-style key derivation
    const ephemeralKey = crypto.randomBytes(32).toString('hex');
    const dh1 = crypto
      .createHmac('sha256', ephemeralKey)
      .update(responderBundle.identityKey)
      .digest('hex');
    const dh2 = crypto
      .createHmac('sha256', ephemeralKey)
      .update(responderBundle.signedPreKey)
      .digest('hex');

    let sharedSecret = dh1 + dh2;
    if (responderBundle.oneTimePreKey) {
      const dh3 = crypto
        .createHmac('sha256', ephemeralKey)
        .update(responderBundle.oneTimePreKey)
        .digest('hex');
      sharedSecret += dh3;
    }

    const rootKey = crypto
      .createHmac('sha256', 'QuantChat-X3DH')
      .update(sharedSecret)
      .digest('hex');

    const session: KeySession = {
      id: `session_${crypto.randomUUID()}`,
      initiatorId,
      responderId,
      rootKey,
      established: true,
      createdAt: new Date(),
    };

    await this.storage.storeSession(session);
    return session;
  }
}
