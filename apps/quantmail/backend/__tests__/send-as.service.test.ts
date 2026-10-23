/**
 * Send-mail-as compose integration (fix/qm-accounts-import-send-as-2).
 *
 * The compose path never trusts a client-supplied From header: EmailService
 * stamps the account's own address unless the caller passes a From the
 * ROUTE already validated (owned + verified send-as identity, resolved by
 * resolveSendAsIdentity in the route handler). These tests pin the service
 * half of that contract:
 *
 *  1. primarySenderFor returns the account's own sender identity and is the
 *     single place compose() and the draft-update path both read it from.
 *  2. compose() stamps a validated send-as override verbatim as the From.
 *  3. A malformed override (no '@') falls back to the account's own address
 *     rather than writing a broken From.
 *  4. With no override, compose() stamps the account's own address — the
 *     behaviour every caller that predates aliases keeps.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Same isolation seam as email.service.test.ts: EmailService.send prunes
// suppressed recipients via the module-level singleton unless the
// constructor-injected suppression port is provided.
vi.mock('../services/drive-storage.service', () => ({
  checkedPlaintext: vi.fn(async (_row: unknown) => Buffer.from('%PDF-1.7 from drive')),
}));

import { EmailService, primarySenderFor } from '../services/email.service';

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
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'Kundan@quantmail.in',
        username: 'kundan',
        displayName: 'Kundan',
      }),
      findMany: vi.fn().mockResolvedValue([]),
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

describe('primarySenderFor', () => {
  it('returns the account email identity', async () => {
    const prisma = createMockPrisma();
    await expect(primarySenderFor(prisma as never, 'user-1')).resolves.toEqual({
      fromAddress: 'Kundan@quantmail.in',
      fromName: 'Kundan',
    });
  });

  it('synthesizes the address from the username when no email is set', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'not-an-email',
      username: 'kundan',
      displayName: null,
    });
    const identity = await primarySenderFor(prisma as never, 'user-1');
    expect(identity.fromAddress).toContain('kundan@');
    expect(identity.fromName).toBe('kundan');
  });

  it('400s when the user has no usable sender identity', async () => {
    const prisma = createMockPrisma();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: null, username: null });
    await expect(primarySenderFor(prisma as never, 'user-1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('EmailService.compose send-as override', () => {
  let service: EmailService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const composeInput = (extra: Record<string, unknown> = {}) => ({
    userId: 'user-1',
    toAddresses: ['recipient@test.com'],
    subject: 'Test Subject',
    bodyHtml: '<p>Hello</p>',
    bodyPlain: 'Hello',
    ...extra,
  });

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new EmailService(prisma as never, undefined, createAllowAllSuppression());
    prisma.email.create.mockImplementation(async (args: any) => ({
      id: 'email-1',
      ...args.data,
    }));
  });

  it('stamps the account own address when no override is given', async () => {
    const email = await service.compose(composeInput());
    expect(email.fromAddress).toBe('Kundan@quantmail.in');
    expect(email.fromName).toBe('Kundan');
  });

  it('stamps a validated send-as override verbatim as the From', async () => {
    // The route validated ownership + verification before calling; the
    // service stamps verbatim.
    const email = await service.compose(
      composeInput({ fromAddress: 'kundan@other-domain.com', fromName: 'Kundan Other' }),
    );
    expect(email.fromAddress).toBe('kundan@other-domain.com');
    expect(email.fromName).toBe('Kundan Other');
  });

  it('falls back to the account address on a malformed override', async () => {
    const email = await service.compose(composeInput({ fromAddress: 'not-an-address' }));
    expect(email.fromAddress).toBe('Kundan@quantmail.in');
  });
});
