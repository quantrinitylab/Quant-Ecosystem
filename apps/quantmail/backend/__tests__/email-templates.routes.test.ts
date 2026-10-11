// @vitest-environment node
// ============================================================================
// fix/qm-templates-unreachable — the /email-templates backend CRUD the
// EmailTemplates picker calls was REGISTERED in app.ts but MISSING from the
// Next proxy allow-list (backend/lib/routes-config.ts), so every picker
// request died with a 404 from the proxy before reaching the backend.
// The allow-list rows were added as part of this fix; these tests pin the
// backend route contract itself on a bare Fastify with the REAL route, the
// REAL error handler, and a mocked prisma delegate — the same harness shape
// as ai-chat.routes.test.ts.
//
// What goes red if the contract breaks:
//   1. Unauthenticated requests are rejected (401), never leaking templates.
//   2. A template owned by another user is a 403, not a 200 (tenant wall).
//   3. Invalid bodies are 400, not silent stores.
//   4. `/:id/render` substitutes {{vars}} with HTML-escaped values, so
//      variable content cannot inject markup into the composed email.
//   5. CRUD round-trips through the exact paths the picker calls
//      (/email-templates, /email-templates/:id).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import emailTemplatesRoutes from '../routes/email-templates';

function createMockPrisma() {
  return {
    emailTemplate: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    userId: 'user-1',
    name: 'Welcome',
    subject: 'Hello {{name}}',
    bodyHtml: '<p>Hi {{name}}, welcome aboard</p>',
    shortcut: ':welcome',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

async function buildApp(
  prisma: ReturnType<typeof createMockPrisma>,
  userId: string | null = 'user-1',
) {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.addHook('onRequest', async (request) => {
    if (userId) {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
    }
  });
  app.decorate('prisma', prisma as unknown as never);
  await app.register(emailTemplatesRoutes, { prefix: '/email-templates' });
  await app.ready();
  return app;
}

describe('email-templates routes', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    app = await buildApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('auth gate', () => {
    it('rejects GET / without a user (401)', async () => {
      const noAuth = await buildApp(prisma, null);
      try {
        const res = await noAuth.inject({ method: 'GET', url: '/email-templates' });
        expect(res.statusCode).toBe(401);
      } finally {
        await noAuth.close();
      }
    });

    it('rejects POST / without a user (401)', async () => {
      const noAuth = await buildApp(prisma, null);
      try {
        const res = await noAuth.inject({
          method: 'POST',
          url: '/email-templates',
          payload: { name: 'x', subject: 'y', bodyHtml: 'z' },
        });
        expect(res.statusCode).toBe(401);
      } finally {
        await noAuth.close();
      }
    });
  });

  describe('GET /', () => {
    it('lists the caller’s templates', async () => {
      prisma.emailTemplate.findMany.mockResolvedValue([makeTemplate()]);
      const res = await app.inject({ method: 'GET', url: '/email-templates' });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      expect(payload.success).toBe(true);
      expect(payload.data).toHaveLength(1);
      expect(payload.data[0].name).toBe('Welcome');
      expect(prisma.emailTemplate.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('POST /', () => {
    it('creates a template and returns 201', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(null);
      prisma.emailTemplate.create.mockResolvedValue(makeTemplate());
      const res = await app.inject({
        method: 'POST',
        url: '/email-templates',
        payload: { name: 'Welcome', subject: 'Hello', bodyHtml: '<p>Hi</p>', shortcut: 'welcome' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().success).toBe(true);
      expect(prisma.emailTemplate.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'Welcome',
          subject: 'Hello',
          bodyHtml: '<p>Hi</p>',
          shortcut: ':welcome',
        },
      });
    });

    it('rejects an invalid body (400), not a silent store', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/email-templates',
        payload: { name: '', subject: 'Hello', bodyHtml: '<p>Hi</p>' },
      });
      expect(res.statusCode).toBe(400);
      expect(prisma.emailTemplate.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name (409)', async () => {
      prisma.emailTemplate.findFirst.mockResolvedValue(makeTemplate());
      const res = await app.inject({
        method: 'POST',
        url: '/email-templates',
        payload: { name: 'Welcome', subject: 'Hello', bodyHtml: '<p>Hi</p>' },
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /:id', () => {
    it('returns the template', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate());
      const res = await app.inject({ method: 'GET', url: '/email-templates/tpl-1' });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.id).toBe('tpl-1');
    });

    it('is a 404 for a missing id, not a silent null', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(null);
      const res = await app.inject({ method: 'GET', url: '/email-templates/nope' });
      expect(res.statusCode).toBe(404);
    });

    it('is a 403 for another user’s template (tenant wall)', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate({ userId: 'user-2' }));
      const res = await app.inject({ method: 'GET', url: '/email-templates/tpl-1' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PUT /:id', () => {
    it('updates the template', async () => {
      const existing = makeTemplate();
      prisma.emailTemplate.findUnique.mockResolvedValue(existing);
      prisma.emailTemplate.update.mockResolvedValue({ ...existing, subject: 'New subject' });
      const res = await app.inject({
        method: 'PUT',
        url: '/email-templates/tpl-1',
        payload: { subject: 'New subject' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.subject).toBe('New subject');
    });

    it('rejects an invalid body (400)', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/email-templates/tpl-1',
        payload: { name: '' },
      });
      expect(res.statusCode).toBe(400);
      expect(prisma.emailTemplate.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /:id', () => {
    it('deletes the template', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate());
      prisma.emailTemplate.delete.mockResolvedValue(makeTemplate());
      const res = await app.inject({ method: 'DELETE', url: '/email-templates/tpl-1' });
      expect(res.statusCode).toBe(200);
      expect(prisma.emailTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
    });
  });

  describe('POST /:id/render', () => {
    it('substitutes {{vars}} into subject and bodyHtml', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate());
      const res = await app.inject({
        method: 'POST',
        url: '/email-templates/tpl-1/render',
        payload: { vars: { name: 'Ada' } },
      });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      expect(payload.success).toBe(true);
      expect(payload.data.subject).toBe('Hello Ada');
      expect(payload.data.bodyHtml).toBe('<p>Hi Ada, welcome aboard</p>');
    });

    it('HTML-escapes variable values so they cannot inject markup', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate());
      const res = await app.inject({
        method: 'POST',
        url: '/email-templates/tpl-1/render',
        payload: { vars: { name: '<img src=x onerror=alert(1)>' } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.bodyHtml).toContain('&lt;img');
      expect(res.json().data.bodyHtml).not.toContain('<img');
    });

    it('blanks unknown placeholders instead of leaking {{raw}} markup', async () => {
      prisma.emailTemplate.findUnique.mockResolvedValue(makeTemplate());
      const res = await app.inject({
        method: 'POST',
        url: '/email-templates/tpl-1/render',
        payload: { vars: {} },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.subject).toBe('Hello ');
    });
  });
});

describe('email-templates proxy allow-list', () => {
  it('lets the Next proxy forward every picker route to the backend', async () => {
    const { ALLOWED_BACKEND_ROUTES } = await import('../lib/routes-config');
    const matches = (path: string, method: string) => {
      const route = ALLOWED_BACKEND_ROUTES.find(({ pattern }) => pattern.test(path));
      return route !== undefined && route.methods.includes(method);
    };
    // The exact paths the EmailTemplates picker calls.
    expect(matches('email-templates', 'GET')).toBe(true);
    expect(matches('email-templates', 'POST')).toBe(true);
    // CRUD by id.
    expect(matches('email-templates/tpl-1', 'GET')).toBe(true);
    expect(matches('email-templates/tpl-1', 'PUT')).toBe(true);
    expect(matches('email-templates/tpl-1', 'DELETE')).toBe(true);
    // Var render.
    expect(matches('email-templates/tpl-1/render', 'POST')).toBe(true);
    // No over-advertising: the picker never PATCHes, and the :id row must not
    // swallow the /render POST via a method mismatch.
    expect(matches('email-templates', 'PATCH')).toBe(false);
    expect(matches('email-templates/tpl-1/render', 'GET')).toBe(false);
  });
});
