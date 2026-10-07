import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaE2EERelay, type E2EERelayPrismaClient } from '../services/prisma-e2ee-relay';
import { InMemoryE2EERelay, type CiphertextEnvelope } from '../lib/e2ee-relay';
import type { PreKeyBundle } from '@quant/encryption';

// ============================================================================
// K27 — persistent E2EE relay tests (doc 16 §1/§7/§11/§29).
//
// These run against a fake Prisma delegate whose backing store outlives any
// single relay instance — exactly the property the production Prisma relay has
// over a real database and the in-memory relay lacks. That makes the
// restart-recovery test meaningful: instance B sees what instance A wrote.
// ============================================================================

interface FakeBundleRow {
  userId: string;
  deviceId: string;
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey: string | null;
  registrationId: number;
  publishedAt: Date;
}

interface FakeEnvelopeRow {
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

/** In-memory stand-in for the Prisma delegates (backing store survives "restarts"). */
class FakePrisma implements E2EERelayPrismaClient {
  readonly bundles = new Map<string, FakeBundleRow>();
  readonly envelopes = new Map<string, FakeEnvelopeRow>();
  private counter = 0;

  /** Every raw write the fake receives — used by zero-knowledge assertions. */
  readonly writtenPayloads: unknown[] = [];

  e2EERelayBundle = {
    upsert: async (args: any): Promise<FakeBundleRow> => {
      const { userId, deviceId } = args.where.userId_deviceId;
      const fields = { ...args.create, ...args.update };
      this.writtenPayloads.push(fields);
      const row: FakeBundleRow = {
        userId,
        deviceId,
        identityKey: fields.identityKey,
        signedPreKey: fields.signedPreKey,
        signedPreKeySignature: fields.signedPreKeySignature,
        oneTimePreKey: fields.oneTimePreKey ?? null,
        registrationId: fields.registrationId,
        publishedAt: new Date(),
      };
      this.bundles.set(`${userId}:${deviceId}`, row);
      return row;
    },
    findMany: async (args: any): Promise<FakeBundleRow[]> => {
      return [...this.bundles.values()].filter((r) => r.userId === args.where.userId);
    },
  };

  e2EERelayEnvelope = {
    create: async (args: any): Promise<FakeEnvelopeRow> => {
      this.writtenPayloads.push(args.data);
      const row: FakeEnvelopeRow = {
        id: `env-${++this.counter}`,
        relayedAt: new Date(),
        ...args.data,
      };
      this.envelopes.set(row.id, row);
      return row;
    },
    findMany: async (args: any): Promise<FakeEnvelopeRow[]> => {
      let rows = [...this.envelopes.values()].filter(
        (r) => r.recipientId === args.where.recipientId,
      );
      rows.sort((a, b) => a.relayedAt.getTime() - b.relayedAt.getTime());
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      return rows;
    },
    deleteMany: async (args: any): Promise<{ count: number }> => {
      const ids: string[] = args.where.id.in;
      let count = 0;
      for (const id of ids) {
        if (this.envelopes.delete(id)) count++;
      }
      return { count };
    },
  };

  $transaction = async <T>(fn: (tx: E2EERelayPrismaClient) => Promise<T>): Promise<T> => {
    return fn(this);
  };
}

function publicBundle(): PreKeyBundle {
  return {
    identityKey: 'pub-identity-key',
    signedPreKey: 'pub-signed-prekey',
    signedPreKeySignature: 'sig',
    oneTimePreKey: 'pub-otp',
    registrationId: 42,
  };
}

function ciphertextPayload(): CiphertextEnvelope {
  return {
    ciphertext: 'opaque-ciphertext',
    nonce: 'nonce',
    tag: 'tag',
    algorithm: 'aes-256-gcm',
    senderFingerprint: 'fp-sender',
    recipientFingerprint: 'fp-recipient',
    timestamp: new Date('2026-10-08T00:00:00.000Z').toISOString(),
    version: 1,
  };
}

describe('PrismaE2EERelay — persistence round-trip (K27)', () => {
  let fake: FakePrisma;
  let relay: PrismaE2EERelay;

  beforeEach(() => {
    fake = new FakePrisma();
    relay = new PrismaE2EERelay(fake);
  });

  it('publishes a device bundle and reads it back', async () => {
    const record = await relay.publishBundle('user-1', 'device-a', publicBundle());
    expect(record.userId).toBe('user-1');
    expect(record.deviceId).toBe('device-a');
    expect(record.bundle.identityKey).toBe('pub-identity-key');

    const bundles = await relay.getBundles('user-1');
    expect(bundles).toHaveLength(1);
    expect(bundles[0].bundle.registrationId).toBe(42);
  });

  it('re-publishing from the same device replaces the bundle (multidevice §11)', async () => {
    await relay.publishBundle('user-1', 'device-a', publicBundle());
    await relay.publishBundle('user-1', 'device-a', {
      ...publicBundle(),
      identityKey: 'rotated-identity-key',
    });
    const bundles = await relay.getBundles('user-1');
    expect(bundles).toHaveLength(1);
    expect(bundles[0].bundle.identityKey).toBe('rotated-identity-key');
  });

  it('keeps per-device bundles separate', async () => {
    await relay.publishBundle('user-1', 'device-a', publicBundle());
    await relay.publishBundle('user-1', 'device-b', publicBundle());
    expect(await relay.getBundles('user-1')).toHaveLength(2);
  });

  it('relays a ciphertext envelope and drains it exactly once', async () => {
    const envelope = await relay.relayEnvelope({
      senderId: 'user-1',
      recipientId: 'user-2',
      payload: ciphertextPayload(),
    });
    expect(envelope.payload.ciphertext).toBe('opaque-ciphertext');

    const drained = await relay.drainInbox('user-2');
    expect(drained).toHaveLength(1);
    expect(drained[0].id).toBe(envelope.id);

    // Second drain is empty — at-most-once delivery.
    expect(await relay.drainInbox('user-2')).toHaveLength(0);
  });

  it('drainInbox honors the limit and leaves the remainder', async () => {
    for (let i = 0; i < 3; i++) {
      await relay.relayEnvelope({ senderId: 'user-1', recipientId: 'user-2', payload: ciphertextPayload() });
    }
    const first = await relay.drainInbox('user-2', { limit: 2 });
    expect(first).toHaveLength(2);
    const rest = await relay.drainInbox('user-2');
    expect(rest).toHaveLength(1);
  });
});

describe('PrismaE2EERelay — restart recovery (K27, doc 16 §11)', () => {
  it('key-distribution state survives a relay restart', async () => {
    const store = new FakePrisma();
    const before = new PrismaE2EERelay(store);
    await before.publishBundle('user-1', 'device-a', publicBundle());
    await before.relayEnvelope({ senderId: 'user-1', recipientId: 'user-2', payload: ciphertextPayload() });

    // Simulate a restart: a brand-new relay instance over the same store.
    const after = new PrismaE2EERelay(store);
    expect(await after.getBundles('user-1')).toHaveLength(1);
    expect(await after.drainInbox('user-2')).toHaveLength(1);
  });

  it('documents the gap it closes: the in-memory relay loses everything on restart', async () => {
    const mem = new InMemoryE2EERelay();
    await mem.publishBundle('user-1', 'device-a', publicBundle());
    await mem.relayEnvelope({ senderId: 'user-1', recipientId: 'user-2', payload: ciphertextPayload() });
    await mem.shutdown(); // what a process restart does to in-memory state

    const restarted = new InMemoryE2EERelay();
    expect(await restarted.getBundles('user-1')).toHaveLength(0);
    expect(await restarted.drainInbox('user-2')).toHaveLength(0);
  });
});

describe('PrismaE2EERelay — zero-knowledge invariants (doc 16 §1)', () => {
  it('never writes private keys, plaintext, or ratchet secrets — even if the input is polluted', async () => {
    const fake = new FakePrisma();
    const relay = new PrismaE2EERelay(fake);

    const polluted = {
      ...publicBundle(),
      privateKey: 'SECRET-PRIVATE-KEY',
      plaintext: 'hello world',
      rootKey: 'SECRET-ROOT-KEY',
    } as unknown as PreKeyBundle;
    await relay.publishBundle('user-1', 'device-a', polluted);

    const writtenKeys = fake.writtenPayloads.flatMap((p) => Object.keys(p as object));
    expect(writtenKeys).not.toContain('privateKey');
    expect(writtenKeys).not.toContain('plaintext');
    expect(writtenKeys).not.toContain('rootKey');

    const allValues = JSON.stringify(fake.writtenPayloads);
    expect(allValues).not.toContain('SECRET-PRIVATE-KEY');
    expect(allValues).not.toContain('hello world');
    expect(allValues).not.toContain('SECRET-ROOT-KEY');
  });

  it('the migration introduces no secret-bearing columns', () => {
    const raw = readFileSync(
      join(__dirname, '../../../..', 'packages/database/prisma/migrations/0082_e2ee_relay_persistence/migration.sql'),
      'utf8',
    );
    // Strip SQL line comments — the invariant is documented *in* comments, so
    // only column definitions count.
    const sql = raw
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .toLowerCase();
    for (const forbidden of ['privatekey', 'private_key', 'plaintext', 'plain_text', 'ratchet', 'rootkey', 'root_key']) {
      expect(sql).not.toContain(forbidden);
    }
    expect(sql).toContain('e2ee_relay_bundles');
    expect(sql).toContain('e2ee_relay_envelopes');
  });

  it('relayed envelopes store ciphertext only — no plaintext field exists on the write path', async () => {
    const fake = new FakePrisma();
    const relay = new PrismaE2EERelay(fake);
    await relay.relayEnvelope({ senderId: 'user-1', recipientId: 'user-2', payload: ciphertextPayload() });
    const writtenKeys = fake.writtenPayloads.flatMap((p) => Object.keys(p as object));
    expect(writtenKeys).not.toContain('plaintext');
    expect(writtenKeys).toContain('ciphertext');
  });
});

describe('PrismaE2EERelay — fail-closed (doc 16 §30)', () => {
  it('rejects empty identities', async () => {
    const relay = new PrismaE2EERelay(new FakePrisma());
    await expect(relay.publishBundle('', 'device-a', publicBundle())).rejects.toThrow();
    await expect(relay.publishBundle('user-1', '', publicBundle())).rejects.toThrow();
    await expect(relay.getBundles('')).rejects.toThrow();
    await expect(
      relay.relayEnvelope({ senderId: '', recipientId: 'user-2', payload: ciphertextPayload() }),
    ).rejects.toThrow();
    await expect(relay.drainInbox('')).rejects.toThrow();
  });

  it('rejects relaying an envelope to yourself', async () => {
    const relay = new PrismaE2EERelay(new FakePrisma());
    const err = await relay
      .relayEnvelope({ senderId: 'user-1', recipientId: 'user-1', payload: ciphertextPayload() })
      .catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { code?: string }).code).toBe('INVALID_RECIPIENT');
  });

  it('rejects a non-positive drain limit', async () => {
    const relay = new PrismaE2EERelay(new FakePrisma());
    await expect(relay.drainInbox('user-2', { limit: 0 })).rejects.toThrow();
    await expect(relay.drainInbox('user-2', { limit: -3 })).rejects.toThrow();
  });
});
