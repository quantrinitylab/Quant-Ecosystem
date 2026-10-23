// ============================================================================
// QC-F-579 — High-cost public auth routes get STRICT per-route buckets.
//
// Premise (rescoped 2026-10-23): the global @fastify/rate-limit 100/min/IP is
// coarse for three high-cost public routes:
//   POST /auth/sso/exchange — every hit fans out to QuantMail /oauth/userinfo
//     with an attacker-controlled bearer <redacted> (up to 8s upstream hold) → DoS
//     amplification + token-oracle probing.
//   POST /auth/otp/request  — every hit is a billable SMS; per-phone 60s
//     cooldown exists but there is NO per-IP bucket → phone rotation amplifies
//     SMS cost up to the 100/min ceiling.
//   POST /auth/login        — no per-route bucket; ~1,44,000 guesses/day/IP.
//
// Fix: route-level `config.rateLimit` (the websocket.ts `/chat` precedent):
//   exchange 15/min/IP (RATE_LIMIT_SSO_EXCHANGE_MAX), otp/request 10/min/IP
//   (RATE_LIMIT_OTP_REQUEST_MAX), login 20/min/IP (RATE_LIMIT_LOGIN_MAX).
// Handler bodies are UNCHANGED; the plugin check runs preHandler, so 429
// rejects cheaply before any upstream fan-out.
//
// Contract asserted here (per the build-prep brief §4.3): 429 status +
// Retry-After header. The plugin's exact 429 body text is intentionally NOT
// pinned — the test records its shape from the real plugin, not an invented
// string.
//
// Negative-control signature: on the pre-fix code every "*th request → 429"
// case FAILS (the requests sail through at 401/200 with no Retry-After);
// the below-limit "unaffected flow" cases PASS on both (they are PINs).
//
// These tests mount the REAL auth routes plugin on a bare Fastify instance
// (the established QC-F-062 / QC-F-501 route-test pattern) with the REAL
// @fastify/rate-limit plugin (in-memory store), the REAL OtpService (capturing
// sender) and the REAL SessionTokenIssuer. Two module-level stubs, same as the
// established suites: @quant/auth (only passwordService is exercised by
// /auth/login here) and @quant/server-core (only fetchWithTimeout is exercised
// by /auth/sso/exchange here — a counting stub so the test proves the upstream
// fetch never fires once the bucket bites).
// ============================================================================

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const fetchCalls: string[] = [];

vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async () => 'unused-in-579-tests',
  },
}));

vi.mock('@quant/server-core', () => ({
  fetchWithTimeout: async (url: string) => {
    fetchCalls.push(url);
    // QuantMail userinfo rejects the token on both paths → handler 401s.
    return { status: 404, ok: false, json: async () => null };
  },
  getTimeoutMs: () => 1000,
}));

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
// @fastify/rate-limit is packages/server-core's dependency — the same plugin
// instance the production wiring registers globally (server-core/src/app.ts).
// It is NOT a direct dep of apps/quantchat, so resolve it through server-core's
// own node_modules instead of adding a duplicate direct dependency for one
// test file.
const requireFromServerCore = createRequire(
  new URL('../../../../packages/server-core/package.json', import.meta.url),
);
const rateLimitPlugin = requireFromServerCore('@fastify/rate-limit') as Parameters<
  FastifyInstance['register']
>[0];
import authRoutes from '../routes/auth';
import { OtpService, type SmsSender } from '../lib/otp-service';
import { SessionTokenIssuer } from '../lib/session-tokens';

// --- Capturing SMS sender (real OtpService, no real SMS). --------------------
const sentMessages: { phone: string; body: string }[] = [];
const capturingSender: SmsSender = {
  async send(phone, body) {
    sentMessages.push({ phone, body });
    return { success: true };
  },
};

// --- Minimal fake prisma: enough for the three routes' pre-429 paths. --------
// login → user.findMany → [] → dummy verify → 401 (rate limit counts it);
// otp/request → user.findUnique/create/update + refreshToken.create;
// sso/exchange → 401 before any prisma touch (userinfo 404s).
const fakePrisma = {
  user: {
    findUnique: async () => null,
    findMany: async () => [],
    findFirst: async () => null,
    create: async ({ data }: { data: Record<string, unknown> }) => ({
      id: `user-${Date.now()}`,
      ...data,
    }),
    update: async ({ data }: { data: Record<string, unknown> }) => data,
  },
  refreshToken: {
    create: async ({ data }: { data: Record<string, unknown> }) => data,
  },
};

function makeTokens() {
  return new SessionTokenIssuer({
    jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
    jwtIssuer: 'quant-test',
    jwtAudience: 'quant-test-audience',
  });
}

// Global bucket far above every per-route bucket so ONLY the per-route
// buckets can bite in these tests.
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', fakePrisma as unknown as PrismaClient);
  app.decorate('otpService', new OtpService(capturingSender));
  app.decorate('sessionTokens', makeTokens());
  await app.register(rateLimitPlugin, { max: 1000, timeWindow: '1 minute' });
  await app.register(authRoutes, { prefix: '/auth' });
  await app.ready();
  return app;
}

async function post(
  app: FastifyInstance,
  url: string,
  payload: Record<string, unknown>,
) {
  return app.inject({ method: 'POST', url, payload });
}

const originalEnv = { ...process.env };

describe('QC-F-579 per-route rate limits (defaults)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Env knobs unset → defaults: exchange 15, otp/request 10, login 20.
    delete process.env['RATE_LIMIT_SSO_EXCHANGE_MAX'];
    delete process.env['RATE_LIMIT_OTP_REQUEST_MAX'];
    delete process.env['RATE_LIMIT_LOGIN_MAX'];
    app = await buildApp();
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
    await app.close();
  });

  it('exchange: 15 requests pass, the 16th is 429 with Retry-After', async () => {
    fetchCalls.length = 0;
    for (let i = 0; i < 15; i++) {
      const res = await post(app, '/auth/sso/exchange', { ssoToken: 'bogus-sso-token-0123456789' });
      expect(res.statusCode).not.toBe(429);
    }
    // Each allowed request fanned out to BOTH userinfo paths (404 + 404).
    expect(fetchCalls.length).toBe(30);

    const limited = await post(app, '/auth/sso/exchange', { ssoToken: 'bogus-sso-token-0123456789' });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    // The 16th request never reached the handler: no new upstream fetch.
    expect(fetchCalls.length).toBe(30);
  });

  it('otp/request: 10 requests (rotating phones) pass, the 11th is 429', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await post(app, '/auth/otp/request', {
        phoneNumber: `+1555013${String(100 + i)}`,
      });
      expect(res.statusCode).toBe(200);
    }
    const limited = await post(app, '/auth/otp/request', {
      phoneNumber: '+1555013110',
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('login: 20 requests pass, the 21st is 429 with Retry-After', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await post(app, '/auth/login', {
        identifier: 'nobody@example.com',
        password: 'wrong',
      });
      // Unknown user → 401, but NOT 429: the bucket has not bitten yet.
      expect(res.statusCode).toBe(401);
    }
    const limited = await post(app, '/auth/login', {
      identifier: 'nobody@example.com',
      password: 'wrong',
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('below-limit flow is unaffected: single hits on all three routes are not 429', async () => {
    const app2 = await buildApp();
    try {
      const ex = await post(app2, '/auth/sso/exchange', { ssoToken: 'bogus-sso-token-0123456789' });
      expect(ex.statusCode).toBe(401); // userinfo rejects; 401 ≠ 429
      const otp = await post(app2, '/auth/otp/request', {
        phoneNumber: '+1555013999',
      });
      expect(otp.statusCode).toBe(200);
      const login = await post(app2, '/auth/login', {
        identifier: 'nobody@example.com',
        password: 'wrong',
      });
      expect(login.statusCode).toBe(401);
    } finally {
      await app2.close();
    }
  });
});

describe('QC-F-579 env-knob override', () => {
  it('RATE_LIMIT_SSO_EXCHANGE_MAX=2 makes the 3rd exchange request 429', async () => {
    process.env['RATE_LIMIT_SSO_EXCHANGE_MAX'] = '2';
    const app = await buildApp();
    try {
      expect((await post(app, '/auth/sso/exchange', { ssoToken: 'x-token-0123456789' })).statusCode).not.toBe(429);
      expect((await post(app, '/auth/sso/exchange', { ssoToken: 'x-token-0123456789' })).statusCode).not.toBe(429);
      const limited = await post(app, '/auth/sso/exchange', { ssoToken: 'x-token-0123456789' });
      expect(limited.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
    } finally {
      await app.close();
      process.env = { ...originalEnv };
    }
  });

  it('RATE_LIMIT_OTP_REQUEST_MAX=1 makes the 2nd otp request 429', async () => {
    process.env['RATE_LIMIT_OTP_REQUEST_MAX'] = '1';
    const app = await buildApp();
    try {
      expect(
        (await post(app, '/auth/otp/request', { phoneNumber: '+1555013881' })).statusCode,
      ).toBe(200);
      const limited = await post(app, '/auth/otp/request', {
        phoneNumber: '+1555013882',
      });
      expect(limited.statusCode).toBe(429);
    } finally {
      await app.close();
      process.env = { ...originalEnv };
    }
  });

  it('RATE_LIMIT_LOGIN_MAX=1 makes the 2nd login request 429', async () => {
    process.env['RATE_LIMIT_LOGIN_MAX'] = '1';
    const app = await buildApp();
    try {
      expect(
        (await post(app, '/auth/login', { identifier: 'a@b.c', password: 'x' })).statusCode,
      ).toBe(401);
      const limited = await post(app, '/auth/login', {
        identifier: 'a@b.c',
        password: 'x',
      });
      expect(limited.statusCode).toBe(429);
    } finally {
      await app.close();
      process.env = { ...originalEnv };
    }
  });
});
