import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import type { KeyStorage, PreKeyBundle, KeySession } from './encryption.service';

/** Maximum number of one-time prekeys accepted in a single upload batch. */
const MAX_ONE_TIME_PREKEY_BATCH = 100;

/**
 * Store for a user's pool of single-use (one-time) prekeys.
 *
 * Public key material only — the backend is a zero-knowledge relay and never
 * persists private keys, ratchet secrets, or plaintext.
 *
 * NOTE: The atomic pool/claim behaviour (storeOneTimePreKeys / claimOneTimePreKey /
 * countOneTimePreKeys) is implemented in Task 2.2. The method signatures are
 * declared here so {@link PrismaKeyStorage} satisfies the full contract from the
 * design's Component 1 interface; the bodies are filled in by Task 2.2.
 */
export interface OneTimePreKeyStore {
  /** Store a batch of one-time prekeys for a user (public keys only). */
  storeOneTimePreKeys(userId: string, preKeys: string[]): Promise<void>;
  /**
   * Atomically claim (consume) a single one-time prekey for a user.
   * Returns null when none remain (caller falls back to signedPreKey-only X3DH).
   *
   * QC-F-081: `claimedBy` records WHO consumed the key. The claimed rows are
   * the claim ledger — per-claimer quota and drain forensics are computed
   * from them via {@link OneTimePreKeyStore.countClaimsSince}. Omitting it
   * records an unattributed claim (legacy callers only; the claim service
   * always passes the authenticated requester).
   */
  claimOneTimePreKey(userId: string, claimedBy?: string | null): Promise<string | null>;
  /** Count remaining unclaimed one-time prekeys (drives client replenishment). */
  countOneTimePreKeys(userId: string): Promise<number>;
  /**
   * QC-F-081: count keys claimed from `userId`'s pool at or after `since`,
   * optionally restricted to a single claimer. Claimed rows are never
   * un-claimed, so this is a durable ledger read — it survives restarts and
   * is shared across backend instances, unlike an in-memory rate limiter.
   */
  countClaimsSince(userId: string, since: Date, claimedBy?: string): Promise<number>;
}

/**
 * Durable, Prisma-backed implementation of the {@link KeyStorage} contract
 * (plus {@link OneTimePreKeyStore}). Prekey bundles and X3DH sessions survive
 * restarts/redeploys and are shared across all backend instances.
 *
 * Zero-knowledge invariant (Requirement 16): this class persists PUBLIC key
 * material only. It never reads, writes, or accepts private keys, ratchet
 * secrets, or plaintext.
 */
export class PrismaKeyStorage implements KeyStorage, OneTimePreKeyStore {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Persist (or atomically replace) a user's current prekey bundle.
   *
   * Upserts on the unique `userId` so that exactly one bundle row exists per
   * user, including under concurrent re-uploads for the same user. Only public
   * material is written. (Requirements 1.1, 1.4, 1.7, 16.1)
   */
  async storeBundle(userId: string, bundle: PreKeyBundle): Promise<void> {
    await this.prisma.preKeyBundle.upsert({
      where: { userId },
      create: {
        userId,
        identityKey: bundle.identityKey,
        signedPreKey: bundle.signedPreKey,
        signedPreKeySignature: bundle.signedPreKeySignature,
        registrationId: bundle.registrationId,
      },
      update: {
        identityKey: bundle.identityKey,
        signedPreKey: bundle.signedPreKey,
        signedPreKeySignature: bundle.signedPreKeySignature,
        registrationId: bundle.registrationId,
      },
    });
  }

  /**
   * Return the persisted public prekey bundle for a user, or null when none
   * has been persisted. (Requirements 1.5, 1.6, 16.3)
   */
  async getBundle(userId: string): Promise<PreKeyBundle | null> {
    const row = await this.prisma.preKeyBundle.findUnique({
      where: { userId },
    });

    if (!row) {
      return null;
    }

    return {
      identityKey: row.identityKey,
      signedPreKey: row.signedPreKey,
      signedPreKeySignature: row.signedPreKeySignature,
      registrationId: row.registrationId,
    };
  }

  /**
   * Persist (or atomically replace) an X3DH session keyed by
   * `(initiatorId, responderId)`. Upserts on the compound unique so that
   * exactly one session row exists per pair, including under concurrent stores
   * for the same pair. (Requirements 3.1, 3.3, 16.1)
   */
  async storeSession(session: KeySession): Promise<void> {
    await this.prisma.keySession.upsert({
      where: {
        initiatorId_responderId: {
          initiatorId: session.initiatorId,
          responderId: session.responderId,
        },
      },
      create: {
        initiatorId: session.initiatorId,
        responderId: session.responderId,
        rootKey: session.rootKey,
        established: session.established,
      },
      update: {
        rootKey: session.rootKey,
        established: session.established,
      },
    });
  }

  /**
   * Return the persisted session for an `(initiatorId, responderId)` pair, or
   * null when none has been persisted. (Requirements 3.2, 3.4)
   */
  async getSession(initiatorId: string, responderId: string): Promise<KeySession | null> {
    const row = await this.prisma.keySession.findUnique({
      where: {
        initiatorId_responderId: { initiatorId, responderId },
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      initiatorId: row.initiatorId,
      responderId: row.responderId,
      rootKey: row.rootKey,
      established: row.established,
      createdAt: row.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // OneTimePreKeyStore — atomic one-time prekey pool (Task 2.2, design Algo 1).
  // ---------------------------------------------------------------------------

  /**
   * Persist a batch of one-time prekeys (public keys only) into the user's pool.
   *
   * The whole batch is validated before anything is written, and the inserts run
   * as a single statement, so a validation failure persists nothing. The batch
   * is rejected when it is empty, larger than 100, contains duplicates within
   * itself, or contains a public key that already exists in the user's pool.
   * (Requirements 2.1, 2.2)
   *
   * @throws when the batch is invalid or the user has no registered PreKeyBundle.
   */
  async storeOneTimePreKeys(userId: string, preKeys: string[]): Promise<void> {
    // --- Validate the batch up front; reject the whole batch on any failure ---
    if (!Array.isArray(preKeys) || preKeys.length === 0) {
      throw createAppError(
        'One-time prekey batch must contain between 1 and 100 keys',
        400,
        'INVALID_PREKEY_BATCH',
      );
    }

    if (preKeys.length > MAX_ONE_TIME_PREKEY_BATCH) {
      throw createAppError(
        `One-time prekey batch must not exceed ${MAX_ONE_TIME_PREKEY_BATCH} keys`,
        400,
        'INVALID_PREKEY_BATCH',
      );
    }

    // Reject duplicates within the batch itself.
    const distinct = new Set(preKeys);
    if (distinct.size !== preKeys.length) {
      throw createAppError(
        'One-time prekey batch contains duplicate public keys',
        409,
        'DUPLICATE_PREKEY',
      );
    }

    // A pool entry must link to the user's current bundle.
    const bundle = await this.prisma.preKeyBundle.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!bundle) {
      throw createAppError('No prekey bundle registered for user', 404, 'BUNDLE_NOT_FOUND');
    }

    // Reject keys that duplicate one already present in the user's pool.
    const existing = await this.prisma.oneTimePreKey.findMany({
      where: { userId, publicKey: { in: preKeys } },
      select: { publicKey: true },
    });
    if (existing.length > 0) {
      throw createAppError(
        'One-time prekey batch contains keys already present in the pool',
        409,
        'DUPLICATE_PREKEY',
      );
    }

    // --- Persist the whole batch as unclaimed public keys (single statement) ---
    await this.prisma.oneTimePreKey.createMany({
      data: preKeys.map((publicKey) => ({
        userId,
        bundleId: bundle.id,
        publicKey,
      })),
    });
  }

  /**
   * Atomically claim (consume) a single one-time prekey for a user.
   *
   * Uses the design's Algorithm 1: a single `UPDATE ... WHERE id = (SELECT ...
   * FOR UPDATE SKIP LOCKED) RETURNING publicKey` statement. The `FOR UPDATE SKIP
   * LOCKED` row lock guarantees that, even under concurrent claims, each
   * one-time prekey is handed to at most one caller. Returns null when the pool
   * is empty so the caller can fall back to signedPreKey-only X3DH.
   * (Requirements 2.3, 2.4, 2.5, 2.6)
   */
  async claimOneTimePreKey(userId: string, claimedBy?: string | null): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ publicKey: string }>>`
      UPDATE "onetime_prekeys"
         SET "claimed" = true, "claimedAt" = now(), "claimedBy" = ${claimedBy ?? null}
       WHERE "id" = (
         SELECT "id" FROM "onetime_prekeys"
          WHERE "userId" = ${userId} AND "claimed" = false
          ORDER BY "createdAt" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
       RETURNING "publicKey"
    `;

    if (!rows || rows.length === 0) {
      return null;
    }

    return rows[0].publicKey;
  }

  /**
   * QC-F-081: ledger read backing the claim quotas. Raw SQL (like the claim
   * itself) so it does not depend on a regenerated Prisma client knowing the
   * `claimedBy` column. The claimer predicate is written so a single query
   * shape serves both the per-(claimer, owner) counts and the per-owner
   * aggregate-velocity count: a NULL claimer parameter matches every claimer.
   */
  async countClaimsSince(userId: string, since: Date, claimedBy?: string): Promise<number> {
    const claimer = claimedBy ?? null;
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint | number }>>`
      SELECT COUNT(*)::bigint AS "count"
        FROM "onetime_prekeys"
       WHERE "userId" = ${userId}
         AND "claimed" = true
         AND "claimedAt" >= ${since}
         AND (${claimer}::text IS NULL OR "claimedBy" = ${claimer})
    `;

    if (!rows || rows.length === 0) {
      return 0;
    }

    return Number(rows[0].count);
  }

  /**
   * Return the current count of unclaimed one-time prekeys for a user, which
   * drives client-side replenishment. (Requirement 2.7)
   */
  async countOneTimePreKeys(userId: string): Promise<number> {
    return this.prisma.oneTimePreKey.count({
      where: { userId, claimed: false },
    });
  }
}
