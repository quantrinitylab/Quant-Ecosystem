// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import labelsRoutes, { OUTLOOK_COLOR_CATEGORIES } from '../routes/labels';
import emailsRoutes from '../routes/emails';
import threadsRoutes from '../routes/threads';
import { getServerAuditLogStore } from '../routes/audit-logs';

interface TestEmail {
  id: string;
  userId: string;
  threadId: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  subject: string;
  bodyText: string;
  isRead: boolean;
  isStarred: boolean;
  isPinned: boolean;
  isImportant: boolean;
  isDraft: boolean;
  isSent: boolean;
  isSpam: boolean;
  isTrash: boolean;
  folderId: string | null;
  labels: string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

interface TestLabel {
  id: string;
  userId: string;
  name: string;
  color: string;
}

let emailsStore: TestEmail[] = [];
let labelsStore: TestLabel[] = [];
let suppressionsStore: Array<{ email: string; reason: string; source: string; details?: unknown }> = [];

function makePrismaMock() {
  const mock: any = {
    email: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = emailsStore.find((e) => e.id === where.id);
        return found ? { ...found, labels: [...found.labels] } : null;
      }),
      findMany: vi.fn(async ({ where }: { where: { threadId?: string; userId?: string } }) => {
        return emailsStore
          .filter((e) => {
            if (where.threadId && e.threadId !== where.threadId) return false;
            if (where.userId && e.userId !== where.userId) return false;
            return true;
          })
          .map((e) => ({ ...e, labels: [...e.labels] }));
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<TestEmail> }) => {
        const idx = emailsStore.findIndex((e) => e.id === where.id);
        if (idx === -1) throw new Error('Not found');
        const updated = {
          ...emailsStore[idx],
          ...data,
          labels: data.labels ? [...(data.labels as string[])] : emailsStore[idx].labels,
          version: emailsStore[idx].version + 1,
        };
        emailsStore[idx] = updated;
        return { ...updated };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: any; data: Partial<TestEmail> }) => {
        let count = 0;
        emailsStore = emailsStore.map((e) => {
          let match = true;
          if (where.id && e.id !== where.id) match = false;
          if (where.threadId && e.threadId !== where.threadId) match = false;
          if (where.userId && e.userId !== where.userId) match = false;
          if (match) {
            count++;
            return {
              ...e,
              ...data,
              labels: data.labels ? [...(data.labels as string[])] : e.labels,
              version: e.version + 1,
            };
          }
          return e;
        });
        return { count };
      }),
    },
    label: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        return labelsStore.filter((l) => l.userId === where.userId);
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return labelsStore.find((l) => l.id === where.id) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<TestLabel, 'id'> }) => {
        const created: TestLabel = {
          id: `label-${labelsStore.length + 1}`,
          ...data,
        };
        labelsStore.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<TestLabel> }) => {
        const idx = labelsStore.findIndex((l) => l.id === where.id);
        if (idx === -1) throw new Error('Not found');
        labelsStore[idx] = { ...labelsStore[idx], ...data };
        return labelsStore[idx];
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = labelsStore.findIndex((l) => l.id === where.id);
        if (idx === -1) throw new Error('Not found');
        const [deleted] = labelsStore.splice(idx, 1);
        return deleted;
      }),
    },
    emailSuppression: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => {
        return suppressionsStore.find((s) => s.email === where.email) ?? null;
      }),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const idx = suppressionsStore.findIndex((s) => s.email === where.email);
        if (idx >= 0) {
          suppressionsStore[idx] = { ...suppressionsStore[idx], ...update };
          return suppressionsStore[idx];
        }
        const row = { id: `sup-${Date.now()}`, ...create, createdAt: new Date(), updatedAt: new Date() };
        suppressionsStore.push(row);
        return row;
      }),
    },
    emailThread: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const matching = emailsStore.filter((e) => e.threadId === where.id);
        if (matching.length === 0) return null;
        return {
          id: where.id,
          userId: matching[0].userId,
          subject: matching[0].subject,
          emails: matching,
        };
      }),
    },
    outboxEvent: {
      create: vi.fn(async (args: any) => ({
        id: 'outbox-1',
        createdAt: new Date(),
        ...args.data,
      })),
    },
    auditLog: {
      create: vi.fn(async (args: any) => ({
        id: 'audit-1',
        createdAt: new Date(),
        ...args.data,
      })),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock)),
  };
  return mock;
}

async function buildTestApp(): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', makePrismaMock() as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
  });
  await app.register(labelsRoutes, { prefix: '/labels' });
  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.register(threadsRoutes, { prefix: '/threads' });
  return app;
}

beforeEach(() => {
  labelsStore = [];
  suppressionsStore = [];
  emailsStore = [
    {
      id: 'email-1',
      userId: 'user-1',
      threadId: 'thread-1',
      fromAddress: 'spammer@example.com',
      fromName: 'Spam Person',
      toAddresses: ['user-1@quantmail.com'],
      subject: 'Special offer',
      bodyText: 'Win lottery',
      isRead: false,
      isStarred: false,
      isPinned: false,
      isImportant: false,
      isDraft: false,
      isSent: false,
      isSpam: false,
      isTrash: false,
      folderId: 'inbox',
      labels: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'email-2',
      userId: 'user-1',
      threadId: 'thread-1',
      fromAddress: 'spammer@example.com',
      fromName: 'Spam Person',
      toAddresses: ['user-1@quantmail.com'],
      subject: 'Re: Special offer',
      bodyText: 'Follow up',
      isRead: false,
      isStarred: false,
      isPinned: false,
      isImportant: false,
      isDraft: false,
      isSent: false,
      isSpam: false,
      isTrash: false,
      folderId: 'inbox',
      labels: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
});

describe('Outlook Parity Backend Slices S2, S3, S4', () => {
  describe('Slice S2: Outlook 6 Color Categories', () => {
    it('POST /labels/categories/seed seeds all 6 default categories', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/labels/categories/seed',
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(6);
      const names = body.data.map((c: any) => c.name);
      expect(names).toEqual(['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple']);
      expect(body.data.find((c: any) => c.name === 'Red').color).toBe('#EF4444');
      expect(body.data.find((c: any) => c.name === 'Blue').color).toBe('#38BDF8');
    });

    it('POST /labels/categories/seed is idempotent', async () => {
      const app = await buildTestApp();
      await app.inject({ method: 'POST', url: '/labels/categories/seed' });
      const res2 = await app.inject({ method: 'POST', url: '/labels/categories/seed' });
      expect(res2.statusCode).toBe(201);
      expect(labelsStore).toHaveLength(6);
    });

    it('POST /emails/:id/categories toggles color category on email', async () => {
      const app = await buildTestApp();
      // First toggle: add "Red"
      const res1 = await app.inject({
        method: 'POST',
        url: '/emails/email-1/categories',
        payload: { category: 'Red' },
      });
      expect(res1.statusCode).toBe(200);
      const body1 = res1.json();
      expect(body1.success).toBe(true);
      expect(body1.labels).toContain('Red');

      // Second toggle: remove "Red"
      const res2 = await app.inject({
        method: 'POST',
        url: '/emails/email-1/categories',
        payload: { category: 'Red' },
      });
      expect(res2.statusCode).toBe(200);
      const body2 = res2.json();
      expect(body2.success).toBe(true);
      expect(body2.labels).not.toContain('Red');
    });
  });

  describe('Slice S3: Safety & Trust (Block, Report Junk, Report Phishing)', () => {
    it('POST /emails/:id/block suppresses sender and moves thread to spam', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/emails/email-1/block',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.blockedSender).toBe('spammer@example.com');

      // Thread emails marked as spam
      const email1 = emailsStore.find((e) => e.id === 'email-1');
      const email2 = emailsStore.find((e) => e.id === 'email-2');
      expect(email1?.isSpam).toBe(true);
      expect(email1?.folderId).toBe('spam');
      expect(email2?.isSpam).toBe(true);
      expect(email2?.folderId).toBe('spam');
    });

    it('POST /emails/:id/report-junk marks email and thread as spam', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/emails/email-1/report-junk',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain('junk');

      const email1 = emailsStore.find((e) => e.id === 'email-1');
      expect(email1?.isSpam).toBe(true);
      expect(email1?.folderId).toBe('spam');
    });

    it('POST /emails/:id/report-phishing marks spam+trash and records audit log', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'POST',
        url: '/emails/email-1/report-phishing',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain('phishing');

      const email1 = emailsStore.find((e) => e.id === 'email-1');
      expect(email1?.isSpam).toBe(true);
      expect(email1?.isTrash).toBe(true);
      expect(email1?.folderId).toBe('trash');

      // Audit log recorded
      const logs = getServerAuditLogStore();
      const foundLog = logs.find((l) => l.action === 'email.report_phishing' && l.resourceId === 'email-1');
      expect(foundLog).toBeDefined();
      expect(foundLog?.userId).toBe('user-1');
    });
  });

  describe('Slice S4: Focused / Other Server Override', () => {
    it('PATCH /threads/:id/focused overrides Focused to false (Other)', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/threads/thread-1/focused',
        payload: { isFocused: false },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.isFocused).toBe(false);

      const email1 = emailsStore.find((e) => e.id === 'email-1');
      expect(email1?.labels).toContain('__other_override__');
      expect(email1?.labels).not.toContain('__focused_override__');
      expect(email1?.isImportant).toBe(false);
    });

    it('PATCH /threads/:id/focused overrides Focused to true', async () => {
      const app = await buildTestApp();
      const res = await app.inject({
        method: 'PATCH',
        url: '/threads/thread-1/focused',
        payload: { isFocused: true },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.isFocused).toBe(true);

      const email1 = emailsStore.find((e) => e.id === 'email-1');
      expect(email1?.labels).toContain('__focused_override__');
      expect(email1?.labels).not.toContain('__other_override__');
      expect(email1?.isImportant).toBe(true);
    });

    it('PATCH /threads/:id/focused clears override with null', async () => {
      const app = await buildTestApp();
      // Set to true first
      await app.inject({
        method: 'PATCH',
        url: '/threads/thread-1/focused',
        payload: { isFocused: true },
      });
      // Clear with null
      const res = await app.inject({
        method: 'PATCH',
        url: '/threads/thread-1/focused',
        payload: { isFocused: null },
      });
      expect(res.statusCode).toBe(200);
      const email1 = emailsStore.find((e) => e.id === 'email-1');
      expect(email1?.labels).not.toContain('__focused_override__');
      expect(email1?.labels).not.toContain('__other_override__');
    });
  });
});
