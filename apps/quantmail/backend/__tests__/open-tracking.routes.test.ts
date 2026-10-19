// ============================================================================
// QuantMail - Open-tracking beacon route tests (fix/qm-composer-open-tracking-2)
//
// GET /track/open/:token is public BY DESIGN (the recipient's mail client
// holds no QuantMail session). The security property under test: the route
// answers 200 + GIF for EVERY token — known, unknown, malformed — so token
// validity is never leaked, and a DB failure still serves the pixel (a
// missed count is honest; a broken image lies about the message).
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import openTrackingRoutes from '../routes/open-tracking';
import { OPEN_TRACKING_GIF } from '../services/open-tracking.service';

interface FakeEmailRow {
  id: string;
  openToken: string;
  openCount: number;
  firstOpenedAt: Date | null;
  lastOpenedAt: Date | null;
}

const KNOWN_TOKEN = 'a1'.repeat(24); // 48 hex chars

let app: FastifyInstance;
let rows: FakeEmailRow[];
let updateCalls: Array<unknown>;
let failNext: boolean;

function fakePrisma() {
  return {
    email: {
      findUnique: async (args: { where?: { openToken?: string } }) => {
        if (failNext) throw new Error('db down');
        const row = rows.find((r) => r.openToken === args.where?.openToken);
        return row ? { id: row.id, firstOpenedAt: row.firstOpenedAt } : null;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updateCalls.push(args);
        const row = rows.find((r) => r.id === args.where.id)!;
        const data = args.data;
        const inc = data['openCount'] as { increment?: number } | undefined;
        row.openCount += inc?.increment ?? 0;
        if (data['firstOpenedAt'] instanceof Date) row.firstOpenedAt = data['firstOpenedAt'];
        if (data['lastOpenedAt'] instanceof Date) row.lastOpenedAt = data['lastOpenedAt'];
        return row;
      },
    },
  };
}

beforeEach(async () => {
  rows = [
    {
      id: 'email-1',
      openToken: KNOWN_TOKEN,
      openCount: 0,
      firstOpenedAt: null,
      lastOpenedAt: null,
    },
  ];
  updateCalls = [];
  failNext = false;
  app = Fastify();
  app.decorate('prisma', fakePrisma() as never);
  await app.register(openTrackingRoutes, { prefix: '/track' });
});

afterEach(async () => {
  await app.close();
});

function expectPixelHeaders(res: { headers: Record<string, unknown>; statusCode: number }) {
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-type']).toBe('image/gif');
  expect(String(res.headers['cache-control'])).toContain('no-store');
  expect(Number(res.headers['content-length'])).toBe(OPEN_TRACKING_GIF.length);
}

describe('GET /track/open/:token', () => {
  it('counts a known token and serves the GIF', async () => {
    const res = await app.inject({ method: 'GET', url: `/track/open/${KNOWN_TOKEN}` });
    expectPixelHeaders(res);
    expect(res.body.startsWith('GIF89a')).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect(rows[0].openCount).toBe(1);
    expect(rows[0].firstOpenedAt).toBeInstanceOf(Date);
    expect(rows[0].lastOpenedAt).toBeInstanceOf(Date);
  });

  it('serves 200 + GIF for an unknown but well-formed token — validity never leaks', async () => {
    const res = await app.inject({ method: 'GET', url: `/track/open/${'b2'.repeat(24)}` });
    expectPixelHeaders(res);
    expect(res.body.startsWith('GIF89a')).toBe(true);
    expect(updateCalls).toHaveLength(0);
  });

  it('serves 200 + GIF for a malformed token without touching the DB', async () => {
    const res = await app.inject({ method: 'GET', url: '/track/open/not-a-token' });
    expectPixelHeaders(res);
    expect(updateCalls).toHaveLength(0);
  });

  it('still serves the pixel when the DB fails — a missed count, not a broken image', async () => {
    failNext = true;
    const res = await app.inject({ method: 'GET', url: `/track/open/${KNOWN_TOKEN}` });
    expectPixelHeaders(res);
    expect(res.body.startsWith('GIF89a')).toBe(true);
    expect(rows[0].openCount).toBe(0);
  });

  it('increments on every load (prefetch bursts read as one event via first/last times)', async () => {
    await app.inject({ method: 'GET', url: `/track/open/${KNOWN_TOKEN}` });
    await app.inject({ method: 'GET', url: `/track/open/${KNOWN_TOKEN}` });
    expect(rows[0].openCount).toBe(2);
    expect(updateCalls).toHaveLength(2);
    // firstOpenedAt stamped once — the second update carries no firstOpenedAt.
    const secondData = (updateCalls[1] as { data: Record<string, unknown> }).data;
    expect(secondData['firstOpenedAt']).toBeUndefined();
  });
});
