// @vitest-environment node
// ============================================================================
// quantchat — Stage-6 engine seam tests (Task 14.5 / DoD-2 & DoD-4)
// ============================================================================
//
// Traverses the real integration seam for the Stage-6 engines wired into
// quantchat in Tasks 14.1 (encryption + federation) and 14.2 (ar-lenses), using
// Fastify `inject()` against the app's REAL `buildApp()`
// (apps/quantchat/backend/app.ts). No network, no mocked server-core: the global
// `onRequest` auth hook from `createApp()` and the decorated engines are
// exercised exactly as in production. Engines under test:
//
//   - @quant/encryption (14.1) — zero-knowledge E2EE relay decorated as
//     `fastify.e2ee`, SCOPED routes under `/e2ee` (ciphertext-only seam, Req 7.5).
//   - @quant/federation (14.1) — `fastify.federation`, SCOPED routes under
//     `/federation` (sensitive engine, Req 7.4).
//   - @quant/ar-lenses  (14.2) — `fastify.arLenses`, routes under `/ar-lenses`.
//
// Unlike the quantai harness (whose buildApp() has phantom-package import
// breakage forcing a createApp() replication), quantchat's buildApp() loads
// CLEANLY — every `@quant/*` it imports (encryption, federation, ar-lenses,
// api-client, server-core, …) is a real workspace package declared in
// apps/quantchat/package.json — so this test builds the app via its OWN
// buildApp() and does NOT replicate the wiring. Confirmed by the `buildApp
// loads` assertion below (mirrors the quantneon/quantube templates).
//
// For each scoped mutating surface we assert the states the design's Testing
// Strategy requires (DoD-2 / Requirement 5.2 & 5.6 / Property P7):
//   - unauthenticated (no Bearer)             -> 401 UNAUTHORIZED
//   - valid JWT WITHOUT the required scope     -> 403 FORBIDDEN
//   - valid JWT WITH the required scope         -> 2xx and the engine is reached
// For read routes (DoD-2): unauth -> 401, authed -> 2xx.
//
// PUBLIC_PATHS prefix-collision check: createApp()'s allowlist is
//   ['/health','/healthz','/ready','/readyz','/live','/livez','/metrics']
// matched as `path === p || path.startsWith(p + '/')`. quantchat's seam prefixes
// are `/e2ee`, `/federation`, `/ar-lenses` — NONE collide with an allowlist
// entry. To PROVE no silent auth-bypass exists, every read surface below is
// asserted to 401 when unauthenticated.
//
// JWTs are HS256-signed with Node's built-in `crypto` (matching the quantneon /
// quantube seam-test templates), so this adds no new dependency.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3002,
  host: '0.0.0.0',
  logLevel: 'silent',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let jtiCounter = 0;
// Hand-roll an HS256 JWT the auth plugin's
// `jose.jwtVerify(token, secret, { issuer, audience })` accepts.
function signToken(scopes: string[], sub = 'user-123'): string {
  jtiCounter += 1;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: testConfig.jwtIssuer,
      aud: testConfig.jwtAudience,
      sub,
      jti: `seam-${jtiCounter}`,
      iat: now,
      exp: now + 3600,
      email: 'chat@example.com',
      username: 'chatuser',
      role: 'user',
      scopes,
      app: 'quantchat',
    }),
  );
  const signature = base64url(
    createHmac('sha256', testConfig.jwtSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

// Valid wire shapes (public / ciphertext only — Req 7.5).
const publicBundle = {
  identityKey: 'ik-pub',
  signedPreKey: 'spk-pub',
  signedPreKeySignature: 'spk-sig',
  oneTimePreKey: 'otp-pub',
  registrationId: 1,
};
const ciphertextEnvelope = {
  ciphertext: 'AAAACIPHERTEXT',
  nonce: 'NONCE123',
  tag: 'TAG123',
  algorithm: 'aes-256-gcm' as const,
  senderFingerprint: 'fp-sender',
  recipientFingerprint: 'fp-recipient',
  timestamp: new Date().toISOString(),
  version: 1,
};

// ===========================================================================
// Harness sanity: confirm the app builds via its OWN buildApp() and the
// Stage-6 engines are decorated.
// ===========================================================================
describe('quantchat buildApp() seam harness', () => {
  it('buildApp loads and decorates the Stage-6 engines', () => {
    expect(app).toBeTruthy();
    expect(app.e2ee).toBeTruthy();
    expect(app.federation).toBeTruthy();
    expect(app.arLenses).toBeTruthy();
  });
});

// ===========================================================================
// encryption (E2EE) — POST /e2ee/keys (encryption:write) full matrix + the
// .strict() ciphertext-only SECURITY test (Req 7.5).
// ===========================================================================
describe('seam: encryption POST /e2ee/keys (mutating, encryption:write)', () => {
  const url = '/e2ee/keys';
  const payload = { deviceId: 'device-1', bundle: publicBundle };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `encryption:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['encryption:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `encryption:write` -> 201 and reaches the E2EE relay (public bundle registered)', async () => {
    const token = signToken(['encryption:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the relay stamped + returned the published public bundle.
    expect(body.data.bundle).toMatchObject({ userId: 'user-123', deviceId: 'device-1' });
  });

  it('SECURITY (Req 7.5): a forbidden secret field (privateKey) is rejected 400 by the .strict() schema', async () => {
    const token = signToken(['encryption:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      // Attempt to smuggle a private key past the ciphertext-only boundary.
      payload: { deviceId: 'device-1', bundle: publicBundle, privateKey: 'LEAKED-SECRET' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });
});

describe('seam: encryption GET /e2ee/keys/:userId (read, encryption:read)', () => {
  const url = '/e2ee/keys/peer-123';

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `encryption:read` -> 403 FORBIDDEN', async () => {
    const token = signToken(['profile:read']);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `encryption:read` -> 200 and reaches the relay (public bundles list)', async () => {
    const token = signToken(['encryption:read']);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true, data: { userId: 'peer-123' } });
    expect(Array.isArray(body.data.bundles)).toBe(true);
  });
});

describe('seam: encryption POST /e2ee/messages (mutating, encryption:write) + GET inbox (read)', () => {
  const url = '/e2ee/messages';
  const payload = { recipientId: 'peer-456', payload: ciphertextEnvelope };

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `encryption:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['encryption:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `encryption:write` -> 202 and reaches the relay (ciphertext relayed)', async () => {
    const token = signToken(['encryption:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    // Engine reached: the relay returned an envelope addressed sender->recipient.
    expect(body.data.envelope).toMatchObject({ senderId: 'user-123', recipientId: 'peer-456' });
  });

  it('GET /e2ee/messages unauthenticated -> 401; authed (encryption:read) -> 200 inbox drained', async () => {
    const unauth = await app.inject({ method: 'GET', url });
    expect(unauth.statusCode).toBe(401);

    const token = signToken(['encryption:read']);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(Array.isArray(body.data.envelopes)).toBe(true);
    expect(typeof body.data.count).toBe('number');
  });
});

// ===========================================================================
// federation (Task 14.1) — SCOPED routes. POST /federation/instances/block
// (federation:write) full matrix + read GET /federation/instances/:domain
// (federation:read).
// ===========================================================================
describe('seam: federation POST /federation/instances/block (mutating, federation:write)', () => {
  const url = '/federation/instances/block';

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload: { domain: 'spam.example' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `federation:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['federation:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { domain: 'spam.example' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `federation:write` -> 201 and reaches the FederationModeration engine', async () => {
    const token = signToken(['federation:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { domain: 'spam.example' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      success: true,
      data: { domain: 'spam.example', blocked: true },
    });
  });
});

describe('seam: federation GET /federation/instances/:domain (read, federation:read)', () => {
  const url = '/federation/instances/peer.example';

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `federation:read` -> 403 FORBIDDEN', async () => {
    const token = signToken(['profile:read']);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `federation:read` -> 200 and reaches the moderation engine', async () => {
    const token = signToken(['federation:read']);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true, data: { domain: 'peer.example' } });
    expect(body.data).toHaveProperty('blocked');
    expect(body.data).toHaveProperty('allowed');
  });
});

// ===========================================================================
// ar-lenses (Task 14.2) — POST /ar-lenses/lenses/generate (ar-lenses:write)
// full matrix + GET /ar-lenses/capabilities read surface.
// ===========================================================================
describe('seam: ar-lenses POST /ar-lenses/lenses/generate (mutating, ar-lenses:write)', () => {
  const url = '/ar-lenses/lenses/generate';

  it('unauthenticated request -> 401 UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'POST', url, payload: { prompt: 'sparkle mask' } });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('valid JWT lacking `ar-lenses:write` -> 403 FORBIDDEN', async () => {
    const token = signToken(['profile:read']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { prompt: 'sparkle mask' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
  });

  it('valid JWT with `ar-lenses:write` -> 201 and reaches the PromptToLens engine', async () => {
    const token = signToken(['ar-lenses:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: { prompt: 'sparkle mask', style: 'glam', intensity: 0.6 },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(body.data).toBeTruthy();
  });
});

describe('seam: ar-lenses GET /ar-lenses/capabilities (read)', () => {
  const url = '/ar-lenses/capabilities?target=quant_chat';

  it('unauthenticated request -> 401 UNAUTHORIZED (no PUBLIC_PATHS bypass)', async () => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('authenticated request -> 200 and reaches the CrossAppDistributor engine', async () => {
    const token = signToken([]);
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ success: true });
    expect(body.data).toHaveProperty('capabilities');
  });
});
