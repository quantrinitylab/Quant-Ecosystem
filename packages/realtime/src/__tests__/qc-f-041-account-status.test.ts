// ============================================================================
// QC-F-041 — account-status gate regression tests (realtime verifier)
//
// JWT verification is stateless: before this fix, a deleted user's token
// kept opening WebSocket connections until expiry (and, via QC-F-030 kind
// confusion, a 30-day refresh token could do the same). ConnectionAuth now
// accepts an OPT-IN accountStatus resolver (AuthConfig.accountStatus):
// after the JWT (and the QC-F-030 kind gate) verifies, a 'deleted' or
// 'suspended' verdict — or a failed lookup — rejects the upgrade with an
// AuthError (close 4001) carrying the machine-readable `authCode`
// (ACCOUNT_DELETED / ACCOUNT_SUSPENDED / UPSTREAM_UNAVAILABLE) so the
// server can surface it in the error frame instead of a generic
// "Authentication required". With no resolver configured, behaviour is
// exactly the pre-fix stateless verification (pinned below).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { SignJWT } from 'jose';
import { ConnectionAuth, AuthError } from '../auth';
import type { AccountStatusVerdict } from '../auth';

const secret = 'test-secret-key-for-jwt-verification';
const issuer = 'quant-ecosystem';
const audience = 'quant-realtime';

async function createToken(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

function gatedAuth(verdict: AccountStatusVerdict | 'throw') {
  return new ConnectionAuth({
    jwtSecret: secret,
    jwtIssuer: issuer,
    jwtAudience: audience,
    accountStatus: async () => {
      if (verdict === 'throw') throw new Error('database unreachable');
      return verdict;
    },
  });
}

describe('QC-F-041 account-status gate (ConnectionAuth)', () => {
  it('rejects a deleted account with AuthError 4001 + authCode ACCOUNT_DELETED', async () => {
    const auth = gatedAuth('deleted');
    const token = await createToken({ sub: 'user1', kind: 'access', app: 'quantchat' });
    const err = await auth.verifyToken(token).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe(4001);
    expect((err as AuthError).authCode).toBe('ACCOUNT_DELETED');
  });

  it('rejects a suspended account with AuthError 4001 + authCode ACCOUNT_SUSPENDED', async () => {
    const auth = gatedAuth('suspended');
    const token = await createToken({ sub: 'user1', kind: 'access', app: 'quantchat' });
    const err = await auth.verifyToken(token).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe(4001);
    expect((err as AuthError).authCode).toBe('ACCOUNT_SUSPENDED');
  });

  it('fails closed when the status lookup throws (authCode UPSTREAM_UNAVAILABLE)', async () => {
    const auth = gatedAuth('throw');
    const token = await createToken({ sub: 'user1', kind: 'access', app: 'quantchat' });
    const err = await auth.verifyToken(token).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe(4001);
    expect((err as AuthError).authCode).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('fails closed when the resolver reports unavailable', async () => {
    const auth = gatedAuth('unavailable');
    const token = await createToken({ sub: 'user1', kind: 'access', app: 'quantchat' });
    const err = await auth.verifyToken(token).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).authCode).toBe('UPSTREAM_UNAVAILABLE');
  });

  it('admits an ok account and returns its payload', async () => {
    const auth = gatedAuth('ok');
    const token = await createToken({ sub: 'user1', kind: 'access', app: 'quantchat' });
    const payload = await auth.verifyToken(token);
    expect(payload.userId).toBe('user1');
  });

  it('consults the resolver with the verified subject, not token-supplied extras', async () => {
    const seen: string[] = [];
    const auth = new ConnectionAuth({
      jwtSecret: secret,
      jwtIssuer: issuer,
      jwtAudience: audience,
      accountStatus: async (userId: string) => {
        seen.push(userId);
        return 'ok';
      },
    });
    const token = await createToken({ sub: 'real-user', kind: 'access', app: 'quantchat' });
    await auth.verifyToken(token);
    expect(seen).toEqual(['real-user']);
  });

  it('a refresh-kind token is rejected by the kind gate before the status gate (4001, no authCode)', async () => {
    const auth = gatedAuth('deleted');
    const token = await createToken({ sub: 'user1', kind: 'refresh', app: 'quantchat' });
    const err = await auth.verifyToken(token).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe(4001);
    expect((err as AuthError).authCode).toBeUndefined();
  });
});

describe('QC-F-041 gate is opt-in (ConnectionAuth without a resolver)', () => {
  it('verifies exactly as before the fix — no status consultation at all', async () => {
    const auth = new ConnectionAuth({ jwtSecret: secret, jwtIssuer: issuer, jwtAudience: audience });
    const token = await createToken({ sub: 'user1', kind: 'access', app: 'quantchat' });
    const payload = await auth.verifyToken(token);
    expect(payload.userId).toBe('user1');
  });
});
