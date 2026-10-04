// @vitest-environment node
// ============================================================================
// quantmail — Stage-6 engine seam tests (Task 14.5 / DoD-2 & DoD-4)
// ============================================================================
//
// Traverses the real integration seam for the Stage-6 engines wired into
// quantmail in Task 14.1 (encryption E2EE + federation), using Fastify
// `inject()` against the app's real `buildApp()`. Engines under test:
//
//   - @quant/encryption (14.1) — zero-knowledge E2EE relay decorated as
//     `fastify.e2ee`, SCOPED routes under `/e2ee` (ciphertext-only seam, Req 7.5).
//   - @quant/federation (14.1) — `fastify.federation`, SCOPED routes under
//     `/federation` (sensitive engine, Req 7.4).
//
// This harness exercises the REAL production app: it imports quantmail's
// `buildApp()` from `../app` and boots it with a test AppConfig. `buildApp()`
// registers `authRoutes`/`oauthRoutes` (which import deep `@quant/auth` subpaths)
// and every engine route — including decorating `e2ee` + registering `/e2ee` and
// decorating `federation` + registering `/federation` — so the seam traversed
// below (global auth hook -> route -> decorated engine) is byte-for-byte the
// production wiring; no replicated `createApp()` substrate.
//
// (Previously this file avoided importing `buildApp()` and replicated only the
// Task-14.1 encryption + federation wiring on `createApp()`, because buildApp's
// import graph could not resolve the deep `@quant/auth` subpaths
// (`services/token-service`, `lib/secrets`, `lib/prisma`, `crypto/secure-random`):
// `@quant/auth`'s package.json declared `"main": "src/index.ts"` with NO `exports`
// map, so those subpaths failed resolution. `@quant/auth` now declares
// `"type": "module"` and an `exports` map exposing those subpaths, so the real
// `buildApp()` boots and the work-around is no longer needed.)
//
// For each scoped mutating surface: unauth -> 401, valid JWT w/o scope -> 403,
// valid JWT w/ scope -> 2xx (engine reached). For reads: unauth -> 401, authed
// -> 2xx. JWTs are HS256-signed with node:crypto (no new dependency).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '@quant/server-core';
import { buildApp } from '../app';

// The /emails/changes route (fail-closed by design) requires SYNC_CURSOR_SECRET
// at registration. Provide a deterministic test secret so the real buildApp()
// boots in this suite.
process.env.SYNC_CURSOR_SECRET ??= 'test-secret-32-bytes-long-for-tests!';

// Test AppConfig matching the quantai seam harness (silent logger, test JWT
// secret/issuer/audience), with quantmail's backend PORT. Passed explicitly to
// `buildApp()` so the boot is deterministic and does not depend on process env.
const testConfig: AppConfig = {
  port: 3010,
  host: '0.0.0.0',
  logLevel: 'silent',
  corsOrigins: ['http://localhost:3000'],
  rateLimitMax: 1000,
  rateLimitWindow: '1 minute',
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
      email: 'mail@example.com',
      username: 'mailuser',
      role: 'user',
      scopes,
      app: 'quantmail',
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
// Harness sanity: confirm the real buildApp() boots and decorates the engines.
// ===========================================================================
describe('quantmail encryption+federation seam harness (real buildApp())', () => {
  it('decorates the Task-14.1 engines on the real buildApp() instance', () => {
    expect(app).toBeTruthy();
    expect(app.e2ee).toBeTruthy();
    expect(app.federation).toBeTruthy();
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

  it('valid JWT with `encryption:write` -> 201 and reaches the E2EE relay', async () => {
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
    expect(body.data.bundle).toMatchObject({ userId: 'user-123', deviceId: 'device-1' });
  });

  it('SECURITY (Req 7.5): a forbidden secret field (privateKey) is rejected 400 by the .strict() schema', async () => {
    const token = signToken(['encryption:write']);
    const res = await app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
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

  it('valid JWT with `encryption:read` -> 200 and reaches the relay', async () => {
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
// (federation:write) full matrix + read GET /federation/instances/:domain.
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
