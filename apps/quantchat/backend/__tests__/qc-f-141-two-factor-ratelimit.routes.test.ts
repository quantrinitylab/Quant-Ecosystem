// ============================================================================
// QC-F-141 — /auth/2fa/verify per-route rate limit (§7-14, §4.6)
// ============================================================================
//
// QuantChat's createApp registers @fastify/rate-limit globally (100/min);
// the verify route opts into a stricter 10/min per-route bucket via its
// route `config`. This file proves, with the REAL plugin, that the route-
// level override is honoured on this stack — the brief's §4.6 condition for
// shipping the limit as more than a claim. Kept in its own file so the
// 10/min budget is never contaminated by the main suite's verify calls.
//
// 11 schema-valid but failing attempts from one IP: the first 10 pass the
// limiter (each answers 401 CHALLENGE_EXPIRED), the 11th is 429.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The route module imports @quant/auth (real one drags @quant/database into
// the test process — see the QC-F-141 main suite's harness note). The burst
// bodies never reach totpService (the challenge dies first), so a stub is
// faithful here.
vi.mock('@quant/auth', () => ({
  passwordService: {
    verify: async () => false,
    hash: async (password: string) => `stub:${password}`,
  },
  totpService: {
    generateSecret: () => 'STUB',
    verify: () => false,
  },
}));

// The plugin lives in server-core's own node_modules (see createApp in
// packages/server-core/src/app.ts) — pnpm layout, not hoisted. Resolve it
// from server-core's directory so this test works from any worktree.
const thisDir = path.dirname(fileURLToPath(import.meta.url));
const serverCoreAnchor = path.join(
  path.resolve(thisDir, '..', '..', '..', 'packages', 'server-core'),
  'src',
  'app.ts',
);
const requireFromServerCore = createRequire(serverCoreAnchor);
const rateLimitPlugin = requireFromServerCore('@fastify/rate-limit') as (
  instance: unknown,
  opts: unknown,
) => Promise<void>;

import authRoutes from '../routes/auth';
import type { OtpService } from '../lib/otp-service';
import type { SessionTokenIssuer } from '../lib/session-tokens';

const TEST_APP_CONFIG = {
  jwtSecret: 'qc-f-141-test-challenge-secret-long-enough',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
};

describe('QC-F-141 /auth/2fa/verify per-route rate limit (10/min)', () => {
  it('the 11th attempt in a minute is 429', async () => {
    const app = Fastify({ logger: false });
    // Global budget far above the route bucket so only the route config can trip.
    await app.register(rateLimitPlugin, { max: 1000, timeWindow: '1 minute' });
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'prisma',
      {} as PrismaClient,
    );
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'otpService',
      {} as OtpService,
    );
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'sessionTokens',
      {} as SessionTokenIssuer,
    );
    (app as unknown as { decorate: (key: string, value: unknown) => void }).decorate(
      'appConfig',
      TEST_APP_CONFIG,
    );
    await app.register(authRoutes, { prefix: '/auth' });
    await app.ready();

    const statuses: number[] = [];
    try {
      for (let i = 0; i < 11; i += 1) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/2fa/verify',
          // Schema-valid (min lengths) but a challenge this server never signed.
          payload: { challenge: 'x'.repeat(20), code: '123456' },
        });
        statuses.push(res.statusCode);
      }
    } finally {
      await app.close();
    }
    expect(statuses.slice(0, 10)).toEqual(new Array(10).fill(401));
    expect(statuses[10]).toBe(429);
  });
});
