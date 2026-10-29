/**
 * fix/qm-accounts-import-corrective-3 — the mandatory corrective owed by
 * CODEX-REVIEW 6377798303 on blocked PR #1518.
 *
 * #1518 stamped only fromAddress/fromName strings at compose/update time:
 *  - the principal /compose journey dropped sendAsId on the host-callback
 *    path (EmailComposer's onSend/onSaveDraft payloads; compose/page.tsx's
 *    adapter) — fixed on the client; these tests pin the server half;
 *  - the authoritative identity id was never persisted, so a revoke/delete
 *    between draft creation and send was invisible — fail-OPEN;
 *  - internal copies (deliverInternally) always stamped the sender's own
 *    address, so an alias send showed different From to internal vs
 *    external recipients;
 *  - nothing bound the alias to a real transport.
 *
 * Properties pinned here (service level, offline mocks — the enforcement
 * lives in EmailService and the route handlers):
 *  1. compose() persists the authoritative sendAsIdentityId (null = primary).
 *  2. reauthorizeSendAsIdentity is fail-closed: unknown, foreign and
 *     unverified ids all 403 SEND_AS_REVOKED; verified returns the CURRENT
 *     identity values.
 *  3. send() denies a revoked/deleted identity BEFORE the flip: 403
 *     SEND_AS_REVOKED, no Sent flip, no outbox event, no transmit.
 *  4. send() stamps the identity's CURRENT email/displayName on the flip,
 *     so a renamed alias sends with the fresh values.
 *  5. deliverInternally stamps the authoritative From on recipient copies —
 *     internal and external recipients see the identical From.
 *  6. SES rejection of the alias defers honestly (no fake "sent") and the
 *     failure names the alias that caused it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// deliverInternally copies QuantDrive picks per recipient; the Drive read
// itself is stubbed, like the sibling suites.
vi.mock('../services/drive-storage.service', () => ({
  checkedPlaintext: vi.fn(async (_row: unknown) => Buffer.from('%PDF-1.7 from drive')),
}));

// Thread stitching inside deliverInternally is a real DB read; stub it so the
// From-stamping under test is what the test observes.
vi.mock('../services/thread.service', () => ({
  ThreadService: class {
    constructor(_prisma: unknown) {}
    stitchInbound = vi.fn(async () => 'thread-1');
  },
}));

// Recipient filters must not need a real MailFilterService in this suite.
vi.mock('../services/mail-filter.service', () => ({
  MailFilterService: class {
    constructor(_prisma: unknown) {}
    computeActions = vi.fn(async () => ({ matchedFilterIds: [] }));
  },
}));

const sesMocks = vi.hoisted(() => ({
  sendViaSes: vi.fn(),
  isSesConfigured: vi.fn(() => false),
}));
vi.mock('../lib/ses-sender', () => ({
  sendViaSes: sesMocks.sendViaSes,
  isSesConfigured: sesMocks.isSesConfigured,
}));

import { EmailService } from '../services/email.service';
import { reauthorizeSendAsIdentity } from '../services/send-as-identity.service';

function createMockPrisma() {
  const mock = {
    email: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn(),
    },
    emailFolder: {
      findFirst: vi.fn().mockResolvedValue({ id: 'inbox-folder' }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'kundan@quantmail.in',
        username: 'kundan',
        displayName: 'Kundan',
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    sendAsIdentity: {
      findUnique: vi.fn(),
    },
    label: { findMany: vi.fn() },
    outboxEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'outbox-1',
        publishedAt: null,
        createdAt: new Date(),
        ...args.data,
      })),
    },
    $transaction: null as unknown as ReturnType<typeof vi.fn>,
  };
  mock.$transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock));
  return mock;
}

function createAllowAllSuppression() {
  return {
    filterAllowedRecipients: vi.fn().mockImplementation(async (recipients: string[]) => ({
      allowed: recipients,
      suppressed: [],
    })),
  };
}

function createWorkingPipeline() {
  return {
    enqueueSend: vi.fn().mockResolvedValue('job-1'),
    cancelSend: vi.fn().mockResolvedValue(undefined),
  };
}

const VERIFIED_ALIAS = {
  id: 'alias-1',
  userId: 'user-1',
  email: 'kundan@other-domain.com',
  displayName: 'Kundan Alias',
  verifiedAt: new Date('2026-10-20T00:00:00Z'),
};

describe('compose() persists the authoritative send-as identity id', () => {
  let service: EmailService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmailService(prisma as never, undefined, createAllowAllSuppression());
    prisma.email.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'email-1',
      ...args.data,
    }));
  });

  it('persists sendAsIdentityId alongside the stamped From strings', async () => {
    const email = await service.compose({
      userId: 'user-1',
      toAddresses: ['recipient@test.com'],
      subject: 's',
      bodyPlain: 'b',
      fromAddress: 'kundan@other-domain.com',
      fromName: 'Kundan Alias',
      sendAsId: 'alias-1',
    });
    expect(email.fromAddress).toBe('kundan@other-domain.com');
    expect((email as { sendAsIdentityId?: string | null }).sendAsIdentityId).toBe('alias-1');
  });

  it('persists sendAsIdentityId = null when no identity is in play', async () => {
    const email = await service.compose({
      userId: 'user-1',
      toAddresses: ['recipient@test.com'],
      subject: 's',
      bodyPlain: 'b',
    });
    expect((email as { sendAsIdentityId?: string | null }).sendAsIdentityId).toBeNull();
  });
});

describe('reauthorizeSendAsIdentity is fail-closed', () => {
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
  });

  it('returns the CURRENT identity values when verified and owned', async () => {
    prisma.sendAsIdentity.findUnique.mockResolvedValue(VERIFIED_ALIAS);
    await expect(reauthorizeSendAsIdentity(prisma as never, 'user-1', 'alias-1')).resolves.toEqual({
      id: 'alias-1',
      email: 'kundan@other-domain.com',
      displayName: 'Kundan Alias',
    });
  });

  it('403 SEND_AS_REVOKED on an unknown id', async () => {
    prisma.sendAsIdentity.findUnique.mockResolvedValue(null);
    await expect(reauthorizeSendAsIdentity(prisma as never, 'user-1', 'nope')).rejects.toMatchObject(
      { statusCode: 403, code: 'SEND_AS_REVOKED' },
    );
  });

  it("403 SEND_AS_REVOKED on another user's identity (no cross-user send-as)", async () => {
    prisma.sendAsIdentity.findUnique.mockResolvedValue({ ...VERIFIED_ALIAS, userId: 'user-2' });
    await expect(
      reauthorizeSendAsIdentity(prisma as never, 'user-1', 'alias-1'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SEND_AS_REVOKED' });
  });

  it('403 SEND_AS_REVOKED on a row that lost verification', async () => {
    prisma.sendAsIdentity.findUnique.mockResolvedValue({ ...VERIFIED_ALIAS, verifiedAt: null });
    await expect(
      reauthorizeSendAsIdentity(prisma as never, 'user-1', 'alias-1'),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SEND_AS_REVOKED' });
  });
});

describe('send() enforces revocation at send time (fail-closed)', () => {
  let service: EmailService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const draftWithAlias = () => ({
    id: 'email-1',
    userId: 'user-1',
    isDraft: true,
    isSent: false,
    toAddresses: ['recipient@test.com'],
    ccAddresses: [],
    bccAddresses: [],
    subject: 's',
    bodyPlain: 'b',
    bodyHtml: '<p>b</p>',
    fromAddress: 'kundan@other-domain.com',
    fromName: 'Kundan Alias',
    sendAsIdentityId: 'alias-1',
  });

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmailService(prisma as never, createWorkingPipeline() as never, createAllowAllSuppression());
  });

  it('denies a draft whose identity was deleted — no flip, no outbox, no transmit', async () => {
    prisma.email.findUnique.mockResolvedValue(draftWithAlias());
    prisma.sendAsIdentity.findUnique.mockResolvedValue(null);

    const err = await service.send('user-1', 'email-1', 'sent-folder-id').then(
      () => null,
      (e: unknown) => e as { statusCode?: number; code?: string },
    );

    expect(err).toMatchObject({ statusCode: 403, code: 'SEND_AS_REVOKED' });
    // Fail-closed BEFORE the flip: the draft stays a draft.
    expect(prisma.email.updateMany).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('denies a draft whose identity lost verification after the draft was written', async () => {
    prisma.email.findUnique.mockResolvedValue(draftWithAlias());
    prisma.sendAsIdentity.findUnique.mockResolvedValue({ ...VERIFIED_ALIAS, verifiedAt: null });

    const err = await service.send('user-1', 'email-1', 'sent-folder-id').then(
      () => null,
      (e: unknown) => e as { statusCode?: number; code?: string },
    );

    expect(err).toMatchObject({ statusCode: 403, code: 'SEND_AS_REVOKED' });
    expect(prisma.email.updateMany).not.toHaveBeenCalled();
  });

  it("denies an identity owned by another user even when the draft row names it", async () => {
    prisma.email.findUnique.mockResolvedValue(draftWithAlias());
    prisma.sendAsIdentity.findUnique.mockResolvedValue({ ...VERIFIED_ALIAS, userId: 'user-2' });

    const err = await service.send('user-1', 'email-1', 'sent-folder-id').then(
      () => null,
      (e: unknown) => e as { statusCode?: number; code?: string },
    );

    expect(err).toMatchObject({ statusCode: 403, code: 'SEND_AS_REVOKED' });
  });

  it('stamps the identity CURRENT values on the flip (a renamed alias sends fresh)', async () => {
    const renamed = { ...VERIFIED_ALIAS, displayName: 'Kundan New Name' };
    const draft = draftWithAlias();
    const flipped = { ...draft, isDraft: false, isSent: true, folderId: 'sent-folder-id' };
    prisma.email.findUnique.mockResolvedValueOnce(draft).mockResolvedValue(flipped);
    prisma.sendAsIdentity.findUnique.mockResolvedValue(renamed);

    await service.send('user-1', 'email-1', 'sent-folder-id');

    const flipCall = prisma.email.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(flipCall.data['fromAddress']).toBe('kundan@other-domain.com');
    expect(flipCall.data['fromName']).toBe('Kundan New Name');
  });

  it('sends as the row strings when no identity is in play (unchanged primary path)', async () => {
    const draft = { ...draftWithAlias(), sendAsIdentityId: null };
    const flipped = { ...draft, isDraft: false, isSent: true, folderId: 'sent-folder-id' };
    prisma.email.findUnique.mockResolvedValueOnce(draft).mockResolvedValue(flipped);

    await service.send('user-1', 'email-1', 'sent-folder-id');

    // No identity lookup at all on the primary path.
    expect(prisma.sendAsIdentity.findUnique).not.toHaveBeenCalled();
    const flipCall = prisma.email.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(flipCall.data['fromAddress']).toBe('kundan@other-domain.com');
  });
});

describe('deliverInternally carries the authoritative From (identical internal/external)', () => {
  let service: EmailService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmailService(prisma as never, undefined, createAllowAllSuppression());
    // One internal recipient: the QuantMail user the alias mail is sent to.
    prisma.user.findMany.mockResolvedValue([{ id: 'user-2', email: 'peer@quantmail.in', username: 'peer' }]);
    prisma.email.create.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
      id: 'copy-1',
      ...args.data,
    }));
  });

  it('stamps the alias From on the recipient copy when provided', async () => {
    const delivered = await service.deliverInternally({
      fromUserId: 'user-1',
      subject: 's',
      bodyPlain: 'b',
      toAddresses: ['peer@quantmail.in'],
      fromAddress: 'kundan@other-domain.com',
      fromName: 'Kundan Alias',
    });

    expect(delivered).toBe(1);
    const copyData = prisma.email.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(copyData['fromAddress']).toBe('kundan@other-domain.com');
    expect(copyData['fromName']).toBe('Kundan Alias');
  });

  it('stamps the sender own address when no override is provided (unchanged)', async () => {
    const delivered = await service.deliverInternally({
      fromUserId: 'user-1',
      subject: 's',
      bodyPlain: 'b',
      toAddresses: ['peer@quantmail.in'],
    });

    expect(delivered).toBe(1);
    const copyData = prisma.email.create.mock.calls[0][0].data as Record<string, unknown>;
    expect(copyData['fromAddress']).toBe('kundan@quantmail.in');
  });
});

describe('SES rejection of the alias fails honestly (no fake sent)', () => {
  let service: EmailService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    // Direct SES path: no pipeline, SES configured, external recipient.
    sesMocks.isSesConfigured.mockReturnValue(true);
    sesMocks.sendViaSes.mockRejectedValue(new Error('MessageRejected: Email address is not verified'));
    service = new EmailService(prisma as never, undefined, createAllowAllSuppression());
  });

  it('defers (never delivers) and names the alias that SES rejected', async () => {
    const draft = {
      id: 'email-1',
      userId: 'user-1',
      isDraft: true,
      isSent: false,
      toAddresses: ['someone@gmail.com'],
      ccAddresses: [],
      bccAddresses: [],
      subject: 's',
      bodyPlain: 'b',
      bodyHtml: '',
      fromAddress: 'kundan@other-domain.com',
      fromName: 'Kundan Alias',
      sendAsIdentityId: 'alias-1',
      messageId: null,
      receivedAt: null,
    };
    const flipped = { ...draft, isDraft: false, isSent: true, deliveryStatus: 'queued' };
    const deferred = { ...flipped, deliveryStatus: 'deferred' };
    prisma.email.findUnique
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce(flipped)
      .mockResolvedValue(deferred);
    prisma.sendAsIdentity.findUnique.mockResolvedValue(VERIFIED_ALIAS);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await service.send('user-1', 'email-1', 'sent-folder-id');
      expect(result.deliveryStatus).toBe('deferred');
      expect(result.deliveryStatus).not.toBe('delivered');
      // The SES call really went out with the ALIAS on the envelope.
      const sesCall = sesMocks.sendViaSes.mock.calls[0][0] as { from?: string };
      expect(sesCall.from).toContain('kundan@other-domain.com');
      // And the honest failure names the alias that caused it.
      const logged = consoleSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('kundan@other-domain.com');
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
