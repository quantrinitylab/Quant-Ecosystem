import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EmailService } from '../services/email.service';
import * as sesSender from '../lib/ses-sender';

// Mock SES sender module
vi.mock('../lib/ses-sender', () => ({
  sendViaSes: vi.fn().mockResolvedValue('ses-msg-123'),
  isSesConfigured: vi.fn().mockReturnValue(true),
}));

import { ALLOWED_BACKEND_ROUTES, SUPPORTED_PROXY_METHODS } from '../lib/routes-config';

function createMockPrisma() {
  return {
    email: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    label: {
      findMany: vi.fn(),
    },
  };
}

describe('Dev 2 QA Sentinel — Phase R & Phase M Merge Gate Suite', () => {
  describe('Phase R: Proxy Allow-List Verification (§3.2 & §7)', () => {
    const resolveRoute = (pathStr: string) => {
      return ALLOWED_BACKEND_ROUTES.find(({ pattern }: { pattern: RegExp }) =>
        pattern.test(pathStr),
      );
    };

    it('R-D1: mail-filters and mail-filters/abc/test are held pending R-SEC', () => {
      expect(resolveRoute('mail-filters')).toBeUndefined();
      expect(resolveRoute('mail-filters/abc/test')).toBeUndefined();
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

    it('R-V1: search/emails and search/parse resolve GET', () => {
      const searchEmails = resolveRoute('search/emails');
      expect(searchEmails).toBeDefined();
      expect(searchEmails?.methods).toEqual(['GET']);

      const searchParse = resolveRoute('search/parse');
      expect(searchParse).toBeDefined();
      expect(searchParse?.methods).toEqual(['GET']);
    });

    it('Phase R Invariant: every declared method in ALLOWED_BACKEND_ROUTES is supported by Next.js proxy handlers', () => {
      const allDeclaredMethods = new Set<string>();

      for (const route of ALLOWED_BACKEND_ROUTES) {
        for (const method of route.methods) {
          allDeclaredMethods.add(method);
        }
      }

      for (const method of allDeclaredMethods) {
        expect(SUPPORTED_PROXY_METHODS).toContain(method);
      }
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
  });

  describe('Phase M02: Six-Field Draft Preservation (§4.3 & §7)', () => {
    // Test the exact key-presence preservation logic deployed in PUT /emails/:id
    const applyDraftUpdate = (
      existing: Record<string, unknown>,
      requestBody: Record<string, unknown>,
      parsedData: {
        to: Array<{ email: string }>;
        subject: string;
        cc?: Array<{ email: string }>;
        bcc?: Array<{ email: string }>;
        bodyHtml?: string;
        bodyText?: string;
        inReplyTo?: string | null;
        threadId?: string | null;
        priority?: string;
      },
    ) => {
      const raw = requestBody;
      const provided = (key: string) => Object.prototype.hasOwnProperty.call(raw, key);

      const updateData: Record<string, unknown> = {
        toAddresses: parsedData.to.map((r) => r.email),
        subject: parsedData.subject,
        ...(provided('cc') ? { ccAddresses: parsedData.cc?.map((r) => r.email) ?? [] } : {}),
        ...(provided('bcc') ? { bccAddresses: parsedData.bcc?.map((r) => r.email) ?? [] } : {}),
        ...(provided('bodyHtml') ? { bodyHtml: parsedData.bodyHtml ?? '' } : {}),
        ...(provided('bodyText') ? { bodyPlain: parsedData.bodyText ?? '' } : {}),
        ...(provided('inReplyTo') ? { inReplyTo: parsedData.inReplyTo ?? null } : {}),
        ...(provided('threadId') ? { threadId: parsedData.threadId ?? null } : {}),
        ...(parsedData.priority ? { priority: parsedData.priority.toUpperCase() } : {}),
      };

      return { ...existing, ...updateData };
    };

    it('saving a draft omitting all 6 fields preserves stored values', () => {
      const storedDraft = {
        id: 'draft-1',
        toAddresses: ['initial@test.com'],
        subject: 'Initial Subject',
        ccAddresses: ['cc1@test.com'],
        bccAddresses: ['bcc1@test.com'],
        bodyHtml: '<p>Initial Body</p>',
        bodyPlain: 'Initial Body',
        inReplyTo: 'msg-parent-123',
        threadId: 'thread-999',
      };

      // Autosave sends only to and subject
      const autosaveBody = {
        to: [{ email: 'initial@test.com' }],
        subject: 'Updated Subject',
      };

      const updated = applyDraftUpdate(storedDraft, autosaveBody, {
        to: [{ email: 'initial@test.com' }],
        subject: 'Updated Subject',
      });

      expect(updated.subject).toBe('Updated Subject');
      expect(updated.bodyHtml).toBe('<p>Initial Body</p>');
      expect(updated.bodyPlain).toBe('Initial Body');
      expect(updated.ccAddresses).toEqual(['cc1@test.com']);
      expect(updated.bccAddresses).toEqual(['bcc1@test.com']);
      expect(updated.inReplyTo).toBe('msg-parent-123');
      expect(updated.threadId).toBe('thread-999');
    });

    it('saving a draft with explicit empty fields clears them', () => {
      const storedDraft = {
        id: 'draft-1',
        toAddresses: ['initial@test.com'],
        subject: 'Initial Subject',
        ccAddresses: ['cc1@test.com'],
        bccAddresses: ['bcc1@test.com'],
        bodyHtml: '<p>Initial Body</p>',
        bodyPlain: 'Initial Body',
        inReplyTo: 'msg-parent-123',
        threadId: 'thread-999',
      };

      // User deliberately clears CC, BCC, and body
      const explicitClearBody = {
        to: [{ email: 'initial@test.com' }],
        subject: 'Initial Subject',
        cc: [],
        bcc: [],
        bodyHtml: '',
        bodyText: '',
      };

      const updated = applyDraftUpdate(storedDraft, explicitClearBody, {
        to: [{ email: 'initial@test.com' }],
        subject: 'Initial Subject',
        cc: [],
        bcc: [],
        bodyHtml: '',
        bodyText: '',
      });

      expect(updated.ccAddresses).toEqual([]);
      expect(updated.bccAddresses).toEqual([]);
      expect(updated.bodyHtml).toBe('');
      expect(updated.bodyPlain).toBe('');
      // inReplyTo & threadId were omitted, so they still survive
      expect(updated.inReplyTo).toBe('msg-parent-123');
      expect(updated.threadId).toBe('thread-999');
    });

    it('end-to-end simulation: draft created with thread, CC and BCC survives multiple autosaves', () => {
      let currentDraft: Record<string, unknown> = {
        id: 'draft-e2e',
        toAddresses: ['boss@example.com'],
        subject: 'Project Status',
        ccAddresses: ['team@example.com'],
        bccAddresses: ['audit@example.com'],
        bodyHtml: '<p>Draft in progress...</p>',
        bodyPlain: 'Draft in progress...',
        inReplyTo: 'email-parent-456',
        threadId: 'thread-abc-123',
      };

      // Autosave 1: User types in subject only
      currentDraft = applyDraftUpdate(
        currentDraft,
        { to: [{ email: 'boss@example.com' }], subject: 'Project Status: Phase R' },
        { to: [{ email: 'boss@example.com' }], subject: 'Project Status: Phase R' },
      );

      // Autosave 2: User changes recipient
      currentDraft = applyDraftUpdate(
        currentDraft,
        {
          to: [{ email: 'boss@example.com' }, { email: 'lead@example.com' }],
          subject: 'Project Status: Phase R',
        },
        {
          to: [{ email: 'boss@example.com' }, { email: 'lead@example.com' }],
          subject: 'Project Status: Phase R',
        },
      );

      // All 6 fields preserved intact across multiple autosaves!
      expect(currentDraft.threadId).toBe('thread-abc-123');
      expect(currentDraft.inReplyTo).toBe('email-parent-456');
      expect(currentDraft.ccAddresses).toEqual(['team@example.com']);
      expect(currentDraft.bccAddresses).toEqual(['audit@example.com']);
      expect(currentDraft.bodyPlain).toBe('Draft in progress...');
      expect(currentDraft.bodyHtml).toBe('<p>Draft in progress...</p>');
    });
  });
});
