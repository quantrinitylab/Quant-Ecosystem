import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SuppressionService } from '../services/suppression.service';
import { createMockSuppressionDb } from './helpers/suppression-doubles';

describe('Gate 4: SuppressionService (Hard-Block Bounces & Complaints)', () => {
  let db: ReturnType<typeof createMockSuppressionDb>;
  let service: SuppressionService;

  beforeEach(() => {
    db = createMockSuppressionDb();
    service = new SuppressionService(db as any);
  });

  it('normalizes email addresses (trims and lowercases)', () => {
    expect(service.normalizeEmail('  User.Test@Example.COM  ')).toBe('user.test@example.com');
  });

  it('suppresses an email on bounce with details and prevents subsequent sending', async () => {
    const row = await service.suppress('bounced@badhost.com', 'BOUNCE', 'SNS', {
      smtpCode: 550,
      description: 'Mailbox does not exist',
    });

    expect(row.email).toBe('bounced@badhost.com');
    expect(row.reason).toBe('BOUNCE');
    expect(await service.isSuppressed('bounced@badhost.com')).toBe(true);
    expect(await service.isSuppressed('BOUNCED@badhost.com')).toBe(true); // Case-insensitive
  });

  it('returns false for unsuppressed email', async () => {
    expect(await service.isSuppressed('clean@recipient.org')).toBe(false);
  });

  it('unsuppresses an email idempotently', async () => {
    await service.suppress('test@domain.com', 'COMPLAINT', 'SNS');
    expect(await service.isSuppressed('test@domain.com')).toBe(true);

    await service.unsuppress('test@domain.com');
    expect(await service.isSuppressed('test@domain.com')).toBe(false);

    // Deleting again does not throw
    await expect(service.unsuppress('test@domain.com')).resolves.toBeUndefined();
  });

  it('filters a batch of recipients into allowed and suppressed partitions', async () => {
    await service.suppress('spam-complaint@victim.com', 'COMPLAINT', 'SNS');
    await service.suppress('hard-bounce@invalid.com', 'BOUNCE', 'SNS');

    const result = await service.filterAllowedRecipients([
      'good1@company.com',
      'SPAM-COMPLAINT@victim.com',
      'good2@startup.io',
      'hard-bounce@invalid.com',
    ]);

    expect(result.allowed).toEqual(['good1@company.com', 'good2@startup.io']);
    expect(result.suppressed).toEqual(['spam-complaint@victim.com', 'hard-bounce@invalid.com']);
  });

  it('lists suppressed emails by reason and counts them', async () => {
    await service.suppress('b1@test.com', 'BOUNCE', 'SNS');
    await service.suppress('c1@test.com', 'COMPLAINT', 'SNS');
    await service.suppress('b2@test.com', 'BOUNCE', 'SNS');

    const all = await service.list();
    expect(all.length).toBe(3);

    const bounces = await service.list({ reason: 'BOUNCE' });
    expect(bounces.length).toBe(2);

    expect(await service.count()).toBe(3);
  });

  it('EmailService.send throws 422 RECIPIENT_SUPPRESSED when all external recipients are on suppression list', async () => {
    const { EmailService } = await import('../services/email.service');
    await service.suppress('blocked-user@badhost.org', 'BOUNCE', 'SNS');

    const fakePrisma = {
      email: {
        findUnique: vi.fn(async () => ({
          id: 'email_suppressed_1',
          userId: 'user_sender_1',
          isDraft: true,
          isSent: false,
          toAddresses: ['blocked-user@badhost.org'],
          ccAddresses: [],
          bccAddresses: [],
          subject: 'Outbound to suppressed recipient',
          bodyPlain: 'Hello',
          fromAddress: 'sender@quantmail.in',
        })),
        update: vi.fn(async ({ data }: any) => data),
      },
      user: {
        findUnique: vi.fn(async () => ({
          id: 'user_sender_1',
          email: 'sender@quantmail.in',
          username: 'sender',
          displayName: 'Sender',
        })),
        findMany: vi.fn(async () => []),
      },
    };

    const emailService = new EmailService(fakePrisma as any, undefined, service);
    await expect(
      emailService.send('user_sender_1', 'email_suppressed_1', 'sent_folder_1'),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'RECIPIENT_SUPPRESSED',
    });
  });
});
