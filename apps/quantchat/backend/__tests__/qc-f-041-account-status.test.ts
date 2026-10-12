// ============================================================================
// QC-F-041 — account-status gate unit tests (QuantChat resolver)
// ============================================================================
//
// The resolver in lib/account-status.ts is the QuantChat half of the
// QC-F-041 revocation fix: the server-core auth plugin and the realtime
// verifier only know verdicts; THIS module decides them from the user row.
// Its contract is a DENY-LIST:
//   deletedAt set -> 'deleted'; SUSPENDED/DEACTIVATED -> 'suspended';
//   missing row -> 'deleted'; lookup failure -> 'unavailable';
//   everything else -> 'ok'.
// The trap this suite exists to pin (brief §2f/§7 case 6): phone-OTP users
// stay PENDING_VERIFICATION for their entire account life — an ACTIVE-only
// allow-list would lock out the whole phone population, so
// PENDING_VERIFICATION must resolve 'ok'.
//
// Cache behaviour is pinned honestly: a cached verdict survives until its
// TTL (revocation on other instances lands within the TTL), invalidate()
// makes this process immediate, and 'unavailable' is never cached.
// ============================================================================

import { describe, it, expect } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createAccountStatusGate } from '../lib/account-status';

interface FakeUserRow {
  deletedAt: Date | null;
  status: string;
}

function makeFakePrisma(rows: Record<string, FakeUserRow | undefined>) {
  const state = {
    calls: 0,
    shouldThrow: false,
  };
  const prisma = {
    user: {
      async findUnique({ where }: { where: { id: string } }) {
        state.calls++;
        if (state.shouldThrow) throw new Error('database unreachable');
        const row = rows[where.id];
        return row ? { deletedAt: row.deletedAt, status: row.status } : null;
      },
    },
  };
  // The helper's contract takes the real decorated PrismaClient type (the
  // F-017-era `unknown` param pattern broke CI typecheck on
  // app.decorate('prisma', ...) — PR #903/#905 lesson); the in-memory fake
  // is cast to it here, at construction.
  return { prisma: prisma as unknown as PrismaClient, state };
}

const ACTIVE = { deletedAt: null, status: 'ACTIVE' };

describe('QC-F-041 account-status resolver (deny-list verdicts)', () => {
  it('resolves ok for an ACTIVE user', async () => {
    const { prisma } = makeFakePrisma({ u1: ACTIVE });
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 0 });
    await expect(gate.resolver('u1')).resolves.toBe('ok');
  });

  it('phone OTP users stay PENDING_VERIFICATION and must not be locked out', async () => {
    const { prisma } = makeFakePrisma({
      u1: { deletedAt: null, status: 'PENDING_VERIFICATION' },
    });
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 0 });
    await expect(gate.resolver('u1')).resolves.toBe('ok');
  });

  it('resolves deleted when deletedAt is set', async () => {
    const { prisma } = makeFakePrisma({
      u1: { deletedAt: new Date('2026-10-11T00:00:00Z'), status: 'ACTIVE' },
    });
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 0 });
    await expect(gate.resolver('u1')).resolves.toBe('deleted');
  });

  it('resolves deleted for a missing row (a token for a nonexistent user was never valid)', async () => {
    const { prisma } = makeFakePrisma({});
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 0 });
    await expect(gate.resolver('ghost')).resolves.toBe('deleted');
  });

  it('resolves suspended for SUSPENDED and for DEACTIVATED', async () => {
    const { prisma } = makeFakePrisma({
      u1: { deletedAt: null, status: 'SUSPENDED' },
      u2: { deletedAt: null, status: 'DEACTIVATED' },
    });
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 0 });
    await expect(gate.resolver('u1')).resolves.toBe('suspended');
    await expect(gate.resolver('u2')).resolves.toBe('suspended');
  });

  it('deleted wins over suspended when both apply', async () => {
    const { prisma } = makeFakePrisma({
      u1: { deletedAt: new Date(), status: 'SUSPENDED' },
    });
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 0 });
    await expect(gate.resolver('u1')).resolves.toBe('deleted');
  });

  it('resolves unavailable when the lookup throws (callers fail closed)', async () => {
    const { prisma, state } = makeFakePrisma({ u1: ACTIVE });
    state.shouldThrow = true;
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 0 });
    await expect(gate.resolver('u1')).resolves.toBe('unavailable');
  });

  it('resolves unavailable when no prisma client exists yet', async () => {
    const gate = createAccountStatusGate(() => undefined, { ttlMs: 0 });
    await expect(gate.resolver('u1')).resolves.toBe('unavailable');
  });
});

describe('QC-F-041 account-status cache (honest revocation latency)', () => {
  it('serves the second verdict from cache within the TTL (one DB read)', async () => {
    const { prisma, state } = makeFakePrisma({ u1: ACTIVE });
    let nowMs = 1_000_000;
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 30_000, now: () => nowMs });
    await expect(gate.resolver('u1')).resolves.toBe('ok');
    await expect(gate.resolver('u1')).resolves.toBe('ok');
    expect(state.calls).toBe(1);
    nowMs += 30_001;
    await expect(gate.resolver('u1')).resolves.toBe('ok');
    expect(state.calls).toBe(2);
  });

  it('a cached ok survives until the TTL even if the row is deleted meanwhile (documented window)', async () => {
    const rows: Record<string, FakeUserRow | undefined> = { u1: { ...ACTIVE } };
    const { prisma } = makeFakePrisma(rows);
    let nowMs = 1_000_000;
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 30_000, now: () => nowMs });
    await expect(gate.resolver('u1')).resolves.toBe('ok');
    rows['u1'] = { deletedAt: new Date(), status: 'ACTIVE' };
    // Inside the window the stale verdict is still served — this is the
    // ≤TTL revocation latency the design accepts (vs 1h/30d before).
    await expect(gate.resolver('u1')).resolves.toBe('ok');
    nowMs += 30_001;
    await expect(gate.resolver('u1')).resolves.toBe('deleted');
  });

  it('invalidate() makes this process immediate (the DELETE /account path)', async () => {
    const rows: Record<string, FakeUserRow | undefined> = { u1: { ...ACTIVE } };
    const { prisma, state } = makeFakePrisma(rows);
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 30_000 });
    await expect(gate.resolver('u1')).resolves.toBe('ok');
    rows['u1'] = { deletedAt: new Date(), status: 'ACTIVE' };
    gate.invalidate('u1');
    await expect(gate.resolver('u1')).resolves.toBe('deleted');
    expect(state.calls).toBe(2);
  });

  it('never caches unavailable — recovery is immediate once the DB answers', async () => {
    const { prisma, state } = makeFakePrisma({ u1: ACTIVE });
    const gate = createAccountStatusGate(() => prisma, { ttlMs: 30_000 });
    state.shouldThrow = true;
    await expect(gate.resolver('u1')).resolves.toBe('unavailable');
    state.shouldThrow = false;
    await expect(gate.resolver('u1')).resolves.toBe('ok');
    expect(gate.cacheSize()).toBe(1);
  });
});
