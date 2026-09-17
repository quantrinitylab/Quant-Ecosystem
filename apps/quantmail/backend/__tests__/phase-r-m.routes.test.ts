import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { NextRequest } from 'next/server';
import { errorHandlerPlugin } from '@quant/server-core';
import { EmailService } from '../services/email.service';
import {
  DeliveryWorker,
  type DnsMxResolver,
  type SmtpTransport,
} from '../services/delivery-worker.service';
import emailsRoutes from '../routes/emails';
import * as sesSender from '../lib/ses-sender';

// Mock SES sender module
vi.mock('../lib/ses-sender', () => ({
  sendViaSes: vi.fn().mockResolvedValue('ses-msg-123'),
  isSesConfigured: vi.fn().mockReturnValue(true),
}));

// Mock OutboundDeliveryPipeline to avoid Redis connection during unit tests
vi.mock('../services/outbound-delivery.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/outbound-delivery.service')>();
  return {
    ...actual,
    OutboundDeliveryPipeline: class extends actual.OutboundDeliveryPipeline {
      static override createQueue() {
        return {
          add: vi.fn().mockResolvedValue({ id: 'job-1' }),
          close: vi.fn().mockResolvedValue(undefined),
        } as any;
      }
      override async enqueueSend(
        _userId: string,
        _emailId: string,
        _options?: any,
      ): Promise<string> {
        return 'job-1';
      }
    },
  };
});

import { ALLOWED_BACKEND_ROUTES } from '../lib/routes-config';
import { proxyToBackend } from '../../src/app/api/_lib/proxy';
import * as routeHandlers from '../../src/app/api/[...path]/route';

function createMockPrisma() {
  const storedEmails = new Map<string, any>();
  const storedDraft = {
    id: 'draft-1',
    userId: 'user-1',
    fromAddress: 'sender@test.com',
    isDraft: true,
    isSent: false,
    toAddresses: ['initial@test.com'],
    subject: 'Initial Subject',
    ccAddresses: ['cc1@test.com'],
    bccAddresses: ['bcc1@test.com'],
    bodyHtml: '<p>Initial Body</p>',
    bodyPlain: 'Initial Body',
    inReplyTo: 'msg-parent-123',
    threadId: 'thread-999',
    hasAttachments: false,
    attachments: [],
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  storedEmails.set('draft-1', storedDraft);

  return {
    storedDraft,
    storedEmails,
    email: {
      create: vi.fn().mockImplementation(async ({ data }: any) => {
        const id = data?.id || `email-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const record = { ...storedDraft, ...data, id };
        storedEmails.set(id, record);
        return record;
      }),
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        if (storedEmails.has(where.id)) return { ...storedEmails.get(where.id) };
        if (where.id === 'draft-1') return { ...storedDraft };
        return null;
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
        if (where?.id && storedEmails.has(where.id)) return { ...storedEmails.get(where.id) };
        return { ...storedDraft };
      }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
      update: vi.fn().mockImplementation(async ({ where, data }: any) => {
        const existing = storedEmails.get(where.id) || storedDraft;
        const updated = { ...existing, ...data, id: where.id };
        storedEmails.set(where.id, updated);
        return updated;
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockImplementation(async ({ where }: any) => {
        const existing = storedEmails.get(where.id) || storedDraft;
        storedEmails.delete(where.id);
        return existing;
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user-1@quantmail.in',
        username: 'user1',
        displayName: 'User One',
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    label: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    emailFolder: {
      findFirst: vi.fn().mockResolvedValue({ id: 'folder-1', name: 'Sent', type: 'SENT' }),
      create: vi.fn().mockResolvedValue({ id: 'folder-1', name: 'Sent', type: 'SENT' }),
      upsert: vi.fn().mockResolvedValue({ id: 'folder-1' }),
    },
    emailThread: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'thread-1' }),
      update: vi.fn().mockResolvedValue({ id: 'thread-1' }),
    },
    contact: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'contact-1' }),
      update: vi.fn().mockResolvedValue({ id: 'contact-1' }),
    },
    deliveryAttempt: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(async ({ create, update }: any) => ({
        ...create,
        ...update,
      })),
    },
  };
}

async function buildTestFastifyApp(prisma: any, authenticatedUserId: string | null = 'user-1') {
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma);
  app.addHook('onRequest', async (req) => {
    (req as any).auth = authenticatedUserId ? { userId: authenticatedUserId } : null;
  });
  await app.register(emailsRoutes, { prefix: '/emails' });
  return app;
}

describe('Dev 2 QA Sentinel — Phase R & Phase M Merge Gate Suite', () => {
  describe('Phase R: Proxy Allow-List Verification (§3.2 & §7)', () => {
    const resolveRoute = (pathStr: string) => {
      return ALLOWED_BACKEND_ROUTES.find(({ pattern }: { pattern: RegExp }) =>
        pattern.test(pathStr),
      );
    };

    it('R-D1: mail-filters and mail-filters/abc/test resolve GET, POST, PUT, DELETE (unblocked by R-SEC)', () => {
      const rootRoute = resolveRoute('mail-filters');
      expect(rootRoute).toBeDefined();
      expect(rootRoute?.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE']);

      const testRoute = resolveRoute('mail-filters/abc/test');
      expect(testRoute).toBeDefined();
      expect(testRoute?.methods).toEqual(['GET', 'POST', 'PUT', 'DELETE']);

      expect(resolveRoute('filters')).toBeUndefined();
    });

    it('R-D2: calendars/abc allows PUT and DELETE, and rejects PATCH (not in allowed methods)', () => {
      const route = resolveRoute('calendars/cal-123');
      expect(route).toBeDefined();
      expect(route?.methods).toContain('PUT');
      expect(route?.methods).toContain('DELETE');
      expect(route?.methods).not.toContain('PATCH');
    });

    it('R-D3: events/abc/rsvp resolves POST; events/abc allows GET, PUT, PATCH, DELETE', () => {
      const rsvpRoute = resolveRoute('events/evt-123/rsvp');
      expect(rsvpRoute).toBeDefined();
      expect(rsvpRoute?.methods).toEqual(['POST']);

      const eventRoute = resolveRoute('events/evt-123');
      expect(eventRoute).toBeDefined();
      expect(eventRoute?.methods).toContain('GET');
      expect(eventRoute?.methods).toContain('PUT');
      expect(eventRoute?.methods).toContain('PATCH');
      expect(eventRoute?.methods).toContain('DELETE');
    });

    it('R-D4: calendar/booking/slug/book resolves POST; booking/links/slug/book is NOT allow-listed', () => {
      const publicBookRoute = resolveRoute('calendar/booking/my-slug/book');
      expect(publicBookRoute).toBeDefined();
      expect(publicBookRoute?.methods).toContain('POST');

      const publicSlotsRoute = resolveRoute('calendar/booking/my-slug/slots');
      expect(publicSlotsRoute).toBeDefined();
      expect(publicSlotsRoute?.methods).toContain('GET');

      // The internal non-public duplicate cannot match public booking patterns
      const invalidInviteRoute = resolveRoute('booking/links/my-slug/book');
      expect(invalidInviteRoute).toBeUndefined();

      // Only link creation is authenticated
      const linkCreateRoute = resolveRoute('booking/links');
      expect(linkCreateRoute).toBeDefined();
      expect(linkCreateRoute?.methods).toEqual(['POST']);
    });

    it('R-V1 Pattern: search/emails and search/parse resolve GET in route table', () => {
      const searchEmails = resolveRoute('search/emails');
      expect(searchEmails).toBeDefined();
      expect(searchEmails?.methods).toEqual(['GET']);

      const searchParse = resolveRoute('search/parse');
      expect(searchParse).toBeDefined();
      expect(searchParse?.methods).toEqual(['GET']);
    });

    it('R11: folders, attachments, and settings-tokens routes resolve expected methods', () => {
      // Folders
      const foldersRoot = resolveRoute('folders');
      expect(foldersRoot).toBeDefined();
      expect(foldersRoot?.methods).toEqual(['GET', 'POST']);

      const folderItem = resolveRoute('folders/folder-123');
      expect(folderItem).toBeDefined();
      expect(folderItem?.methods).toEqual(['PUT', 'DELETE']);

      // Attachments
      const attachmentUpload = resolveRoute('attachments/upload-url');
      expect(attachmentUpload).toBeDefined();
      expect(attachmentUpload?.methods).toEqual(['POST']);

      const attachmentItem = resolveRoute('attachments/att-456');
      expect(attachmentItem).toBeDefined();
      expect(attachmentItem?.methods).toEqual(['GET', 'DELETE']);

      // Settings Tokens (PATs)
      const settingsTokensRoot = resolveRoute('settings/tokens');
      expect(settingsTokensRoot).toBeDefined();
      expect(settingsTokensRoot?.methods).toEqual(['GET', 'POST']);

      const settingsTokenItem = resolveRoute('settings/tokens/token-789');
      expect(settingsTokenItem).toBeDefined();
      expect(settingsTokenItem?.methods).toEqual(['DELETE']);
    });

    it('T2 / Phase R Invariant: every declared method in ALLOWED_BACKEND_ROUTES is an exported handler on route.ts', () => {
      const allDeclaredMethods = new Set<string>();

      for (const route of ALLOWED_BACKEND_ROUTES) {
        for (const method of route.methods) {
          allDeclaredMethods.add(method);
        }
      }

      // Explicitly check that route.ts exports every allowed method as a callable handler function
      for (const method of allDeclaredMethods) {
        const handler = (routeHandlers as Record<string, unknown>)[method];
        expect(typeof handler).toBe('function');
      }
    });
  });

  describe('Phase R: Next.js Proxy Query & Auth Forwarding Verification (R-V1 & R-V2)', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { count: 42 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('R-V1: proxyToBackend forwards searchParams (querystring) on GET requests to the backend URL', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/search/emails?q=urgent&limit=10&page=2',
      );
      const res = await proxyToBackend(req, '/search/emails');

      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const fetchUrl = vi.mocked(global.fetch).mock.calls[0][0] as string;
      const parsedUrl = new URL(fetchUrl);

      expect(parsedUrl.pathname).toBe('/search/emails');
      expect(parsedUrl.searchParams.get('q')).toBe('urgent');
      expect(parsedUrl.searchParams.get('limit')).toBe('10');
      expect(parsedUrl.searchParams.get('page')).toBe('2');
    });

    it('R-V2: proxyToBackend forwards Authorization header when present, and omits it cleanly when absent', async () => {
      // 1. With Authorization header
      const authReq = new NextRequest('http://localhost:3000/api/calendars', {
        headers: { Authorization: 'Bearer test-jwt-token-xyz' },
      });
      await proxyToBackend(authReq, '/calendars');

      const firstCallInit = vi.mocked(global.fetch).mock.calls[0][1] as RequestInit;
      expect((firstCallInit.headers as Record<string, string>)['Authorization']).toBe(
        'Bearer test-jwt-token-xyz',
      );

      // 2. Without Authorization header (public or unauthenticated endpoint)
      vi.mocked(global.fetch).mockClear();
      const publicReq = new NextRequest('http://localhost:3000/api/calendar/booking/slug');
      await proxyToBackend(publicReq, '/calendar/booking/slug');

      const secondCallInit = vi.mocked(global.fetch).mock.calls[0][1] as RequestInit;
      expect((secondCallInit.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });
  });

  describe('Phase M01: Authoritative Delivery & SESv2 Amendment (§8.7 & §7)', () => {
    let service: EmailService;
    let prisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
      vi.clearAllMocks();
      prisma = createMockPrisma();
      service = new EmailService(prisma as never);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('BCC-only external send passes to: [] (empty array) and populated bcc to sendViaSes, never undisclosed-recipients', async () => {
      const mockEmail = {
        id: 'email-bcc-1',
        userId: 'user-1',
        isDraft: true,
        toAddresses: [],
        ccAddresses: [],
        bccAddresses: ['external-bcc@example.com'],
        subject: 'Secret Announcement',
        bodyPlain: 'BCC Only Content',
        fromAddress: 'user-1@quantmail.in',
      };
      prisma.email.findUnique.mockResolvedValue(mockEmail);
      prisma.user.findMany.mockResolvedValue([]); // external recipient
      prisma.email.update.mockResolvedValue({ id: 'email-bcc-1', deliveryStatus: 'delivered' });

      await service.send('user-1', 'email-bcc-1', 'sent-folder-id');

      expect(sesSender.sendViaSes).toHaveBeenCalledTimes(1);
      const sesCallArg = vi.mocked(sesSender.sendViaSes).mock.calls[0][0];

      // CRITICAL SESv2 invariant: to must be empty array, NOT ['undisclosed-recipients:;']
      expect(sesCallArg.to).toEqual([]);
      expect(sesCallArg.to).not.toContain('undisclosed-recipients:;');
      expect(sesCallArg.bcc).toEqual(['external-bcc@example.com']);
    });

    it('CC-only external send does not duplicate CC into to', async () => {
      const mockEmail = {
        id: 'email-cc-1',
        userId: 'user-1',
        isDraft: true,
        toAddresses: [],
        ccAddresses: ['external-cc@example.com'],
        bccAddresses: [],
        subject: 'CC Announcement',
        bodyPlain: 'CC Content',
        fromAddress: 'user-1@quantmail.in',
      };
      prisma.email.findUnique.mockResolvedValue(mockEmail);
      prisma.user.findMany.mockResolvedValue([]); // external
      prisma.email.update.mockResolvedValue({ id: 'email-cc-1', deliveryStatus: 'delivered' });

      await service.send('user-1', 'email-cc-1', 'sent-folder-id');

      expect(sesSender.sendViaSes).toHaveBeenCalledTimes(1);
      const sesCallArg = vi.mocked(sesSender.sendViaSes).mock.calls[0][0];

      // CC addresses remain in cc, to remains empty
      expect(sesCallArg.to).toEqual([]);
      expect(sesCallArg.cc).toEqual(['external-cc@example.com']);
    });

    it('M-F12: send whose enqueue throws with SES unavailable is recorded failed, never queued', async () => {
      vi.mocked(sesSender.isSesConfigured).mockReturnValue(false);

      const mockPipeline = {
        enqueueSend: vi.fn().mockRejectedValue(new Error('Redis connection timeout')),
      };
      const serviceWithFailingPipeline = new EmailService(prisma as never, mockPipeline as never);

      const mockEmail = {
        id: 'email-err-1',
        userId: 'user-1',
        isDraft: true,
        toAddresses: ['external@example.com'],
        fromAddress: 'user-1@quantmail.in',
        subject: 'Urgent',
      };
      prisma.email.findUnique.mockResolvedValue(mockEmail);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.email.update.mockResolvedValue({ id: 'email-err-1', deliveryStatus: 'failed' });

      await serviceWithFailingPipeline.send('user-1', 'email-err-1', 'sent-folder-id');

      expect(prisma.email.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryStatus: 'failed',
          }),
        }),
      );
    });

    it('T4 / M-F15: DeliveryWorker SMTP path excludes BCC addresses from DKIM-signed headers', async () => {
      vi.mocked(sesSender.isSesConfigured).mockReturnValue(false);

      const mockSigner = {
        signMessage: vi.fn().mockReturnValue('DKIM-SIGNED-RAW-EMAIL-OUTPUT'),
      };
      const mockAuth = {
        getDkimSigner: vi.fn().mockResolvedValue(mockSigner),
      };
      const mockSmtpSend = vi
        .fn()
        .mockResolvedValue({ outcome: 'accepted' as const, response: '250 OK' });
      const mockSmtp: SmtpTransport = {
        send: mockSmtpSend,
      };
      const mockMx: DnsMxResolver = {
        resolveMx: vi.fn().mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]),
      };

      const emailRecord = {
        id: 'email-smtp-1',
        userId: 'user-1',
        fromAddress: 'sender@quantmail.in',
        fromName: 'Sender User',
        toAddresses: ['visible-to@example.com'],
        ccAddresses: ['visible-cc@example.com'],
        bccAddresses: ['secret-bcc@example.com'],
        subject: 'Confidential Notice',
        bodyHtml: '<p>Secret</p>',
        bodyPlain: 'Secret',
        isDraft: false,
        isSent: true,
      };

      prisma.email.findUnique.mockResolvedValue(emailRecord);

      const worker = new DeliveryWorker(prisma as never, mockAuth as never, {
        smtp: mockSmtp,
        mx: mockMx,
      });

      const receipt = await worker.processDelivery({
        data: {
          emailId: 'email-smtp-1',
          to: 'visible-to@example.com',
          subject: 'Confidential Notice',
          body: '<p>Secret</p>',
        },
      });

      expect(mockSigner.signMessage).toHaveBeenCalledTimes(1);
      const [headers] = mockSigner.signMessage.mock.calls[0] as [Record<string, string>, string];

      // M-F15 Invariant: headers must only contain visible recipients (To and Cc)
      expect(headers.to).toBe('visible-to@example.com');
      expect(headers.cc).toBe('visible-cc@example.com');
      expect(headers).not.toHaveProperty('bcc');

      // Zero leakage: BCC address must NOT appear anywhere in the signed headers
      for (const [key, value] of Object.entries(headers)) {
        expect(key.toLowerCase()).not.toContain('bcc');
        expect(value).not.toContain('secret-bcc@example.com');
      }

      // But the message is still delivered to all recipients over SMTP envelope (RCPT TO)
      expect(mockSmtpSend).toHaveBeenCalledTimes(3);
      const deliveredRecipients = mockSmtpSend.mock.calls.map(
        (call: any[]) => (call[0] as { recipient: string }).recipient,
      );
      expect(deliveredRecipients).toContain('visible-to@example.com');
      expect(deliveredRecipients).toContain('visible-cc@example.com');
      expect(deliveredRecipients).toContain('secret-bcc@example.com');

      expect(receipt.deliveryStatus).toBe('sent');
    });

    it('T4 / M-F16: DeliveryWorker SES path transmits single authoritative call preserving To, Cc, Bcc, replyTo, and fromName', async () => {
      vi.mocked(sesSender.isSesConfigured).mockReturnValue(true);

      const emailRecord = {
        id: 'email-ses-1',
        userId: 'user-1',
        fromAddress: 'user-1@quantmail.in',
        fromName: 'User One',
        toAddresses: ['to1@example.com', 'to2@example.com'],
        ccAddresses: ['cc1@example.com'],
        bccAddresses: ['bcc1@example.com'],
        subject: 'SES Worker Preservation',
        bodyHtml: '<p>SES Body</p>',
        bodyPlain: 'SES Body',
        isDraft: false,
        isSent: true,
      };

      prisma.email.findUnique.mockResolvedValue(emailRecord);

      const worker = new DeliveryWorker(prisma as never, {} as never, {
        smtp: {} as never,
        mx: {} as never,
      });

      const receipt = await worker.processDelivery({
        data: {
          emailId: 'email-ses-1',
          to: 'to1@example.com',
          subject: 'SES Worker Preservation',
          body: '<p>SES Body</p>',
        },
      });

      // M-F16 Invariant: sendViaSes is called exactly once with complete recipient metadata
      expect(sesSender.sendViaSes).toHaveBeenCalledTimes(1);
      const sesParams = vi.mocked(sesSender.sendViaSes).mock.calls[0][0];

      expect(sesParams.from).toBe('User One <user-1@quantmail.in>');
      expect(sesParams.to).toEqual(['to1@example.com', 'to2@example.com']);
      expect(sesParams.cc).toEqual(['cc1@example.com']);
      expect(sesParams.bcc).toEqual(['bcc1@example.com']);
      expect(sesParams.replyTo).toBe('user-1@quantmail.in');
      expect(sesParams.subject).toBe('SES Worker Preservation');
      expect(sesParams.bodyHtml).toBe('<p>SES Body</p>');
      expect(sesParams.bodyText).toBe('SES Body');

      expect(receipt.deliveryStatus).toBe('sent');
      expect(receipt.recipients).toHaveLength(4);
    });
  });

  describe('Phase M02: Six-Field Draft Preservation (T1 Route Injection)', () => {
    let prisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
      vi.clearAllMocks();
      prisma = createMockPrisma();
    });

    it('T1-1: PUT /emails/:id preserves omitted fields (6 fields) in database update', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      // Autosave sends only 'to' and 'subject', omitting cc, bcc, bodyHtml, bodyText, inReplyTo, threadId
      const payload = {
        to: [{ email: 'initial@test.com' }],
        subject: 'Updated Subject',
      };

      const res = await app.inject({
        method: 'PUT',
        url: '/emails/draft-1',
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.email.update).toHaveBeenCalledTimes(1);

      const updateCall = prisma.email.update.mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: 'draft-1' });

      const data = updateCall.data;
      expect(data.toAddresses).toEqual(['initial@test.com']);
      expect(data.subject).toBe('Updated Subject');

      // Six-field preservation invariant: omitted keys are NOT present in update data
      expect(data).not.toHaveProperty('ccAddresses');
      expect(data).not.toHaveProperty('bccAddresses');
      expect(data).not.toHaveProperty('bodyHtml');
      expect(data).not.toHaveProperty('bodyPlain');
      expect(data).not.toHaveProperty('inReplyTo');
      expect(data).not.toHaveProperty('threadId');

      await app.close();
    });

    it('T1-2: PUT /emails/:id clears explicitly provided empty fields', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      // Explicitly clearing cc, bcc, and body, while leaving inReplyTo and threadId omitted
      const payload = {
        to: [{ email: 'initial@test.com' }],
        subject: 'Initial Subject',
        cc: [],
        bcc: [],
        bodyHtml: '',
        bodyText: '',
      };

      const res = await app.inject({
        method: 'PUT',
        url: '/emails/draft-1',
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.email.update).toHaveBeenCalledTimes(1);

      const data = prisma.email.update.mock.calls[0][0].data;
      expect(data.ccAddresses).toEqual([]);
      expect(data.bccAddresses).toEqual([]);
      expect(data.bodyHtml).toBe('');
      expect(data.bodyPlain).toBe('');

      // inReplyTo & threadId were omitted, so they must NOT be in data
      expect(data).not.toHaveProperty('inReplyTo');
      expect(data).not.toHaveProperty('threadId');

      await app.close();
    });

    it('T1-3: PUT /emails/:id sanitizes HTML content in bodyHtml', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      const payload = {
        to: [{ email: 'initial@test.com' }],
        subject: 'HTML Sanitize Test',
        bodyHtml:
          '<p>Valid content</p><script>alert("xss")</script><style>body{color:red;}</style>',
      };

      const res = await app.inject({
        method: 'PUT',
        url: '/emails/draft-1',
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(prisma.email.update).toHaveBeenCalledTimes(1);

      const data = prisma.email.update.mock.calls[0][0].data;
      expect(data.bodyHtml).toContain('<p>Valid content</p>');
      expect(data.bodyHtml).not.toContain('<script>');
      expect(data.bodyHtml).not.toContain('alert("xss")');

      await app.close();
    });

    it('T1-4: PUT /emails/:id rejects unauthenticated callers with 401', async () => {
      const app = await buildTestFastifyApp(prisma, null); // null userId

      const payload = {
        to: [{ email: 'initial@test.com' }],
        subject: 'Unauthenticated Attempt',
      };

      const res = await app.inject({
        method: 'PUT',
        url: '/emails/draft-1',
        payload,
      });

      expect(res.statusCode).toBe(401);
      expect(prisma.email.update).not.toHaveBeenCalled();

      await app.close();
    });

    it('T1-5: PUT /emails/:id rejects already-sent emails with 409 EMAIL_NOT_EDITABLE', async () => {
      prisma.email.findUnique.mockResolvedValue({
        ...prisma.storedDraft,
        isDraft: false,
        isSent: true,
      });

      const app = await buildTestFastifyApp(prisma, 'user-1');

      const payload = {
        to: [{ email: 'initial@test.com' }],
        subject: 'Attempting to edit sent email',
      };

      const res = await app.inject({
        method: 'PUT',
        url: '/emails/draft-1',
        payload,
      });

      expect(res.statusCode).toBe(409);
      expect(prisma.email.update).not.toHaveBeenCalled();

      await app.close();
    });

    it('M-F09: returns 404 EMAIL_NOT_FOUND (not 403) when email belongs to another user (tenancy oracle elimination)', async () => {
      // Stored email belongs to 'other-tenant-user'
      prisma.email.findUnique.mockResolvedValue({
        ...prisma.storedDraft,
        id: 'foreign-email-1',
        userId: 'other-tenant-user',
      });

      const app = await buildTestFastifyApp(prisma, 'user-1');

      // 1. PUT /emails/:id
      const putRes = await app.inject({
        method: 'PUT',
        url: '/emails/foreign-email-1',
        payload: { to: [{ email: 'target@test.com' }], subject: 'Probe' },
      });
      expect(putRes.statusCode).toBe(404);
      expect(putRes.json().error.code).toBe('EMAIL_NOT_FOUND');

      // 2. POST /emails/:id/send
      const sendRes = await app.inject({
        method: 'POST',
        url: '/emails/foreign-email-1/send',
      });
      expect(sendRes.statusCode).toBe(404);
      expect(sendRes.json().error.code).toBe('EMAIL_NOT_FOUND');

      // 3. POST /emails/:id/archive
      const archiveRes = await app.inject({
        method: 'POST',
        url: '/emails/foreign-email-1/archive',
      });
      expect(archiveRes.statusCode).toBe(404);
      expect(archiveRes.json().error.code).toBe('EMAIL_NOT_FOUND');

      // 4. DELETE /emails/:id
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: '/emails/foreign-email-1',
      });
      expect(deleteRes.statusCode).toBe(404);
      expect(deleteRes.json().error.code).toBe('EMAIL_NOT_FOUND');

      await app.close();
    });

    it('M06: rejects invalid priority with 400 VALIDATION_ERROR on compose and edit', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      // PUT with invalid priority 'critical'
      const putRes = await app.inject({
        method: 'PUT',
        url: '/emails/draft-1',
        payload: {
          to: [{ email: 'initial@test.com' }],
          subject: 'Invalid Priority',
          priority: 'critical',
        },
      });
      expect(putRes.statusCode).toBe(400);

      // POST /emails with invalid priority 'super_urgent'
      const postRes = await app.inject({
        method: 'POST',
        url: '/emails',
        payload: {
          toAddresses: ['initial@test.com'],
          subject: 'Invalid Priority',
          priority: 'super_urgent',
        },
      });
      expect(postRes.statusCode).toBe(400);

      await app.close();
    });

    it('M06: accepts case-insensitive priority and persists uppercase EmailPriority enum', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      // PUT with case-insensitive 'urgent'
      const putRes = await app.inject({
        method: 'PUT',
        url: '/emails/draft-1',
        payload: {
          to: [{ email: 'initial@test.com' }],
          subject: 'Urgent Draft',
          priority: 'urgent',
        },
      });
      expect(putRes.statusCode).toBe(200);
      expect(prisma.email.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: 'URGENT',
          }),
        }),
      );

      // POST /emails with 'high'
      prisma.email.create.mockResolvedValueOnce({
        ...prisma.storedDraft,
        id: 'new-email-1',
        priority: 'HIGH',
      });
      const postRes = await app.inject({
        method: 'POST',
        url: '/emails',
        payload: {
          toAddresses: ['initial@test.com'],
          subject: 'High Priority Email',
          priority: 'high',
        },
      });
      expect(postRes.statusCode).toBe(201);
      expect(prisma.email.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            priority: 'HIGH',
          }),
        }),
      );

      await app.close();
    });

    it('M08: GET /emails and GET /search omit redundant emails key from response envelope', async () => {
      prisma.email.findMany.mockResolvedValueOnce([prisma.storedDraft]);
      prisma.email.count.mockResolvedValue(1);

      const app = await buildTestFastifyApp(prisma, 'user-1');

      // 1. GET /emails
      const getRes = await app.inject({
        method: 'GET',
        url: '/emails',
      });
      expect(getRes.statusCode).toBe(200);
      const getBody = getRes.json();
      expect(getBody.success).toBe(true);
      expect(Array.isArray(getBody.data)).toBe(true);
      expect(getBody).not.toHaveProperty('emails');

      // 2. GET /emails/search
      prisma.email.findMany.mockResolvedValueOnce([prisma.storedDraft]);
      const searchRes = await app.inject({
        method: 'GET',
        url: '/emails/search?q=Initial',
      });
      expect(searchRes.statusCode).toBe(200);
      const searchBody = searchRes.json();
      expect(searchBody.success).toBe(true);
      expect(Array.isArray(searchBody.data)).toBe(true);
      expect(searchBody).not.toHaveProperty('emails');

      await app.close();
    });
  });

  describe('Phase M: Mail Parity Remediations (M-F01–M-F05, M07, M10–M12)', () => {
    let prisma: ReturnType<typeof createMockPrisma>;

    beforeEach(() => {
      vi.clearAllMocks();
      prisma = createMockPrisma();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('M-F01: POST /emails with send: true auto-resolves Sent folder when sentFolderId is omitted', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      const res = await app.inject({
        method: 'POST',
        url: '/emails',
        payload: {
          toAddresses: ['recipient@test.com'],
          subject: 'Auto Sent Folder',
          bodyPlain: 'Test body',
          send: true,
          // sentFolderId is intentionally omitted
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            subject: 'Auto Sent Folder',
          }),
        }),
      );
      // Confirmed getOrCreateFolder looked up the Sent folder
      expect(prisma.emailFolder.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            OR: [{ name: 'Sent' }, { type: 'SENT' }],
          }),
        }),
      );

      await app.close();
    });

    it('M07: POST /emails/compose supports unified contract accepting to array and bodyText', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      const res = await app.inject({
        method: 'POST',
        url: '/emails/compose',
        payload: {
          to: [{ email: 'composer@test.com', name: 'Composer User' }],
          subject: 'Composer Subject',
          bodyText: 'Composer plain text',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.subject).toBe('Composer Subject');
      expect(body.data.to).toEqual([expect.objectContaining({ email: 'composer@test.com' })]);

      await app.close();
    });

    it('M-F02: /:id/read, /:id/star, and DELETE /:id return formatted email records', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      // 1. POST /emails/draft-1/read
      const readRes = await app.inject({
        method: 'POST',
        url: '/emails/draft-1/read',
      });
      expect(readRes.statusCode).toBe(200);
      const readBody = readRes.json();
      expect(readBody.success).toBe(true);
      expect(readBody.data.isRead).toBe(true);
      expect(Array.isArray(readBody.data.to)).toBe(true);

      // 2. POST /emails/draft-1/star
      const starRes = await app.inject({
        method: 'POST',
        url: '/emails/draft-1/star',
      });
      expect(starRes.statusCode).toBe(200);
      const starBody = starRes.json();
      expect(starBody.success).toBe(true);
      expect(starBody.data.isStarred).toBe(true);
      expect(Array.isArray(starBody.data.to)).toBe(true);

      // 3. DELETE /emails/draft-1 (trash)
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: '/emails/draft-1',
      });
      expect(deleteRes.statusCode).toBe(200);
      const deleteBody = deleteRes.json();
      expect(deleteBody.success).toBe(true);
      expect(deleteBody.data.isTrash).toBe(true);
      expect(Array.isArray(deleteBody.data.to)).toBe(true);

      await app.close();
    });

    it('M-F03 & M-F04: POST /:id/reply defaults messageKind to mail and returns 202 with deliveryStatus', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      const replyRes = await app.inject({
        method: 'POST',
        url: '/emails/draft-1/reply',
        payload: {
          body: 'This is my reply message',
        },
      });

      expect(replyRes.statusCode).toBe(202);
      const replyBody = replyRes.json();
      expect(replyBody.success).toBe(true);
      expect(replyBody.data.message).toBe('Email queued for delivery');
      expect(replyBody.data.deliveryStatus).toBe('queued');
      expect(replyBody.data.email).toBeDefined();

      // Verify that the created draft used messageKind 'MAIL'
      expect(prisma.email.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messageKind: 'MAIL',
          }),
        }),
      );

      await app.close();
    });

    it('M-F05: POST /:id/reply deletes orphan draft if outbound send throws', async () => {
      const app = await buildTestFastifyApp(prisma, 'user-1');

      // Make prisma.email.update throw during send
      prisma.email.update.mockImplementation(async ({ where, data }: any) => {
        if (data?.sentAt || data?.isSent) {
          throw new Error('Database transaction write error');
        }
        return { ...prisma.storedDraft, ...data, id: where.id };
      });

      const replyRes = await app.inject({
        method: 'POST',
        url: '/emails/draft-1/reply',
        payload: {
          body: 'This reply will fail to send',
        },
      });

      // Send failure throws 500
      expect(replyRes.statusCode).toBe(500);

      // M-F05: Verify that the orphan draft was cleaned up via prisma.email.delete
      expect(prisma.email.delete).toHaveBeenCalled();

      await app.close();
    });
  });
});
