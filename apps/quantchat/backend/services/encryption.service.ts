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
    typeof candidate.storeOneTimePreKeys === 'function' &&
    typeof candidate.countClaimsSince === 'function'
  );
}

// ---------------------------------------------------------------------------
// QC-F-081 — one-time prekey claim quotas.
//
// Before this gate, ANY logged-in user could claim (consume) a victim's whole
// one-time prekey pool one request at a time: claims were anonymous, unlimited
// per claimer, and a claimed key never returns. The pool emptying silently
// downgrades every NEW X3DH session for that victim to signedPreKey-only
// (Requirement 2.6 fallback) with no signal to anyone.
//
// The gate runs in `claimPreKeyBundle` — the single service method both claim
// lanes (GET /prekeys/:userId and GET /e2ee/prekeys/:userId) converge on — and
// counts from the durable claim ledger (claimed rows carry claimedBy +
// claimedAt), so limits survive restarts and are shared across instances.
// A denied claim does NOT consume a key and does NOT error: the caller gets
// the bundle without a one-time prekey, exactly the Requirement 2.6 shape.
// ---------------------------------------------------------------------------

/** Max keys one claimer may consume from one owner's pool per rolling hour. */
export const PREKEY_CLAIM_PAIR_HOURLY_LIMIT = 10;
/** Max keys one claimer may consume from one owner's pool per rolling day. */
export const PREKEY_CLAIM_PAIR_DAILY_LIMIT = 25;
/** Max keys consumable from one owner's pool (all claimers) per 10 minutes. */
export const PREKEY_CLAIM_TARGET_VELOCITY_LIMIT = 30;
export const PREKEY_CLAIM_TARGET_VELOCITY_WINDOW_MS = 10 * 60 * 1000;
/** Remaining-pool size at/below which the pool-low signal fires. Matches the
 * web client's replenishment threshold (e2eeClient: top up below 10). */
export const PREKEY_POOL_LOW_THRESHOLD = 10;
/** Minimum gap between pool-low signals for the same owner (per instance). */
export const PREKEY_POOL_LOW_SIGNAL_INTERVAL_MS = 60 * 60 * 1000;

export type PrekeyClaimDenialReason =
  | 'unattributed'
  | 'pair-hourly-quota'
  | 'pair-daily-quota'
  | 'target-velocity';

export interface PrekeyClaimHooks {
  /**
   * A claim was refused by the QC-F-081 gate and NO key was consumed.
   * Carries ids and counts only — never key material.
   */
  onClaimThrottled?(info: {
    targetUserId: string;
    requesterId: string | null;
    reason: PrekeyClaimDenialReason;
  }): void;
  /**
   * A successful claim left the owner's pool at/below
   * {@link PREKEY_POOL_LOW_THRESHOLD}. Throttled per owner by the service.
   * Carries ids and counts only — never key material.
   */
  onPoolLow?(info: { targetUserId: string; remaining: number }): void;
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
  /** Last pool-low signal time per owner (throttles the signal, per instance). */
  private readonly poolLowSignalledAt = new Map<string, number>();

  constructor(
    private readonly storage: KeyStorage,
    private readonly hooks: PrekeyClaimHooks = {},
  ) {}

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
  async claimPreKeyBundle(userId: string, requesterId?: string | null): Promise<PreKeyBundle> {
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
      const oneTimePreKey = await this.claimOneTimePreKeyGated(userId, requesterId ?? null);
      if (oneTimePreKey) {
        publicBundle.oneTimePreKey = oneTimePreKey;
      }
    }

    return publicBundle;
  }

  /**
   * QC-F-081 gate in front of the atomic claim. Returns a claimed key, or
   * null when the claim is refused (the caller then serves the bundle
   * without a one-time prekey — Requirement 2.6 fallback, no error).
   *
   * Refusals, in order:
   *  - `unattributed`: no authenticated requester id. An anonymous claim
   *    cannot be quota'd or ledgered, so it never consumes (fail-closed).
   *  - `pair-hourly-quota` / `pair-daily-quota`: this claimer has already
   *    consumed {@link PREKEY_CLAIM_PAIR_HOURLY_LIMIT} /
   *    {@link PREKEY_CLAIM_PAIR_DAILY_LIMIT} keys from this owner's pool in
   *    the rolling window. A claimer with NO claim history against this
   *    owner always passes — a first session is never quota-blocked.
   *  - `target-velocity`: the owner's pool is being claimed at aggregate
   *    velocity ({@link PREKEY_CLAIM_TARGET_VELOCITY_LIMIT} per
   *    {@link PREKEY_CLAIM_TARGET_VELOCITY_WINDOW_MS}) — the signature of a
   *    multi-account drain. This gate applies to everyone, first claimers
   *    included: it is what stops account rotation from defeating the pair
   *    quotas, and it only withholds the one-time key (sessions still
   *    establish signedPreKey-only), never the bundle itself.
   */
  private async claimOneTimePreKeyGated(
    targetUserId: string,
    requesterId: string | null,
  ): Promise<string | null> {
    const storage = this.storage as KeyStorage & OneTimePreKeyStore;

    if (!requesterId) {
      this.hooks.onClaimThrottled?.({
        targetUserId,
        requesterId: null,
        reason: 'unattributed',
      });
      return null;
    }

    const now = Date.now();

    const claimsEverByPair = await storage.countClaimsSince(
      targetUserId,
      new Date(0),
      requesterId,
    );
    if (claimsEverByPair > 0) {
      const claimsLastHour = await storage.countClaimsSince(
        targetUserId,
        new Date(now - 60 * 60 * 1000),
        requesterId,
      );
      if (claimsLastHour >= PREKEY_CLAIM_PAIR_HOURLY_LIMIT) {
        this.hooks.onClaimThrottled?.({
          targetUserId,
          requesterId,
          reason: 'pair-hourly-quota',
        });
        return null;
      }

      const claimsLastDay = await storage.countClaimsSince(
        targetUserId,
        new Date(now - 24 * 60 * 60 * 1000),
        requesterId,
      );
      if (claimsLastDay >= PREKEY_CLAIM_PAIR_DAILY_LIMIT) {
        this.hooks.onClaimThrottled?.({
          targetUserId,
          requesterId,
          reason: 'pair-daily-quota',
        });
        return null;
      }
    }

    const claimsVelocity = await storage.countClaimsSince(
      targetUserId,
      new Date(now - PREKEY_CLAIM_TARGET_VELOCITY_WINDOW_MS),
    );
    if (claimsVelocity >= PREKEY_CLAIM_TARGET_VELOCITY_LIMIT) {
      this.hooks.onClaimThrottled?.({
        targetUserId,
        requesterId,
        reason: 'target-velocity',
      });
      return null;
    }

    const oneTimePreKey = await storage.claimOneTimePreKey(targetUserId, requesterId);

    if (oneTimePreKey) {
      const remaining = await storage.countOneTimePreKeys(targetUserId);
      if (remaining <= PREKEY_POOL_LOW_THRESHOLD) {
        const lastSignalled = this.poolLowSignalledAt.get(targetUserId) ?? 0;
        if (now - lastSignalled >= PREKEY_POOL_LOW_SIGNAL_INTERVAL_MS) {
          this.poolLowSignalledAt.set(targetUserId, now);
          this.hooks.onPoolLow?.({ targetUserId, remaining });
        }
      }
    }

    return oneTimePreKey;
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
