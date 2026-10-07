// ============================================================================
// SMTP Submission Daemon - Envelope, Anti-Spoofing & Bcc Stripping Tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractEmailAddress,
  isAuthorizedSender,
  verifySenderIdentity,
  stripBccHeaders,
  injectTraceHeader,
  sanitizeAndTraceMime,
} from '../src/envelope';
import { OutboundSubmissionQueue } from '../src/queue';
import type { AuthenticatedUser } from '../src/auth';

describe('extractEmailAddress', () => {
  it('extracts pure address from <user@domain.com>', () => {
    expect(extractEmailAddress('<alice@quantmail.in>')).toBe('alice@quantmail.in');
  });

  it('extracts address from formatted name "Alice Quant <alice@quantmail.in>"', () => {
    expect(extractEmailAddress('Alice Quant <alice@quantmail.in>')).toBe('alice@quantmail.in');
  });

  it('handles raw email address with whitespace and casing', () => {
    expect(extractEmailAddress('  BOB@QuantMail.in ')).toBe('bob@quantmail.in');
  });
});

describe('isAuthorizedSender & verifySenderIdentity (Anti-Spoofing)', () => {
  const user: AuthenticatedUser = {
    id: 'user_123',
    email: 'alice@quantmail.in',
    username: 'alice',
    displayName: 'Alice Q',
    activeAliases: ['support@quantmail.in', 'team-lead@quantmail.in'],
  };

  it('allows sender matching exact primary email address', () => {
    expect(isAuthorizedSender(user, 'alice@quantmail.in')).toBe(true);
    const res = verifySenderIdentity(user, '<alice@quantmail.in>');
    expect(res.valid).toBe(true);
  });

  it('allows sender with RFC 5233 plus-addressing subaddress', () => {
    expect(isAuthorizedSender(user, 'alice+newsletter@quantmail.in')).toBe(true);
    expect(isAuthorizedSender(user, 'alice+work.projects@quantmail.in')).toBe(true);
    const res = verifySenderIdentity(user, 'alice+billing@quantmail.in');
    expect(res.valid).toBe(true);
  });

  it('allows sender matching verified active aliases', () => {
    expect(isAuthorizedSender(user, 'support@quantmail.in')).toBe(true);
    expect(isAuthorizedSender(user, 'support+urgent@quantmail.in')).toBe(true);
    expect(isAuthorizedSender(user, 'team-lead@quantmail.in')).toBe(true);
  });

  it('rejects spoofed sender with 550 5.7.1 Sender identity mismatch', () => {
    const res = verifySenderIdentity(user, 'ceo@company.com');
    expect(res.valid).toBe(false);
    expect(res.error).toBe('550 5.7.1 Sender identity mismatch');
  });

  it('rejects attempt to spoof another internal user', () => {
    const res = verifySenderIdentity(user, 'bob@quantmail.in');
    expect(res.valid).toBe(false);
    expect(res.error).toBe('550 5.7.1 Sender identity mismatch');
  });

  it('rejects unauthenticated session with 530 5.7.0 Authentication required', () => {
    const res = verifySenderIdentity(null, 'alice@quantmail.in');
    expect(res.valid).toBe(false);
    expect(res.error).toBe('530 5.7.0 Authentication required');
  });
});

describe('stripBccHeaders (P1-03 Leak Fix)', () => {
  it('strips single-line Bcc header completely', () => {
    const mime =
      'From: alice@quantmail.in\r\n' +
      'To: bob@quantmail.in\r\n' +
      'Bcc: secret-observer@external.com\r\n' +
      'Subject: Confidential Roadmap\r\n' +
      '\r\n' +
      'Hello Bob,\r\n' +
      'Here is the secret plan.\r\n';

    const sanitized = stripBccHeaders(mime);

    expect(sanitized).not.toContain('secret-observer@external.com');
    expect(sanitized).not.toContain('Bcc:');
    expect(sanitized).toContain('To: bob@quantmail.in');
    expect(sanitized).toContain('Subject: Confidential Roadmap');
    expect(sanitized).toContain('Here is the secret plan.');
  });

  it('strips multiline folded Bcc headers with tab/space continuations', () => {
    const mime =
      'From: alice@quantmail.in\r\n' +
      'To: bob@quantmail.in\r\n' +
      'Bcc: secret1@external.com,\r\n' +
      '    secret2@external.com,\r\n' +
      '\tsecret3@external.com\r\n' +
      'Subject: Multi-BCC Test\r\n' +
      '\r\n' +
      'Message body content.\r\n';

    const sanitized = stripBccHeaders(mime);

    expect(sanitized).not.toContain('secret1@external.com');
    expect(sanitized).not.toContain('secret2@external.com');
    expect(sanitized).not.toContain('secret3@external.com');
    expect(sanitized).not.toContain('Bcc:');
    expect(sanitized).toContain('Subject: Multi-BCC Test');
    expect(sanitized).toContain('Message body content.');
  });

  it('preserves other headers including CC and custom X- headers', () => {
    const mime =
      'From: alice@quantmail.in\r\n' +
      'To: bob@quantmail.in\r\n' +
      'Cc: charlie@quantmail.in\r\n' +
      'Bcc: hidden@quantmail.in\r\n' +
      'X-Quant-Priority: High\r\n' +
      '\r\n' +
      'Body with Bcc mentioned in text: do not strip this Bcc word.\r\n';

    const sanitized = stripBccHeaders(mime);

    expect(sanitized).toContain('Cc: charlie@quantmail.in');
    expect(sanitized).toContain('X-Quant-Priority: High');
    expect(sanitized).not.toContain('hidden@quantmail.in');
    expect(sanitized).toContain('do not strip this Bcc word.');
  });
});

describe('injectTraceHeader', () => {
  it('prepends RFC 6409 ESMTPSA trace header', () => {
    const mime = 'From: alice@quantmail.in\r\nTo: bob@quantmail.in\r\n\r\nHello';
    const traced = injectTraceHeader(mime, {
      clientAddress: '198.51.100.42',
      clientHostname: 'mail-client.local',
      messageId: 'msg-9999',
      envelopeTo: ['bob@quantmail.in'],
      submissionHost: 'submission.quantmail.in',
      date: new Date('2026-09-23T12:00:00Z'),
    });

    expect(traced).toMatch(/^Received: from mail-client\.local \(198\.51\.100\.42\)/);
    expect(traced).toContain('by submission.quantmail.in with ESMTPSA (QuantMail Submission)');
    expect(traced).toContain('id <msg-9999>');
    expect(traced).toContain('for <bob@quantmail.in>');
  });

  it('sanitizeAndTraceMime combines stripping and trace injection', () => {
    const raw =
      'From: alice@quantmail.in\r\n' +
      'To: bob@quantmail.in\r\n' +
      'Bcc: audit@quantmail.in\r\n' +
      '\r\n' +
      'Test Content';

    const session: any = {
      remoteAddress: '127.0.0.1',
      clientHostname: 'localhost',
      hostNameAppearsAs: 'localhost',
      envelope: {
        rcptTo: [{ address: 'bob@quantmail.in' }, { address: 'audit@quantmail.in' }],
        mailFrom: { address: 'alice@quantmail.in' },
      },
    };

    const result = sanitizeAndTraceMime(raw, session, 'test-msg-id');

    expect(result).not.toContain('Bcc: audit@quantmail.in');
    expect(result).toContain('Received: from localhost (127.0.0.1)');
    expect(result).toContain('by submission.quantmail.in');
    expect(result).toContain('Test Content');
  });
});

describe('OutboundSubmissionQueue', () => {
  let mockQueue: any;
  let mockPrisma: any;
  let queueService: OutboundSubmissionQueue;

  beforeEach(() => {
    mockQueue = {
      add: vi.fn().mockResolvedValue('bullmq-job-uuid-1'),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      emailFolder: {
        findFirst: vi.fn().mockResolvedValue({ id: 'sent-folder-id' }),
      },
      email: {
        create: vi.fn().mockImplementation((args) => Promise.resolve({ id: args.data.id })),
      },
    };

    queueService = new OutboundSubmissionQueue(mockQueue, mockPrisma);
  });

  it('persists queued email and enqueues SendEmailJob to BullMQ', async () => {
    const result = await queueService.enqueueOutbound({
      userId: 'user_test_1',
      from: 'alice@quantmail.in',
      to: ['bob@external.com'],
      subject: 'Quarterly Report',
      bodyText: 'Attached is the report.',
      rawMime: 'From: alice@quantmail.in...',
    });

    expect(result.jobId).toBe('bullmq-job-uuid-1');
    expect(result.emailId).toBeDefined();

    // Verify DB call
    expect(mockPrisma.email.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_test_1',
          fromAddress: 'alice@quantmail.in',
          deliveryStatus: 'queued',
          isSent: true,
        }),
      }),
    );

    // Verify BullMQ job payload
    expect(mockQueue.add).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        to: 'bob@external.com',
        subject: 'Quarterly Report',
        body: 'Attached is the report.',
        userId: 'user_test_1',
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('outbound-delivery:'),
      }),
    );
  });
});
