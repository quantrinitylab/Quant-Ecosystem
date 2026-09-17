import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import emailsRoutes from '../routes/emails';
import contactsRoutes from '../routes/contacts';
import mailFiltersRoutes from '../routes/mail-filters';
import { ALLOWED_BACKEND_ROUTES } from '../lib/routes-config';
import { OUTBOUND_DELIVERY_QUEUE } from '../services/outbound-delivery.service';

// Mock SES sender to avoid external network calls during unit tests
vi.mock('../lib/ses-sender', () => ({
  sendViaSes: vi.fn().mockResolvedValue('ses-msg-123'),
  isSesConfigured: vi.fn().mockReturnValue(true),
}));

// Mock OutboundDeliveryPipeline queue to avoid Redis connection in tests
vi.mock('../services/outbound-delivery.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/outbound-delivery.service')>();
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    remove: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    ...actual,
    OUTBOUND_DELIVERY_QUEUE: 'outbound-delivery',
    OutboundDeliveryPipeline: class extends actual.OutboundDeliveryPipeline {
      static override createQueue() {
        return mockQueue as any;
      }
      override async enqueueSend(
        _userId: string,
        _emailId: string,
        _options?: any,
      ): Promise<string> {
        return 'job-1';
      }
      override async cancelSend(_userId: string, _emailId: string): Promise<boolean> {
        return true;
      }
    },
  };
});

function createInMemoryPrisma() {
  const emails = new Map<string, any>();
  const contacts = new Map<string, any>();
  const folders = new Map<string, any>();
  const filters = new Map<string, any>();

  // Default Sent and Drafts folders
  folders.set('folder-sent', { id: 'folder-sent', userId: 'user-1', name: 'Sent', type: 'SENT' });
  folders.set('folder-drafts', {
    id: 'folder-drafts',
    userId: 'user-1',
    name: 'Drafts',
    type: 'DRAFTS',
  });

  return {
    emails,
    contacts,
    folders,
    filters,
    email: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const id = data.id || `email-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        emails.set(id, record);
        return { ...record };
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const found = emails.get(where.id);
        return found ? { ...found } : null;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        for (const item of emails.values()) {
          let match = true;
          if (where.id && item.id !== where.id) match = false;
          if (where.userId && item.userId !== where.userId) match = false;
          if (where.isDraft !== undefined && item.isDraft !== where.isDraft) match = false;
          if (match) return { ...item };
        }
        return null;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        const results: any[] = [];
        for (const item of emails.values()) {
          if (!where || !where.userId || item.userId === where.userId) {
            results.push({ ...item });
          }
        }
        return results;
      }),
      count: vi.fn().mockImplementation(async () => emails.size),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const existing = emails.get(where.id);
        if (!existing) throw new Error(`Email not found: ${where.id}`);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        emails.set(where.id, updated);
        return { ...updated };
      }),
      delete: vi.fn().mockImplementation(async ({ where }: any) => {
        const existing = emails.get(where.id);
        emails.delete(where.id);
        return existing;
      }),
    },
    contact: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const id = data.id || `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = {
          id,
          phone: null,
          company: null,
          avatar: null,
          tags: [],
          isFavorite: false,
          frequency: 0,
          lastContactedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        contacts.set(id, record);
        return { ...record };
      }),
      createMany: vi.fn().mockImplementation(async ({ data }: any) => {
        let count = 0;
        for (const row of data) {
          const id = row.id || `contact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          contacts.set(id, {
            id,
            phone: null,
            company: null,
            avatar: null,
            tags: [],
            isFavorite: false,
            frequency: 0,
            lastContactedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...row,
          });
          count++;
        }
        return { count };
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const found = contacts.get(where.id);
        return found ? { ...found } : null;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        for (const c of contacts.values()) {
          let match = true;
          if (where.id && c.id !== where.id) match = false;
          if (where.userId && c.userId !== where.userId) match = false;
          if (where.email && c.email.toLowerCase() !== where.email.toLowerCase()) match = false;
          if (match) return { ...c };
        }
        return null;
      }),
      findMany: vi.fn().mockImplementation(async ({ where, select }: any) => {
        const results: any[] = [];
        for (const c of contacts.values()) {
          if (!where || !where.userId || c.userId === where.userId) {
            if (select?.email) {
              results.push({ email: c.email });
            } else {
              results.push({ ...c });
            }
          }
        }
        return results;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const existing = contacts.get(where.id);
        if (!existing) throw new Error(`Contact not found: ${where.id}`);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        contacts.set(where.id, updated);
        return { ...updated };
      }),
      delete: vi.fn().mockImplementation(async ({ where }: any) => {
        const existing = contacts.get(where.id);
        contacts.delete(where.id);
        return existing;
      }),
    },
    mailFilter: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const id = `filter-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = { id, createdAt: new Date(), updatedAt: new Date(), ...data };
        filters.set(id, record);
        return { ...record };
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const found = filters.get(where.id);
        return found ? { ...found } : null;
      }),
      findMany: vi.fn().mockImplementation(async ({ where }: any) => {
        const results: any[] = [];
        for (const f of filters.values()) {
          if (!where || !where.userId || f.userId === where.userId) {
            results.push({ ...f });
          }
        }
        return results;
      }),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const existing = filters.get(where.id);
        if (!existing) throw new Error(`Filter not found: ${where.id}`);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        filters.set(where.id, updated);
        return { ...updated };
      }),
      delete: vi.fn().mockImplementation(async ({ where }: any) => {
        const existing = filters.get(where.id);
        filters.delete(where.id);
        return existing;
      }),
    },
    user: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where.id === 'user-1') {
          return {
            id: 'user-1',
            email: 'user1@quantmail.in',
            username: 'user1',
            displayName: 'User One',
          };
        }
        return null;
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    emailFolder: {
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        for (const f of folders.values()) {
          if (where.userId && f.userId !== where.userId) continue;
          if (where.OR) {
            const matchesOr = where.OR.some(
              (cond: any) =>
                (cond.name && f.name === cond.name) || (cond.type && f.type === cond.type),
            );
            if (matchesOr) return { ...f };
          } else if (where.type && f.type === where.type) {
            return { ...f };
          }
        }
        return null;
      }),
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const id = `folder-${Date.now()}`;
        const record = { id, ...data };
        folders.set(id, record);
        return { ...record };
      }),
    },
    emailThread: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'thread-1' }),
      update: vi.fn().mockResolvedValue({ id: 'thread-1' }),
    },
  };
}

async function buildFastifyApp(prisma: any, authenticatedUserId: string | null = 'user-1') {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma);
  app.addHook('onRequest', async (req) => {
    (req as any).auth = authenticatedUserId ? { userId: authenticatedUserId } : null;
  });
  await app.register(emailsRoutes, { prefix: '/emails' });
  await app.register(contactsRoutes, { prefix: '/contacts' });
  await app.register(mailFiltersRoutes, { prefix: '/mail-filters' });
  await app.ready();
  return app;
}

describe('Wave 8 — Phase M & Contacts Parity Suite (Developer 1)', () => {
  let prisma: ReturnType<typeof createInMemoryPrisma>;
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = createInMemoryPrisma();
    app = await buildFastifyApp(prisma, 'user-1');
  });

  afterEach(async () => {
    await app.close();
  });

  // ===========================================================================
  // 1. Durable Undo-Send & Scheduled Send (Tasks M21, M22, M23)
  // ===========================================================================
  describe('Durable Undo-Send & Scheduled Send (POST /emails/:id/undo-send & sendAt)', () => {
    it('cancels outbound send and reverts status to draft within undo window', async () => {
      // Setup an email in 'queued' deliveryStatus that was sent 5 seconds ago
      const email = await prisma.email.create({
        data: {
          id: 'email-queued-1',
          userId: 'user-1',
          fromAddress: 'user1@quantmail.in',
          toAddresses: ['external@example.com'],
          subject: 'Accidental Send',
          bodyPlain: 'Please cancel me',
          isDraft: false,
          isSent: true,
          sentAt: new Date(Date.now() - 5000),
          deliveryStatus: 'queued',
          folderId: 'folder-sent',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/emails/${email.id}/undo-send`,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.message).toBe('Send cancelled, email returned to Drafts');
      expect(json.data.emailId).toBe('email-queued-1');

      // Verify DB record was reverted to draft
      const updated = await prisma.email.findUnique({ where: { id: 'email-queued-1' } });
      expect(updated?.isDraft).toBe(true);
      expect(updated?.isSent).toBe(false);
      expect(updated?.sentAt).toBeNull();
      expect(updated?.deliveryStatus).toBe('draft');
      expect(updated?.folderId).toBe('folder-drafts');
    });

    it('cancels outbound send when status is "sending"', async () => {
      const email = await prisma.email.create({
        data: {
          id: 'email-sending-1',
          userId: 'user-1',
          fromAddress: 'user1@quantmail.in',
          toAddresses: ['colleague@example.com'],
          subject: 'Sending in progress',
          isDraft: false,
          isSent: true,
          sentAt: new Date(),
          deliveryStatus: 'sending',
          folderId: 'folder-sent',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/emails/${email.id}/undo-send`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);

      const updated = await prisma.email.findUnique({ where: { id: 'email-sending-1' } });
      expect(updated?.isDraft).toBe(true);
      expect(updated?.deliveryStatus).toBe('draft');
    });

    it('rejects undo-send with 400 when email has already been delivered or undo window expired', async () => {
      const email = await prisma.email.create({
        data: {
          id: 'email-delivered-1',
          userId: 'user-1',
          fromAddress: 'user1@quantmail.in',
          toAddresses: ['friend@example.com'],
          subject: 'Already delivered',
          isDraft: false,
          isSent: true,
          sentAt: new Date(Date.now() - 60_000), // 1 minute ago
          deliveryStatus: 'delivered',
          folderId: 'folder-sent',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/emails/${email.id}/undo-send`,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('CANNOT_UNDO_SEND');
    });

    it('rejects unauthenticated undo-send with 401', async () => {
      const unauthApp = await buildFastifyApp(prisma, null);
      const response = await unauthApp.inject({
        method: 'POST',
        url: '/emails/email-queued-1/undo-send',
      });
      expect(response.statusCode).toBe(401);
      await unauthApp.close();
    });

    it('rejects undo-send on an email belonging to another user with 404 (tenancy oracle elimination)', async () => {
      await prisma.email.create({
        data: {
          id: 'email-other-tenant',
          userId: 'other-user',
          fromAddress: 'other@quantmail.in',
          toAddresses: ['test@example.com'],
          subject: 'Secret',
          isDraft: false,
          isSent: true,
          sentAt: new Date(),
          deliveryStatus: 'queued',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/emails/email-other-tenant/undo-send',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('EMAIL_NOT_FOUND');
    });

    it('schedules delayed delivery when sendAt is provided in the future', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString();

      const response = await app.inject({
        method: 'POST',
        url: '/emails/compose',
        payload: {
          to: [{ email: 'recipient@example.com' }],
          subject: 'Scheduled Announcement',
          bodyText: 'Delivered in one hour',
          sendAt: futureDate,
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.deliveryStatus).toBe('queued');
      expect(json.data.isDraft).toBe(false);
      expect(json.data.isSent).toBe(true);
    });
  });

  // ===========================================================================
  // 2. Contact Deduplication (Task X03)
  // ===========================================================================
  describe('Contact Deduplication (POST /contacts/deduplicate)', () => {
    it('merges contacts with duplicate normalized emails and removes duplicate rows', async () => {
      // Seed 2 contacts with duplicate emails (case-insensitive)
      const primary = await prisma.contact.create({
        data: {
          id: 'contact-p1',
          userId: 'user-1',
          name: 'Sarah Connor',
          email: 'sarah.connor@cyberdyne.com',
          phone: '555-1000',
          company: 'Cyberdyne',
          tags: ['client'],
          frequency: 5,
          isFavorite: true,
        },
      });

      const dup = await prisma.contact.create({
        data: {
          id: 'contact-d1',
          userId: 'user-1',
          name: 'Sarah C.',
          email: 'SARAH.CONNOR@CYBERDYNE.COM',
          phone: null,
          company: 'Cyberdyne Systems',
          tags: ['vip', 'resistance'],
          frequency: 2,
          isFavorite: false,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/contacts/deduplicate',
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.mergedCount).toBe(1);

      // Verify duplicate row was deleted
      const deletedDup = await prisma.contact.findUnique({ where: { id: dup.id } });
      expect(deletedDup).toBeNull();

      // Verify primary contact retained merged tags and updated frequency
      const merged = await prisma.contact.findUnique({ where: { id: primary.id } });
      expect(merged).toBeDefined();
      expect(merged?.tags).toContain('client');
      expect(merged?.tags).toContain('vip');
      expect(merged?.tags).toContain('resistance');
      expect(merged?.frequency).toBe(7);
      expect(merged?.isFavorite).toBe(true);
    });

    it('merges contacts matching normalized phone numbers', async () => {
      const c1 = await prisma.contact.create({
        data: {
          id: 'contact-phone-1',
          userId: 'user-1',
          name: 'John Doe Mobile',
          email: 'johndoe.mobile@example.com',
          phone: '+1 (555) 234-5678',
          tags: ['mobile'],
          frequency: 3,
        },
      });

      const c2 = await prisma.contact.create({
        data: {
          id: 'contact-phone-2',
          userId: 'user-1',
          name: 'John Doe Work',
          email: 'johndoe.work@example.com',
          phone: '15552345678', // Same normalized digits
          tags: ['work'],
          frequency: 1,
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/contacts/deduplicate',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().success).toBe(true);
      expect(response.json().mergedCount).toBe(1);

      // One should remain, one deleted
      const remaining = await prisma.contact.findMany({ where: { userId: 'user-1' } });
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.tags).toContain('mobile');
      expect(remaining[0]?.tags).toContain('work');
    });

    it('returns mergedCount: 0 when no duplicates exist', async () => {
      await prisma.contact.create({
        data: {
          id: 'contact-unique-1',
          userId: 'user-1',
          name: 'Alice',
          email: 'alice@unique.com',
        },
      });
      await prisma.contact.create({
        data: {
          id: 'contact-unique-2',
          userId: 'user-1',
          name: 'Bob',
          email: 'bob@unique.com',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/contacts/deduplicate',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true, mergedCount: 0 });
    });
  });

  // ===========================================================================
  // 3. Bulk CSV / vCard Import (Tasks X03, D20)
  // ===========================================================================
  describe('Bulk Contact Import (POST /contacts/import)', () => {
    it('parses CSV and creates contacts in database', async () => {
      const csvData = [
        'name,email,phone,company,notes,tags',
        'Bruce Wayne,bruce@wayne-enterprises.com,+15559998888,Wayne Enterprises,Gotham CEO,finance;executive',
        'Clark Kent,clark@dailyplanet.com,+15551112222,Daily Planet,Investigative reporter,journalism',
      ].join('\n');

      const response = await app.inject({
        method: 'POST',
        url: '/contacts/import',
        payload: { content: csvData },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.importedCount).toBe(2);
      expect(json.errors).toEqual([]);

      // Verify contacts in database
      const bruce = await prisma.contact.findFirst({
        where: { userId: 'user-1', email: 'bruce@wayne-enterprises.com' },
      });
      expect(bruce).toBeDefined();
      expect(bruce?.name).toBe('Bruce Wayne');
      expect(bruce?.phone).toBe('+15559998888');
      expect(bruce?.company).toBe('Wayne Enterprises');
      expect(bruce?.tags).toContain('finance');
      expect(bruce?.tags).toContain('executive');
      expect(bruce?.tags).toContain('Gotham CEO');

      const clark = await prisma.contact.findFirst({
        where: { userId: 'user-1', email: 'clark@dailyplanet.com' },
      });
      expect(clark).toBeDefined();
      expect(clark?.name).toBe('Clark Kent');
      expect(clark?.company).toBe('Daily Planet');
      expect(clark?.tags).toContain('journalism');
    });

    it('parses vCard text and creates contacts in database', async () => {
      const vcardData = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Tony Stark',
        'EMAIL:tony@starkindustries.com',
        'TEL:+15553000',
        'ORG:Stark Industries',
        'CATEGORIES:avenger,tech',
        'END:VCARD',
      ].join('\r\n');

      const response = await app.inject({
        method: 'POST',
        url: '/contacts/import',
        payload: { content: vcardData },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.importedCount).toBe(1);

      const tony = await prisma.contact.findFirst({
        where: { userId: 'user-1', email: 'tony@starkindustries.com' },
      });
      expect(tony).toBeDefined();
      expect(tony?.name).toBe('Tony Stark');
      expect(tony?.phone).toBe('+15553000');
      expect(tony?.company).toBe('Stark Industries');
      expect(tony?.tags).toContain('avenger');
      expect(tony?.tags).toContain('tech');
    });

    it('collects errors for invalid rows while importing valid ones', async () => {
      const csvWithInvalidRow = [
        'name,email,phone,company,notes,tags',
        'Valid User,valid@example.com,,,note1,tag1',
        'Invalid User,not-an-email,,,note2,tag2',
      ].join('\n');

      const response = await app.inject({
        method: 'POST',
        url: '/contacts/import',
        payload: { content: csvWithInvalidRow },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.importedCount).toBe(1);
      expect(json.errors.length).toBeGreaterThan(0);
      expect(json.errors[0]).toContain('Invalid email');
    });
  });

  // ===========================================================================
  // 4. Proxy Allowlist & Safety Checks for Mail Filters (Tasks M15, M17 & R05)
  // ===========================================================================
  describe('Proxy Allowlist & R-SEC Domain Safety for Mail Filters', () => {
    const resolveRoute = (pathStr: string) => {
      return ALLOWED_BACKEND_ROUTES.find(({ pattern }: { pattern: RegExp }) =>
        pattern.test(pathStr),
      );
    };

    it('Proxy allowlist: mail-filters pattern matches GET, POST, PUT, DELETE', () => {
      const root = resolveRoute('mail-filters');
      expect(root).toBeDefined();
      expect(root?.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE']);

      const filterItem = resolveRoute('mail-filters/filt-123');
      expect(filterItem).toBeDefined();
      expect(filterItem?.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE']);

      const filterTest = resolveRoute('mail-filters/filt-123/test');
      expect(filterTest).toBeDefined();
      expect(filterTest?.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE']);

      // Base /filters is not allowlisted (mounted at mail-filters)
      expect(resolveRoute('filters')).toBeUndefined();
    });

    it('R-SEC: rejects filter creation with disposable / unsafe forwardTo domain', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/mail-filters',
        payload: {
          name: 'Disallowed Forwarding Domain',
          conditions: [{ from: 'alerts@service.com' }],
          actions: [{ forwardTo: 'drop@mailinator.com' }],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('UNSAFE_FORWARD_DOMAIN');
    });

    it('R-SEC: rejects forwardTo loop targeting the user own email address', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/mail-filters',
        payload: {
          name: 'Self Forwarding Loop',
          conditions: [{ subjectContains: 'Loop Test' }],
          actions: [{ forwardTo: 'user1@quantmail.in' }], // caller's own email
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('FORWARD_LOOP_DETECTED');
    });

    it('R-SEC: allows filter creation with verified, safe forwardTo address', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/mail-filters',
        payload: {
          name: 'Safe External Forward',
          conditions: [{ subjectContains: 'Urgent' }],
          actions: [{ forwardTo: 'alerts@enterprise-partner.org' }],
        },
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe('Safe External Forward');
    });
  });
});
