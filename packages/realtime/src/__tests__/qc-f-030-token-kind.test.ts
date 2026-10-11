// ============================================================================
// QC-F-030 — JWT `kind` confusion regression tests (realtime verifier)
//
// QuantChat's SessionTokenIssuer signs access (1h) and refresh (30d) tokens
// with the SAME secret/issuer/audience; the payloads differ only in `kind`
// and `exp`. Before this fix, ConnectionAuth.verifyToken never looked at
// `kind`, so a refresh token opened WebSocket connections as a 30-day
// access token. Phase-1 policy matches the server-core REST gate:
// deny-non-access (present kind !== 'access' is rejected), kind-less
// ecosystem access tokens are still accepted.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SignJWT } from 'jose';
import { ConnectionAuth, AuthError } from '../auth';
import type { IncomingMessage } from 'node:http';

describe('QC-F-030 token-kind gate (ConnectionAuth)', () => {
  let auth: ConnectionAuth;
  const secret = 'test-secret-key-for-jwt-verification';

  beforeEach(() => {
    auth = new ConnectionAuth({
      jwtSecret: secret,
      jwtIssuer: 'quant-ecosystem',
      jwtAudience: 'quant-realtime',
    });
  });

  async function createToken(payload: Record<string, unknown>): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer('quant-ecosystem')
      .setAudience('quant-realtime')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));
  }

  it('rejects a refresh-kind token with AuthError 4001', async () => {
    const token = await createToken({ sub: 'user1', kind: 'refresh', app: 'quantchat' });
    const err = await auth.verifyToken(token).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe(4001);
  });

  it('rejects any other non-access kind with AuthError 4001', async () => {
    const token = await createToken({ sub: 'user1', kind: 'service' });
    await expect(auth.verifyToken(token)).rejects.toThrow(AuthError);
  });

  it('accepts an access-kind token', async () => {
    const token = await createToken({ sub: 'user1', kind: 'access', app: 'quantchat' });
    const payload = await auth.verifyToken(token);
    expect(payload.userId).toBe('user1');
  });

  it('accepts a kind-less token (phase-1 pin: ecosystem access tokens carry no kind)', async () => {
    const token = await createToken({ sub: 'user1', app: 'quantchat' });
    const payload = await auth.verifyToken(token);
    expect(payload.userId).toBe('user1');
  });

  it('rejects a refresh-kind token presented via authenticateUpgrade (query transport)', async () => {
    const token = await createToken({ sub: 'user1', kind: 'refresh' });
    const req = { url: `/ws?token=${token}`, headers: {} } as unknown as IncomingMessage;
    const err = await auth.authenticateUpgrade(req).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe(4001);
  });
});
