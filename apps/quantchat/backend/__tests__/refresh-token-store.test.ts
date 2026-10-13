// ============================================================================
// QC-F-118 — RefreshTokenStore: stateful redemption, reuse detection,
// family revocation.
//
// Before this fix, refresh redemption was stateless: the same refresh
// token could be replayed for its full 30-day life, rotation never
// invalidated it, logout revoked nothing, and reuse left no trace. The
// centre of this suite is the REUSE NEGATIVE CONTROL (test 2): redeem a
// token, rotate, then present the OLD token again after the grace window
// — it must be refused AND its whole family (including the legitimately
// rotated successor) must die. Against the pre-fix code this suite cannot
// even load (no store existed; the issuer's stateless rotate() happily
// re-minted pairs for replayed tokens — see the git history of
// session-tokens-rotate.test.ts).
//
// The Prisma fake is an in-memory row store with STABLE identities and a
// shared controllable clock (module-level state, no fresh-identity mocks).
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SessionTokenIssuer } from '../lib/session-tokens';
import {
  RefreshTokenStore,
  digestRefreshToken,
  REFRESH_REUSE_GRACE_MS,
} from '../lib/refresh-token-store';

const config = {
  jwtSecret: 'test-secret-at-least-32-chars-long-000',
  jwtIssuer: 'quantchat',
  jwtAudience: 'quant-ecosystem',
};

const ALICE = { userId: 'user-alice', username: 'alice' };
const BOB = { userId: 'user-bob', username: 'bob' };

interface Row {
  id: string;
  userId: string;
  token: string;
  family: string;
  isRevoked: boolean;
  expiresAt: Date;
  createdAt: Date;
  userAgent?: string;
  ipAddress?: string;
  source?: string;
}

// --- Controllable clock + in-memory RefreshToken delegate -------------------
let nowMs = 1_760_000_000_000;
const rows = new Map<string, Row>();
let failFindUnique = false;

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'expiresAt' && cond && typeof cond === 'object') {
      const gt = (cond as { gt?: Date }).gt;
      if (gt && !(row.expiresAt.getTime() > gt.getTime())) return false;
      continue;
    }
    if ((row as unknown as Record<string, unknown>)[key] !== cond) return false;
  }
  return true;
}

const fakePrisma = {
  refreshToken: {
    async create({
      data,
    }: {
      data: Omit<Row, 'createdAt' | 'isRevoked'> & { isRevoked?: boolean; createdAt?: Date };
    }) {
      // Prisma's @default(false) on isRevoked is part of the real contract.
      const row: Row = {
        ...data,
        isRevoked: data.isRevoked ?? false,
        createdAt: data.createdAt ?? new Date(nowMs),
      };
      rows.set(row.id, row);
      return row;
    },
    async findUnique({ where }: { where: { id: string } }) {
      if (failFindUnique) throw new Error('db down');
      return rows.get(where.id) ?? null;
    },
    async findFirst({
      where,
      orderBy,
    }: {
      where: Record<string, unknown>;
      orderBy?: { createdAt: 'desc' | 'asc' };
    }) {
      const found = [...rows.values()].filter((r) => matches(r, where));
      found.sort((a, b) =>
        orderBy?.createdAt === 'desc'
          ? b.createdAt.getTime() - a.createdAt.getTime()
          : a.createdAt.getTime() - b.createdAt.getTime(),
      );
      return found[0] ?? null;
    },
    async updateMany({
      where,
      data,
    }: {
      where: Record<string, unknown>;
      data: { isRevoked: boolean };
    }) {
      let count = 0;
      for (const row of rows.values()) {
        if (matches(row, where)) {
          row.isRevoked = data.isRevoked;
          count++;
        }
      }
      return { count };
    },
  },
};

const issuer = new SessionTokenIssuer(config);

function makeStore(): RefreshTokenStore {
  return new RefreshTokenStore(fakePrisma as unknown as PrismaClient, issuer, {
    now: () => nowMs,
  });
}

async function redeem(store: RefreshTokenStore, refreshToken: string, subject = ALICE) {
  const payload = issuer.verifyRefreshToken(refreshToken);
  if (!payload) throw new Error('test token did not verify');
  return store.redeem({ payload, presentedToken: refreshToken, subject });
}

beforeEach(() => {
  rows.clear();
  failFindUnique = false;
  nowMs = 1_760_000_000_000;
});

describe('RefreshTokenStore — issuance registration', () => {
  it('stores ONLY the SHA-256 digest, keyed by the refresh token jti, in a fresh family', async () => {
    const store = makeStore();
    const tokens = await store.issueNewSession(ALICE, { userAgent: 'test-agent' });

    const row = rows.get(tokens.refreshTokenId);
    expect(row).toBeTruthy();
    expect(row!.token).toBe(digestRefreshToken(tokens.refreshToken));
    expect(row!.token).not.toBe(tokens.refreshToken);
    expect(JSON.stringify(row)).not.toContain(tokens.refreshToken);
    expect(row!.family).toBe(tokens.familyId);
    expect(row!.userId).toBe(ALICE.userId);
    expect(row!.isRevoked).toBe(false);
    expect(row!.expiresAt.getTime()).toBeGreaterThan(nowMs);
  });
});

describe('RefreshTokenStore — redemption', () => {
  it('happy path: redeem spends the old token and issues a successor in the SAME family', async () => {
    const store = makeStore();
    const first = await store.issueNewSession(ALICE);

    const result = await redeem(store, first.refreshToken);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.via).toBe('spend');
    expect(result.tokens.familyId).toBe(first.familyId);
    expect(result.tokens.refreshTokenId).not.toBe(first.refreshTokenId);
    expect(rows.get(first.refreshTokenId)!.isRevoked).toBe(true);
    expect(rows.get(result.tokens.refreshTokenId)!.isRevoked).toBe(false);
  });

  it('REUSE NEGATIVE CONTROL: old token replayed after grace → reuse, WHOLE family dies, successor also refused', async () => {
    const store = makeStore();
    const first = await store.issueNewSession(ALICE);
    const rotated = await redeem(store, first.refreshToken);
    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;

    nowMs += REFRESH_REUSE_GRACE_MS + 1_000;
    const replay = await redeem(store, first.refreshToken);
    expect(replay).toEqual({
      ok: false,
      reason: 'reuse',
      familyId: first.familyId,
    });
    for (const row of rows.values()) {
      if (row.family === first.familyId) expect(row.isRevoked).toBe(true);
    }
    // The legitimately rotated successor is dead too — that is the point
    // of family revocation: a replayed ancestor burns the whole chain.
    const successorAttempt = await redeem(store, rotated.tokens.refreshToken);
    expect(successorAttempt.ok).toBe(false);
  });

  it('grace: re-presenting a just-spent token chain-follows instead of revoking (parallel-401 race)', async () => {
    const store = makeStore();
    const first = await store.issueNewSession(ALICE);
    const winner = await redeem(store, first.refreshToken);
    expect(winner.ok).toBe(true);
    if (!winner.ok) return;

    // The race loser presents the SAME token moments later.
    const loser = await redeem(store, first.refreshToken);
    expect(loser.ok).toBe(true);
    if (!loser.ok) return;
    expect(loser.via).toBe('grace');
    expect(loser.tokens.familyId).toBe(first.familyId);

    // The winner's (now spent) token also chain-follows within grace.
    const winnerNext = await redeem(store, winner.tokens.refreshToken);
    expect(winnerNext.ok).toBe(true);
  });

  it('concurrent redeem of one token: exactly one spend, the other chain-follows — family never half-dead', async () => {
    const store = makeStore();
    const first = await store.issueNewSession(ALICE);
    const payload = issuer.verifyRefreshToken(first.refreshToken)!;

    const [a, b] = await Promise.all([
      store.redeem({ payload, presentedToken: first.refreshToken, subject: ALICE }),
      store.redeem({ payload, presentedToken: first.refreshToken, subject: ALICE }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const vias = [a, b].map((r) => (r.ok ? r.via : 'fail')).sort();
    expect(vias).toEqual(['grace', 'spend']);
    const liveHeads = [...rows.values()].filter(
      (r) => r.family === first.familyId && !r.isRevoked,
    );
    expect(liveHeads).toHaveLength(1);
  });

  it('binding forgery: a token whose digest does not match the row → binding, family revoked', async () => {
    const store = makeStore();
    const first = await store.issueNewSession(ALICE);
    // Same jti + family claims, different signed bytes (different
    // username claim → different payload → different digest).
    const forged = await issuer.issue(
      { userId: ALICE.userId, username: 'mallory' },
      { familyId: first.familyId, refreshTokenId: first.refreshTokenId },
    );
    const payload = issuer.verifyRefreshToken(forged.refreshToken)!;
    const result = await store.redeem({
      payload,
      presentedToken: forged.refreshToken,
      subject: ALICE,
    });
    expect(result).toEqual({ ok: false, reason: 'binding', familyId: first.familyId });
    expect(rows.get(first.refreshTokenId)!.isRevoked).toBe(true);
  });

  it('legacy token (no fam claim) fails closed as legacy, no row created', async () => {
    const store = makeStore();
    const tokens = await issuer.issue(ALICE);
    const payload = issuer.verifyRefreshToken(tokens.refreshToken)!;
    delete payload['fam'];
    const result = await store.redeem({
      payload,
      presentedToken: tokens.refreshToken,
      subject: ALICE,
    });
    expect(result).toEqual({ ok: false, reason: 'legacy' });
    expect(rows.size).toBe(0);
  });

  it('validly-signed but UNREGISTERED token → unknown, fail closed', async () => {
    const store = makeStore();
    const tokens = await issuer.issue(ALICE);
    const result = await redeem(store, tokens.refreshToken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unknown');
  });

  it('DB failure at lookup → unavailable and the token is NOT spent', async () => {
    const store = makeStore();
    const first = await store.issueNewSession(ALICE);
    failFindUnique = true;
    const result = await redeem(store, first.refreshToken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unavailable');
    failFindUnique = false;
    expect(rows.get(first.refreshTokenId)!.isRevoked).toBe(false);
  });
});

describe('RefreshTokenStore — revocation', () => {
  it('logout revoke: family dies (no grace — no live head), other family of same user untouched', async () => {
    const store = makeStore();
    const sessionA = await store.issueNewSession(ALICE);
    const sessionB = await store.issueNewSession(ALICE);

    await expect(store.revokeFamilyForUser(ALICE.userId, sessionA.refreshToken)).resolves.toBe(
      true,
    );
    const afterLogout = await redeem(store, sessionA.refreshToken);
    expect(afterLogout.ok).toBe(false);

    const other = await redeem(store, sessionB.refreshToken, ALICE);
    expect(other.ok).toBe(true);
  });

  it("logout revoke is user-bound: presenting someone else's token revokes nothing", async () => {
    const store = makeStore();
    const aliceSession = await store.issueNewSession(ALICE);

    await expect(store.revokeFamilyForUser(BOB.userId, aliceSession.refreshToken)).resolves.toBe(
      false,
    );
    const stillAlive = await redeem(store, aliceSession.refreshToken);
    expect(stillAlive.ok).toBe(true);
  });

  it('revokeAllForUser kills every family of that user and nobody else', async () => {
    const store = makeStore();
    const a1 = await store.issueNewSession(ALICE);
    const a2 = await store.issueNewSession(ALICE);
    const b1 = await store.issueNewSession(BOB);

    await expect(store.revokeAllForUser(ALICE.userId)).resolves.toBe(2);
    expect((await redeem(store, a1.refreshToken)).ok).toBe(false);
    expect((await redeem(store, a2.refreshToken)).ok).toBe(false);
    expect((await redeem(store, b1.refreshToken, BOB)).ok).toBe(true);
  });
});
