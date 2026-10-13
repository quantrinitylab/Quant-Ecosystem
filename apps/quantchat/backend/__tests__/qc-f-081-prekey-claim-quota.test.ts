// ============================================================================
// QC-F-081 — one-time prekey pool exhaustion: claim quota gate + ledger.
//
// Before the fix, `EncryptionService.claimPreKeyBundle` took only the target
// id: every authenticated claim anonymously consumed one of the victim's
// one-time prekeys, forever, with no per-claimer limit and no record of who
// claimed. ~100 requests (the global per-IP budget for ONE minute) emptied a
// default pool and silently downgraded all of the victim's new X3DH sessions
// to signedPreKey-only.
//
// These tests drive the REAL EncryptionService + PrismaKeyStorage +
// PrekeyService against the in-memory fake Prisma (the repo's established
// harness — no live Postgres in the sandbox). Negative control: on the
// pre-fix code the drain test below fails — the attacker receives all 15
// keys he asks for and the pool drops by 15, because nothing throttles him.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { PrismaKeyStorage } from '../services/prisma-key-storage';
import {
  EncryptionService,
  PREKEY_CLAIM_PAIR_HOURLY_LIMIT,
  type PrekeyClaimHooks,
  type PreKeyBundle,
} from '../services/encryption.service';
import { PrekeyService } from '../services/prekey.service';
import { createFakeKeyPrisma, asPrismaClient, type FakeKeyPrisma } from './fake-key-prisma';

const VICTIM = 'user-victim';

function validBundle(): PreKeyBundle {
  const identityKey = 'victim-identity-key';
  const signedPreKey = 'victim-signed-prekey';
  return {
    identityKey,
    signedPreKey,
    signedPreKeySignature: crypto
      .createHmac('sha256', identityKey)
      .update(signedPreKey)
      .digest('hex'),
    registrationId: 42,
  };
}

interface Harness {
  fake: FakeKeyPrisma;
  storage: PrismaKeyStorage;
  service: EncryptionService;
  throttled: Array<{ targetUserId: string; requesterId: string | null; reason: string }>;
  poolLow: Array<{ targetUserId: string; remaining: number }>;
}

/** Fresh victim with a published bundle and `poolSize` one-time prekeys. */
async function harnessWithPool(poolSize: number): Promise<Harness> {
  const fake = createFakeKeyPrisma();
  const storage = new PrismaKeyStorage(asPrismaClient(fake));
  const throttled: Harness['throttled'] = [];
  const poolLow: Harness['poolLow'] = [];
  const hooks: PrekeyClaimHooks = {
    onClaimThrottled: (info) => throttled.push(info),
    onPoolLow: (info) => poolLow.push(info),
  };
  const service = new EncryptionService(storage, hooks);
  const keys = Array.from({ length: poolSize }, (_, i) => `otk-${i}`);
  await service.uploadPreKeyBundle(VICTIM, validBundle(), keys);
  return { fake, storage, service, throttled, poolLow };
}

/** Age every claimed row in the fake ledger by `ms` (window-expiry setups). */
function ageClaims(fake: FakeKeyPrisma, ms: number): void {
  for (const row of fake.__state.otks) {
    if (row.claimed && row.claimedAt) {
      row.claimedAt = new Date(row.claimedAt.getTime() - ms);
    }
  }
}

describe('QC-F-081 — prekey claim quota gate', () => {
  it('legit first claim receives a one-time prekey and is ledgered by claimer', async () => {
    const h = await harnessWithPool(5);

    const bundle = await h.service.claimPreKeyBundle(VICTIM, 'user-alice');

    expect(bundle.oneTimePreKey).toBe('otk-0');
    expect(await h.storage.countOneTimePreKeys(VICTIM)).toBe(4);
    const claimed = h.fake.__state.otks.filter((o) => o.claimed);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.claimedBy).toBe('user-alice');
    expect(claimed[0]?.claimedAt).toBeInstanceOf(Date);
    expect(h.throttled).toHaveLength(0);
  });

  it('distinct claimers each receive distinct keys', async () => {
    const h = await harnessWithPool(5);

    const a = await h.service.claimPreKeyBundle(VICTIM, 'user-alice');
    const b = await h.service.claimPreKeyBundle(VICTIM, 'user-bob');
    const c = await h.service.claimPreKeyBundle(VICTIM, 'user-carol');

    expect(new Set([a.oneTimePreKey, b.oneTimePreKey, c.oneTimePreKey]).size).toBe(3);
    expect(await h.storage.countOneTimePreKeys(VICTIM)).toBe(2);
  });

  it('a single attacker cannot drain the pool: hourly pair quota stops consumption, bundle still served without a key', async () => {
    const h = await harnessWithPool(30);

    const results = [];
    for (let i = 0; i < PREKEY_CLAIM_PAIR_HOURLY_LIMIT + 5; i++) {
      results.push(await h.service.claimPreKeyBundle(VICTIM, 'user-mallory'));
    }

    // First HOURLY_LIMIT claims succeed; the rest get the Requirement 2.6
    // shape (bundle, no one-time prekey) and consume NOTHING.
    for (let i = 0; i < PREKEY_CLAIM_PAIR_HOURLY_LIMIT; i++) {
      expect(results[i]?.oneTimePreKey).toBeTruthy();
    }
    for (let i = PREKEY_CLAIM_PAIR_HOURLY_LIMIT; i < results.length; i++) {
      expect(results[i]?.oneTimePreKey).toBeUndefined();
      expect(results[i]?.identityKey).toBe('victim-identity-key');
    }
    expect(await h.storage.countOneTimePreKeys(VICTIM)).toBe(
      30 - PREKEY_CLAIM_PAIR_HOURLY_LIMIT,
    );
    expect(h.throttled.length).toBe(5);
    expect(h.throttled.every((t) => t.reason === 'pair-hourly-quota')).toBe(true);
    expect(h.throttled.every((t) => t.requesterId === 'user-mallory')).toBe(true);
  });

  it("one attacker's throttle does not block a different user's first claim", async () => {
    const h = await harnessWithPool(30);
    for (let i = 0; i < PREKEY_CLAIM_PAIR_HOURLY_LIMIT + 3; i++) {
      await h.service.claimPreKeyBundle(VICTIM, 'user-mallory');
    }

    const legit = await h.service.claimPreKeyBundle(VICTIM, 'user-alice');
    expect(legit.oneTimePreKey).toBeTruthy();
  });

  it('daily pair quota binds even when the hourly window is clear', async () => {
    const h = await harnessWithPool(40);
    // Mallory claims the hourly limit now, then those claims age past the
    // hourly window; 15 further ledger rows are seeded as hers from 2h ago.
    for (let i = 0; i < PREKEY_CLAIM_PAIR_HOURLY_LIMIT; i++) {
      await h.service.claimPreKeyBundle(VICTIM, 'user-mallory');
    }
    ageClaims(h.fake, 2 * 60 * 60 * 1000);
    let seeded = 0;
    for (const row of h.fake.__state.otks) {
      if (seeded >= 15) break;
      if (!row.claimed) {
        row.claimed = true;
        row.claimedBy = 'user-mallory';
        row.claimedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
        seeded += 1;
      }
    }
    expect(await h.storage.countClaimsSince(VICTIM, new Date(0), 'user-mallory')).toBe(25);
    const remainingBefore = await h.storage.countOneTimePreKeys(VICTIM);

    const denied = await h.service.claimPreKeyBundle(VICTIM, 'user-mallory');

    expect(denied.oneTimePreKey).toBeUndefined();
    expect(await h.storage.countOneTimePreKeys(VICTIM)).toBe(remainingBefore);
    expect(h.throttled.at(-1)?.reason).toBe('pair-daily-quota');
  });

  it('hourly quota is a rolling window, not a permanent ban', async () => {
    const h = await harnessWithPool(30);
    for (let i = 0; i < PREKEY_CLAIM_PAIR_HOURLY_LIMIT; i++) {
      await h.service.claimPreKeyBundle(VICTIM, 'user-mallory');
    }
    const blocked = await h.service.claimPreKeyBundle(VICTIM, 'user-mallory');
    expect(blocked.oneTimePreKey).toBeUndefined();

    ageClaims(h.fake, 61 * 60 * 1000);

    const afterWindow = await h.service.claimPreKeyBundle(VICTIM, 'user-mallory');
    expect(afterWindow.oneTimePreKey).toBeTruthy();
  });

  it('aggregate velocity gate stops a multi-account drain (account rotation does not defeat the quotas)', async () => {
    const h = await harnessWithPool(40);

    for (let i = 0; i < 30; i++) {
      const bundle = await h.service.claimPreKeyBundle(VICTIM, `user-attacker-${i}`);
      expect(bundle.oneTimePreKey).toBeTruthy();
    }
    const remainingBefore = await h.storage.countOneTimePreKeys(VICTIM);
    expect(remainingBefore).toBe(10);

    // A brand-new account's first claim is still refused a key while the
    // pool is under drain velocity — the bundle itself is served.
    const denied = await h.service.claimPreKeyBundle(VICTIM, 'user-attacker-30');
    expect(denied.oneTimePreKey).toBeUndefined();
    expect(denied.identityKey).toBe('victim-identity-key');
    expect(await h.storage.countOneTimePreKeys(VICTIM)).toBe(remainingBefore);
    expect(h.throttled.at(-1)?.reason).toBe('target-velocity');
  });

  it('unattributed claims never consume a key (fail-closed)', async () => {
    const h = await harnessWithPool(5);

    const noRequester = await h.service.claimPreKeyBundle(VICTIM);
    const emptyRequester = await h.service.claimPreKeyBundle(VICTIM, '');

    expect(noRequester.oneTimePreKey).toBeUndefined();
    expect(emptyRequester.oneTimePreKey).toBeUndefined();
    expect(await h.storage.countOneTimePreKeys(VICTIM)).toBe(5);
    expect(h.throttled.map((t) => t.reason)).toEqual(['unattributed', 'unattributed']);
  });

  it('pool-low signal fires once when a claim crosses the threshold, then throttles', async () => {
    const h = await harnessWithPool(11);

    await h.service.claimPreKeyBundle(VICTIM, 'user-alice');
    expect(h.poolLow).toEqual([{ targetUserId: VICTIM, remaining: 10 }]);

    await h.service.claimPreKeyBundle(VICTIM, 'user-bob');
    expect(await h.storage.countOneTimePreKeys(VICTIM)).toBe(9);
    expect(h.poolLow).toHaveLength(1);
  });

  it('throttle/pool-low hook payloads never contain key material', async () => {
    const h = await harnessWithPool(12);
    for (let i = 0; i < PREKEY_CLAIM_PAIR_HOURLY_LIMIT + 2; i++) {
      await h.service.claimPreKeyBundle(VICTIM, 'user-mallory');
    }

    const payload = JSON.stringify({ throttled: h.throttled, poolLow: h.poolLow });
    for (let i = 0; i < 12; i++) {
      expect(payload).not.toContain(`otk-${i}`);
    }
    expect(payload).not.toContain('victim-signed-prekey');
    expect(payload).not.toContain('victim-identity-key');
  });

  it('ledger counts are per-(claimer, owner) and aggregate correctly', async () => {
    const h = await harnessWithPool(10);
    await h.service.claimPreKeyBundle(VICTIM, 'user-alice');
    await h.service.claimPreKeyBundle(VICTIM, 'user-alice');
    await h.service.claimPreKeyBundle(VICTIM, 'user-bob');

    const since = new Date(0);
    expect(await h.storage.countClaimsSince(VICTIM, since, 'user-alice')).toBe(2);
    expect(await h.storage.countClaimsSince(VICTIM, since, 'user-bob')).toBe(1);
    expect(await h.storage.countClaimsSince(VICTIM, since, 'user-carol')).toBe(0);
    expect(await h.storage.countClaimsSince(VICTIM, since)).toBe(3);
    expect(await h.storage.countClaimsSince(VICTIM, new Date(Date.now() + 60_000))).toBe(0);
  });

  it('PrekeyService (unscoped lane) carries the claimer and throttles identically', async () => {
    const fake = createFakeKeyPrisma();
    const storage = new PrismaKeyStorage(asPrismaClient(fake));
    const setup = new EncryptionService(storage);
    await setup.uploadPreKeyBundle(
      VICTIM,
      validBundle(),
      Array.from({ length: 15 }, (_, i) => `otk-${i}`),
    );
    const lane = new PrekeyService(asPrismaClient(fake), storage);

    const first = await lane.fetchPrekeyBundle(VICTIM, 'user-alice');
    expect(first.oneTimePrekey).toBe('otk-0');
    expect(first.signedPrekey.key).toBe('victim-signed-prekey');

    for (let i = 0; i < PREKEY_CLAIM_PAIR_HOURLY_LIMIT; i++) {
      await lane.fetchPrekeyBundle(VICTIM, 'user-mallory');
    }
    const throttledFetch = await lane.fetchPrekeyBundle(VICTIM, 'user-mallory');
    expect(throttledFetch.oneTimePrekey).toBeUndefined();
    expect(throttledFetch.identityKey).toBe('victim-identity-key');
    expect(await storage.countOneTimePreKeys(VICTIM)).toBe(15 - 1 - PREKEY_CLAIM_PAIR_HOURLY_LIMIT);
  });
});
