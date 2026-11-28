// @vitest-environment node

// ============================================================================
// Documents share/invite contract tests — P0-4a (share link) & P0-4b (invite)
// ============================================================================
//
// Live-verified 2026-10-07 as kundan@quantmail.in in the /drive doc share dialog:
// - P0-4a: "+ Create Public Link" always toasted "Server did not return a share
//   link" — the server returned `data.token`, the frontend read `data.shareToken`.
// - P0-4b: "Add Collaborators" → Invite did nothing at all — the button never
//   submitted its form (shared Button defaults to type="button") and the
//   handler showed a fabricated success toast with zero network calls; there
//   was no server endpoint for doc invites at all.
//
// These tests lock the repaired contracts:
//  1. POST /documents/:id/share-link -> 201, data.token + data.shareUrl present.
//  2. POST /documents/:id/collaborators -> 201 with the collaborator on success,
//     404 USER_NOT_FOUND for an email with no Quant account, 403 for a
//     non-owner inviter, 400 for an invalid email, and role update on re-invite.

import { beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import documentRoutes, { resetDocumentShareLinks } from '../routes/documents';

interface DocRow {
  id: string;
  userId: string;
  title: string;
  isDeleted: boolean;
  metadata: Record<string, unknown>;
  collaborators: Array<{ id: string; docId: string; userId: string; role: string }>;
}

interface UserRow {
  id: string;
  email: string;
  deletedAt?: string | null;
}

function buildHarness() {
  const docs = new Map<string, DocRow>();
  const users = new Map<string, UserRow>();
  const collabs: Array<{ id: string; docId: string; userId: string; role: string }> = [];

  const doc: DocRow = {
    id: 'doc-1',
    userId: 'owner-1',
    title: 'Share Contract Doc',
    isDeleted: false,
    metadata: {},
    collaborators: [],
  };
  docs.set(doc.id, doc);

  const owner: UserRow = { id: 'owner-1', email: 'kundan@quantmail.in' };
  const teammate: UserRow = { id: 'mate-1', email: 'teammate@example.com' };
  const viewer: UserRow = { id: 'viewer-1', email: 'viewer@example.com' };
  users.set(owner.id, owner);
  users.set(teammate.id, teammate);
  users.set(viewer.id, viewer);

  const prismaMock = {
    document: {
      findUnique: async ({ where, include }: any) => {
        const row = docs.get(where.id);
        if (!row) return null;
        return {
          ...row,
          collaborators: include?.collaborators ? collabs.filter((c) => c.docId === row.id) : [],
        };
      },
      update: async ({ where, data }: any) => {
        const row = docs.get(where.id);
        if (!row) throw new Error('Not found');
        Object.assign(row, data);
        return { ...row };
      },
    },
    user: {
      // Mirrors the route's fail-closed resolution: findMany over the
      // normalized address, soft-deleted rows excluded (deletedAt: null).
      findMany: async ({ where, select }: any) => {
        const wanted = (where?.email?.equals as string | undefined)?.toLowerCase();
        const matches = Array.from(users.values()).filter((u) => {
          if (where?.deletedAt === null && (u as any).deletedAt != null) return false;
          return u.email.toLowerCase() === wanted;
        });
        if (!select) return matches;
        return matches.map((match) =>
          Object.fromEntries(
            Object.entries(select)
              .filter(([, v]) => v)
              .map(([k]) => [k, (match as any)[k]]),
          ),
        );
      },
    },
    documentCollaborator: {
      upsert: async ({ where, update, create }: any) => {
        const key = where.docId_userId;
        const existing = collabs.find(
          (c) => c.docId === key.docId && c.userId === key.userId,
        );
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = {
          id: `dc-${collabs.length + 1}`,
          docId: create.docId,
          userId: create.userId,
          role: create.role,
        };
        collabs.push(row);
        return { ...row };
      },
    },
  };

  return { docs, users, collabs, prisma: prismaMock };
}

async function buildApp(prismaMock: any, userId: string) {
  const app = Fastify();
  app.decorate('prisma', prismaMock);
  app.addHook('onRequest', async (request) => {
    (request as any).auth = { userId };
  });
  app.setErrorHandler((error: any, request, reply) => {
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

describe('P0-4a — public share link contract', () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    harness = buildHarness();
    resetDocumentShareLinks();
  });

  it('POST /documents/:id/share-link returns 201 with data.token and data.shareUrl', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/share-link',
      payload: { role: 'view', expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.success).toBe(true);
    // The field the dialog reads — the P0-4a regression was the frontend
    // reading `data.shareToken` while the server only returned `data.token`.
    expect(typeof json.data.token).toBe('string');
    expect(json.data.token.length).toBeGreaterThan(0);
    expect(json.data.shareUrl).toBe(`/drive/share/${json.data.token}`);
    expect(json.data.role).toBe('view');
    await app.close();
  });

  it('rejects share-link creation for a non-owner without admin rights (403)', async () => {
    const app = await buildApp(harness.prisma, 'viewer-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/share-link',
      payload: { role: 'view' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('P0-4b — collaborator invite contract', () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    harness = buildHarness();
  });

  it('POST /documents/:id/collaborators adds the collaborator and returns 201', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'teammate@example.com', role: 'editor' },
    });
    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.data.email).toBe('teammate@example.com');
    expect(json.data.role).toBe('editor');
    expect(json.data.docId).toBe('doc-1');
    expect(harness.collabs).toHaveLength(1);
    await app.close();
  });

  it('returns 404 USER_NOT_FOUND for an email with no Quant account (not a fake success)', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'ghost@example.com', role: 'editor' },
    });
    expect(res.statusCode).toBe(404);
    const json = res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('USER_NOT_FOUND');
    expect(harness.collabs).toHaveLength(0);
    await app.close();
  });

  it('returns 400 for an invalid email address', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'not-an-email', role: 'viewer' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 403 when a non-owner/non-admin tries to invite', async () => {
    const app = await buildApp(harness.prisma, 'viewer-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'teammate@example.com', role: 'editor' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('re-inviting the same user updates their role instead of failing', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'teammate@example.com', role: 'viewer' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'teammate@example.com', role: 'admin' },
    });
    const json = res.json();
    expect(res.statusCode).toBe(201);
    expect(json.data.role).toBe('admin');
    expect(harness.collabs).toHaveLength(1);
    await app.close();
  });

  it('rejects inviting yourself', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'kundan@quantmail.in', role: 'editor' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 404 for a missing document', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/no-such-doc/collaborators',
      payload: { email: 'teammate@example.com', role: 'editor' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('case-collision fail-closed — doc collaborator invite', () => {
  let harness: ReturnType<typeof buildHarness>;

  beforeEach(() => {
    harness = buildHarness();
    // Legacy case-colliding twins: distinct users under the case-sensitive
    // unique index, same address modulo case.
    harness.users.set('twin-lower', { id: 'twin-lower', email: 'person@example.com' });
    harness.users.set('twin-upper', { id: 'twin-upper', email: 'Person@example.com' });
    // A soft-deleted twin next to a live account: the deleted row is not a
    // subject, so this address must still resolve to exactly one user.
    harness.users.set('ghost-deleted', {
      id: 'ghost-deleted',
      email: 'DELETED@example.com',
      deletedAt: '2026-01-01T00:00:00.000Z',
    });
    harness.users.set('alive-1', { id: 'alive-1', email: 'deleted@example.com' });
  });

  it('returns 409 RECIPIENT_AMBIGUOUS for case-colliding twins and writes nothing', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'person@example.com', role: 'editor' },
    });
    expect(res.statusCode).toBe(409);
    const json = res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('RECIPIENT_AMBIGUOUS');
    // Zero writes: neither twin received access.
    expect(harness.collabs).toHaveLength(0);
    await app.close();
  });

  it('still 409 when the invite spells the address in the other twin\'s case', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'Person@example.com', role: 'viewer' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('RECIPIENT_AMBIGUOUS');
    expect(harness.collabs).toHaveLength(0);
    await app.close();
  });

  it('ignores a soft-deleted twin and invites the live account', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'deleted@example.com', role: 'editor' },
    });
    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.data.email).toBe('deleted@example.com');
    expect(harness.collabs).toHaveLength(1);
    expect(harness.collabs[0].userId).toBe('alive-1');
    await app.close();
  });

  it('resolves a single account case-insensitively (mixed-case invite)', async () => {
    const app = await buildApp(harness.prisma, 'owner-1');
    const res = await app.inject({
      method: 'POST',
      url: '/documents/doc-1/collaborators',
      payload: { email: 'Teammate@Example.com', role: 'editor' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.email).toBe('teammate@example.com');
    expect(harness.collabs).toHaveLength(1);
    expect(harness.collabs[0].userId).toBe('mate-1');
    await app.close();
  });
});
