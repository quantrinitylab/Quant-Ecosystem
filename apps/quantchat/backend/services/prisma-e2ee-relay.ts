import type { PrismaClient } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import type {
  CiphertextEnvelope,
  DrainInboxOptions,
  E2EERelay,
  PublishedKeyBundle,
  RelayedEnvelope,
} from '../lib/e2ee-relay';
import type { PreKeyBundle } from '@quant/encryption';

// ============================================================================
// Prisma-backed, zero-knowledge E2EE relay (K27 — doc 16 §1/§3/§7, §11/§13).
// ============================================================================
//
// Replaces the volatile `InMemoryE2EERelay`: published pre-key bundles and
// relayed ciphertext envelopes are persisted in `e2ee_relay_bundles` /
// `e2ee_relay_envelopes`, so key-distribution state survives restarts/redeploys
// and is shared across backend instances (multidevice bootstrap, doc 16 §11;
// sender-key rotation durability, §13).
//
// ZERO-KNOWLEDGE INVARIANT (doc 16 §1): this class persists PUBLIC key material
// and opaque ciphertext ONLY. It never reads, writes, or accepts private keys,
// ratchet/session secrets, or plaintext. The write paths below project the
// engine's `PreKeyBundle` / `CiphertextEnvelope` onto an explicit allowlist of
// public/ciphertext fields — anything else the caller passes is dropped, not
// stored. The HTTP layer additionally rejects unknown fields via `.strict()`
// Zod schemas (routes/e2ee.ts), so secrets cannot cross the boundary even if a
// buggy or malicious client attaches them.
//
// THREAT MODEL (doc 16 §29): a compromised database exposes the same
// public/ciphertext material — still no plaintext, still no private keys,
// because none is ever stored. Metadata (who relayed to whom, when) IS visible
// to the server/DB; metadata privacy is a separate product decision (§21).

/** Minimal Prisma surface this relay needs (lets tests inject a fake). */
export interface E2EERelayPrismaClient {
  e2EERelayBundle: {
    upsert(args: unknown): Promise<RelayBundleRow>;
    findMany(args: unknown): Promise<RelayBundleRow[]>;
  };
  e2EERelayEnvelope: {
    create(args: unknown): Promise<RelayEnvelopeRow>;
    findMany(args: unknown): Promise<RelayEnvelopeRow[]>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
  $transaction<T>(fn: (tx: E2EERelayPrismaClient) => Promise<T>): Promise<T>;
}

interface RelayBundleRow {
  userId: string;
  deviceId: string;
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey: string | null;
  registrationId: number;
  publishedAt: Date;
}

interface RelayEnvelopeRow {
  id: string;
  senderId: string;
  recipientId: string;
  sessionId: string | null;
  ciphertext: string;
  nonce: string;
  tag: string;
  algorithm: string;
  senderFingerprint: string;
  recipientFingerprint: string;
  payloadTimestamp: Date;
  version: number;
  relayedAt: Date;
}

/**
 * Project an engine `PreKeyBundle` onto the relay's PUBLIC-field allowlist.
 * Anything outside the allowlist (e.g. a smuggled `privateKey`) is dropped.
 */
function toStoredBundleFields(bundle: PreKeyBundle): {
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey: string | null;
  registrationId: number;
} {
  return {
    identityKey: bundle.identityKey,
    signedPreKey: bundle.signedPreKey,
    signedPreKeySignature: bundle.signedPreKeySignature,
    oneTimePreKey: bundle.oneTimePreKey ?? null,
    registrationId: bundle.registrationId,
  };
}

function toStoredEnvelopeFields(payload: CiphertextEnvelope): {
  ciphertext: string;
  nonce: string;
  tag: string;
  algorithm: string;
  senderFingerprint: string;
  recipientFingerprint: string;
  payloadTimestamp: Date;
  version: number;
} {
  return {
    ciphertext: payload.ciphertext,
    nonce: payload.nonce,
    tag: payload.tag,
    algorithm: payload.algorithm,
    senderFingerprint: payload.senderFingerprint,
    recipientFingerprint: payload.recipientFingerprint,
    payloadTimestamp: new Date(payload.timestamp),
    version: payload.version,
  };
}

function toPublishedBundle(row: RelayBundleRow): PublishedKeyBundle {
  return {
    userId: row.userId,
    deviceId: row.deviceId,
    bundle: {
      identityKey: row.identityKey,
      signedPreKey: row.signedPreKey,
      signedPreKeySignature: row.signedPreKeySignature,
      ...(row.oneTimePreKey ? { oneTimePreKey: row.oneTimePreKey } : {}),
      registrationId: row.registrationId,
    },
    publishedAt: row.publishedAt.getTime(),
  };
}

function toRelayedEnvelope(row: RelayEnvelopeRow): RelayedEnvelope {
  return {
    id: row.id,
    senderId: row.senderId,
    recipientId: row.recipientId,
    payload: {
      ciphertext: row.ciphertext,
      nonce: row.nonce,
      tag: row.tag,
      algorithm: row.algorithm as CiphertextEnvelope['algorithm'],
      senderFingerprint: row.senderFingerprint,
      recipientFingerprint: row.recipientFingerprint,
      timestamp: row.payloadTimestamp.toISOString(),
      version: row.version,
    },
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    relayedAt: row.relayedAt.getTime(),
  };
}

function requireId(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createAppError(`${field} must be a non-empty string`, 400, 'INVALID_RELAY_IDENTITY');
  }
}

/**
 * Durable, Prisma-backed implementation of {@link E2EERelay}.
 *
 * - `publishBundle` upserts on the `@@unique([userId, deviceId])` key, so
 *   re-publishing from the same device atomically replaces the bundle —
 *   including under concurrent publishes.
 * - `drainInbox` reads + deletes inside a single transaction, so an envelope
 *   is handed to at most one drainer even under concurrent drains.
 * - Fail-closed: empty identities are rejected; database errors propagate and
 *   the routes surface them as 5xx (never as silently-dropped state).
 */
export class PrismaE2EERelay implements E2EERelay {
  constructor(private readonly prisma: E2EERelayPrismaClient) {}

  /** Build a production instance from the app's Prisma client. */
  static fromPrisma(prisma: PrismaClient): PrismaE2EERelay {
    return new PrismaE2EERelay(prisma as unknown as E2EERelayPrismaClient);
  }

  async publishBundle(
    userId: string,
    deviceId: string,
    bundle: PreKeyBundle,
  ): Promise<PublishedKeyBundle> {
    requireId(userId, 'userId');
    requireId(deviceId, 'deviceId');

    const row = await this.prisma.e2EERelayBundle.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      create: { userId, deviceId, ...toStoredBundleFields(bundle) },
      update: { ...toStoredBundleFields(bundle) },
    });
    return toPublishedBundle(row);
  }

  async getBundles(userId: string): Promise<PublishedKeyBundle[]> {
    requireId(userId, 'userId');

    const rows = await this.prisma.e2EERelayBundle.findMany({
      where: { userId },
      orderBy: { publishedAt: 'asc' },
    });
    return rows.map(toPublishedBundle);
  }

  async relayEnvelope(input: {
    senderId: string;
    recipientId: string;
    payload: CiphertextEnvelope;
    sessionId?: string;
  }): Promise<RelayedEnvelope> {
    requireId(input.senderId, 'senderId');
    requireId(input.recipientId, 'recipientId');
    if (input.senderId === input.recipientId) {
      throw createAppError('Cannot relay an envelope to yourself', 400, 'INVALID_RECIPIENT');
    }

    const row = await this.prisma.e2EERelayEnvelope.create({
      data: {
        senderId: input.senderId,
        recipientId: input.recipientId,
        sessionId: input.sessionId ?? null,
        ...toStoredEnvelopeFields(input.payload),
      },
    });
    return toRelayedEnvelope(row);
  }

  async drainInbox(recipientId: string, options?: DrainInboxOptions): Promise<RelayedEnvelope[]> {
    requireId(recipientId, 'recipientId');

    const limit = options?.limit;
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      throw createAppError('limit must be a positive integer', 400, 'INVALID_DRAIN_LIMIT');
    }

    // Read + delete atomically: an envelope is drained at most once even when
    // two drains race (e.g. two devices of the same user draining together).
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.e2EERelayEnvelope.findMany({
        where: { recipientId },
        orderBy: { relayedAt: 'asc' },
        ...(limit !== undefined ? { take: limit } : {}),
      });
      if (rows.length === 0) return [];
      await tx.e2EERelayEnvelope.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      return rows.map(toRelayedEnvelope);
    });
  }

  async shutdown(): Promise<void> {
    // The PrismaClient lifecycle is owned by the app, not the relay — nothing
    // to release here. (The in-memory relay clears its maps in shutdown().)
  }
}
