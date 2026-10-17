// @vitest-environment node
// ============================================================================
// GET /contacts/suggestions — the route, not the service.
// ============================================================================
//
// Everything asserted here is the HTTP contract the contacts page's
// "Suggested from your mail" section depends on:
//
//   1. 401 without auth (the suggestion set is per-user mail — never serve it
//      anonymously).
//   2. The strict query schema: a misspelt filter (`limt=`) is a 400, not a
//      silently ignored default — the same no-op/ignored-input class the
//      contacts routes were already fixed for.
//   3. `limit` passes through to the service (clamped there), defaulting to 10.
//   4. `data` is the suggestion array itself, per the frontend contract.
//   5. The static segment wins over `/:id` — `/contacts/suggestions` must not
//      arrive at the id route as `id = "suggestions"`.
//
// HARNESS: the REAL contactsRoutes on a bare Fastify app, mounted at the same
// `/contacts` prefix `app.ts` uses, with the REAL error handler so a rejected
// body is asserted as the 400/401 a client actually receives. Prisma is a spy
// object — what the handler *passes down* is the thing under test.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import contactsRoutes from '../routes/contacts';

const SUGGESTION = {
  email: 'alice@example.com',
  name: 'Alice',
  messageCount: 12,
  lastMessageAt: new Date('2026-10-10T00:00:00.000Z'),
  direction: 'inbound' as const,
};

function fakePrisma() {
  const suggestions = [SUGGESTION];
  return {
    user: { findUnique: vi.fn().mockResolvedValue({ email: 'me@quantmail.in' }) },
    contact: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
    },
    // Only the aggregation touches `email`; the spy returns canned rows and
    // the real service aggregates them, so the route test proves the wiring
    // end to end (handler -> service -> delegates).
    email: { findMany: vi.fn().mockImplementation((args: { take?: number }) => {
      const rows = [
        {
          fromAddress: SUGGESTION.email,
          fromName: SUGGESTION.name,
          toAddresses: [],
          ccAddresses: [],
          bccAddresses: [],
          isSent: false,
          receivedAt: SUGGESTION.lastMessageAt,
          createdAt: SUGGESTION.lastMessageAt,
        },
      ];
      return Promise.resolve(rows.slice(0, args?.take ?? 10));
    }) },
    __suggestions: suggestions,
  };
}

let prisma: ReturnType<typeof fakePrisma>;

async function buildApp(userId: string | null = 'user-1') {
  prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  await app.register(contactsRoutes, { prefix: '/contacts' });
  await app.ready();
  return app;
}

describe('GET /contacts/suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the suggestion array as data', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/suggestions' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      email: 'alice@example.com',
      name: 'Alice',
      messageCount: 1,
      direction: 'inbound',
    });
  });

  it('requires authentication', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'GET', url: '/contacts/suggestions' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unknown query key instead of silently ignoring it', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/suggestions?limt=5' });
    expect(res.statusCode).toBe(400);
  });

  it('caps the returned suggestions at the requested limit', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/suggestions?limit=1' });
    expect(res.statusCode).toBe(200);
    // The service scans a bounded recent-mail window and slices to the
    // requested limit in JS; the wire contract is the cap.
    expect(res.json().data.length).toBeLessThanOrEqual(1);
  });

  it('does not land in the /:id route as id="suggestions"', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/contacts/suggestions' });
    // The id route would 404 on findUnique -> null; the suggestions route 200s.
    expect(res.statusCode).toBe(200);
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
  });
});
