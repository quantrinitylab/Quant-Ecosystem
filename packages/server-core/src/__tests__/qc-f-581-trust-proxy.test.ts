/**
 * QC-F-581 — rate-limit key must be the REAL client IP, not the proxy IP.
 *
 * Regression suite (P1): `trustProxy` was never set on the Fastify instance
 * and @fastify/rate-limit had no keyGenerator override, so `request.ip` was
 * always the socket peer — the nginx ingress / Next.js API-proxy pod IP.
 * Consequence: the global 100/min bucket (and the /ws/chat 20/min per-route
 * bucket) was SHARED across the entire user base, and per-IP abuse control
 * was void — the precondition fix for QC-F-579's per-route per-IP buckets.
 *
 * Negative control: on unfixed code (no trustProxy) T1/T3/T4 FAIL because
 * request.ip stays the socket address; T2 passes on both (documents that an
 * untrusted socket peer's X-Forwarded-For is ignored — no spoof surface).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app';
import type { AppConfig } from '../types';

const PROXY_IP = '127.0.0.1'; // loopback = default trusted proxy
const CLIENT_A = '203.0.113.7';
const CLIENT_B = '203.0.113.8';
const SPOOFER = '198.51.100.9'; // direct (untrusted) socket peer

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3000,
    host: '0.0.0.0',
    logLevel: 'silent',
    corsOrigins: ['http://localhost:3000'],
    rateLimitMax: 3,
    rateLimitWindow: '1 minute',
    jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
    jwtIssuer: 'quant-test',
    jwtAudience: 'quant-test-audience',
    env: 'test',
    publicPaths: ['/qc-f-581-whoami'],
    ...overrides,
  };
}

describe('QC-F-581 trustProxy client-IP resolution', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    app = await createApp(baseConfig({ trustedProxies: [PROXY_IP, '::1'] }));
    app.get('/qc-f-581-whoami', async (request) => ({ ip: request.ip }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('T1: X-Forwarded-For from a trusted proxy resolves request.ip to the client', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/qc-f-581-whoami',
      remoteAddress: PROXY_IP,
      headers: { 'x-forwarded-for': CLIENT_A },
    });
    expect(res.statusCode).toBe(200);
    // UNFIXED: trustProxy unset -> ip === '127.0.0.1' -> FAILS here.
    expect(res.json().ip).toBe(CLIENT_A);
  });

  it('T2: X-Forwarded-For from an UNTRUSTED socket peer is ignored (no spoof)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/qc-f-581-whoami',
      remoteAddress: SPOOFER,
      headers: { 'x-forwarded-for': CLIENT_A },
    });
    expect(res.statusCode).toBe(200);
    // A direct client must never pick its own rate-limit key via XFF.
    expect(res.json().ip).toBe(SPOOFER);
  });

  it('T3: rate-limit buckets key on the resolved client IP, not the proxy IP', async () => {
    // Dedicated app instance: the global in-memory rate-limit store is shared
    // per app, so T1/T2's hits must not consume this test's bucket.
    const rlApp = await createApp(baseConfig({ trustedProxies: [PROXY_IP, '::1'] }));
    rlApp.get('/qc-f-581-whoami', async (request) => ({ ip: request.ip }));
    await rlApp.ready();
    try {
      const hit = (client: string) =>
        rlApp.inject({
          method: 'GET',
          url: '/qc-f-581-whoami',
          remoteAddress: PROXY_IP,
          headers: { 'x-forwarded-for': client },
        });

      // Client A exhausts its own bucket (max 3).
      for (let i = 0; i < 3; i++) {
        expect((await hit(CLIENT_A)).statusCode).toBe(200);
      }
      expect((await hit(CLIENT_A)).statusCode).toBe(429);

      // UNFIXED: every client shares the 127.0.0.1 bucket -> this is 429 -> FAILS.
      const b = await hit(CLIENT_B);
      expect(b.statusCode).toBe(200);
      expect(b.json().ip).toBe(CLIENT_B);
    } finally {
      await rlApp.close();
    }
  });
});

describe('QC-F-581 default trusted proxies', () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    // No trustedProxies in config: default must be loopback-only (single-node
    // behaviour unchanged), NOT a blind trust-everything.
    app = await createApp(baseConfig());
    app.get('/qc-f-581-whoami', async (request) => ({ ip: request.ip }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('T4: default config still honours XFF from loopback (NC)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/qc-f-581-whoami',
      remoteAddress: PROXY_IP,
      headers: { 'x-forwarded-for': CLIENT_A },
    });
    expect(res.statusCode).toBe(200);
    // UNFIXED: trustProxy unset -> ip === '127.0.0.1' -> FAILS here.
    expect(res.json().ip).toBe(CLIENT_A);
  });

  it('T5: default config ignores XFF from a non-loopback socket peer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/qc-f-581-whoami',
      remoteAddress: SPOOFER,
      headers: { 'x-forwarded-for': CLIENT_A },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ip).toBe(SPOOFER);
  });
});
