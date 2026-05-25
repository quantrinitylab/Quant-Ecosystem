import * as crypto from 'node:crypto';
import { createAppError } from '@quant/server-core';

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

  async uploadPreKeyBundle(userId: string, bundle: PreKeyBundle): Promise<void> {
    // Verify the signed prekey signature
    const expectedSig = crypto
      .createHmac('sha256', bundle.identityKey)
      .update(bundle.signedPreKey)
      .digest('hex');

    if (expectedSig !== bundle.signedPreKeySignature) {
      throw createAppError('Invalid signed prekey signature', 400, 'INVALID_SIGNATURE');
    }

    await this.storage.storeBundle(userId, bundle);
  }

  async getPreKeyBundle(userId: string): Promise<PreKeyBundle> {
    const bundle = await this.storage.getBundle(userId);
    if (!bundle) {
      throw createAppError('No prekey bundle found for user', 404, 'BUNDLE_NOT_FOUND');
    }
    return bundle;
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
