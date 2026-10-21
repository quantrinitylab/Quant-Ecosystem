// @vitest-environment node

// ============================================================================
// Documents POST canonical-ID contract — doc-editor 404 intent corrective.
// The client sends { id: docId } on create (new-doc flow and the PATCH → 404
// → POST fallback); the backend must honor it so the created row lands at
// the canonical id instead of silently minting a different one (which used
// to orphan the /drive/doc/[docId] URL and duplicate the document on every
// subsequent save).
//
// Locked contracts:
// 1. POST with a fresh id → 201, data.id === the requested id.
// 2. POST with the id of the caller's own soft-deleted doc → 200 restore
//    (isDeleted false, fields updated) — explicit recreation, never silent.
// 3. POST with the id of another user's live doc → 409 DOCUMENT_ID_CONFLICT.
// 4. POST with the id of another user's deleted doc → 409 (never restored).
// 5. POST without id → 201 with a server-generated id (legacy behavior).
// 6. Concurrent-create race (P2002) → 409, never a raw 500.
// ============================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import documentRoutes from '../routes/documents';

interface DocRow {
  id: string;
  userId: string;
  title: string;
  content: string;
  isDeleted: boolean;
  isPublic: boolean;
  metadata: Record<string, unknown>;
}

function buildHarness() {
  const docs = new Map<string, DocRow>();
  // Ids for which create() throws P2002 even though findUnique() missed —
  // simulates the concurrent-create race window.
  const raceIds = new Set<string>();
  let seq = 0;

  const prismaMock = {
    document: {
      findUnique: async ({ where }: any) => docs.get(where.id) ?? null,
      findFirst: async ({ where }: any) => {
        for (const row of docs.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.userId && row.userId !== where.userId) continue;
          if (where.isDeleted === false && row.isDeleted) continue;
          return { ...row };
        }
        return null;
      },
      create: async ({ data }: any) => {
        if ((data.id && docs.has(data.id)) || (data.id && raceIds.has(data.id))) {
          // Simulate the Prisma unique-constraint violation.
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const row: DocRow = {
          id: data.id ?? `cuid-generated-${++seq}`,
          userId: data.userId,
          title: data.title,
          content: data.content ?? '',
          isDeleted: false,
          isPublic: data.isPublic ?? false,
          metadata: data.metadata ?? {},
        };
        docs.set(row.id, row);
        return { ...row, versions: [], collaborators: [] };
      },
      update: async ({ where, data }: any) => {
        const row = docs.get(where.id);
        if (!row) throw new Error('Not found');
        Object.assign(row, data);
        return { ...row, versions: [], collaborators: [] };
      },
    },
  };

  return { docs, raceIds, prisma: prismaMock };
}

async function buildApp(prismaMock: any, userId: string) {
  const app = Fastify();
  app.decorate('prisma', prismaMock);
  app.addHook('onRequest', async (request) => {
    (request as any).auth = { userId };
  });
  app.setErrorHandler((error: any, _request, reply) => {
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      success: false,
      error: { code: error.code || 'INTERNAL_ERROR', message: error.message },
    });
  });
  await app.register(documentRoutes, { prefix: '/documents' });
  await app.ready();
  return app;
}

describe('POST /documents canonical-ID contract', () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    harness = buildHarness();
  });

  it('creates at the requested canonical id', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents',
      payload: { id: 'doc_canonical1', title: 'Canonical' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('doc_canonical1');
    expect(harness.docs.get('doc_canonical1')?.title).toBe('Canonical');
  });

  it('restores the caller\'s own soft-deleted doc at the same id', async () => {
    harness.docs.set('doc_deleted1', {
      id: 'doc_deleted1',
      userId: 'owner-1',
      title: 'Old title',
      content: 'old',
      isDeleted: true,
      isPublic: false,
      metadata: {},
    });
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents',
      payload: { id: 'doc_deleted1', title: 'Recreated' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('doc_deleted1');
    expect(body.data.isDeleted).toBe(false);
    expect(body.data.title).toBe('Recreated');
    // Still exactly one row — no duplicate.
    expect(harness.docs.size).toBe(1);
  });

  it('409s when the id belongs to another user\'s live doc', async () => {
    harness.docs.set('doc_taken1', {
      id: 'doc_taken1',
      userId: 'owner-9',
      title: 'Theirs',
      content: '',
      isDeleted: false,
      isPublic: false,
      metadata: {},
    });
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents',
      payload: { id: 'doc_taken1', title: 'Mine now' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DOCUMENT_ID_CONFLICT');
    // Their doc is untouched.
    expect(harness.docs.get('doc_taken1')?.title).toBe('Theirs');
  });

  it('409s when the id is another user\'s deleted doc (never restores it)', async () => {
    harness.docs.set('doc_taken2', {
      id: 'doc_taken2',
      userId: 'owner-9',
      title: 'Theirs deleted',
      content: '',
      isDeleted: true,
      isPublic: false,
      metadata: {},
    });
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents',
      payload: { id: 'doc_taken2', title: 'Mine now' },
    });
    expect(res.statusCode).toBe(409);
    expect(harness.docs.get('doc_taken2')?.isDeleted).toBe(true);
  });

  it('still mints a server id when no id is sent (legacy behavior)', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents',
      payload: { title: 'No id' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.id).toMatch(/^cuid-generated-/);
  });

  it('maps a concurrent-create P2002 race to 409, never a raw 500', async () => {
    // findUnique misses (empty map) but create hits the unique constraint —
    // the check-then-create race window. The route must map it to 409.
    harness.raceIds.add('doc_race2');
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents',
      payload: { id: 'doc_race2', title: 'Racer loser' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DOCUMENT_ID_CONFLICT');
  });
});
