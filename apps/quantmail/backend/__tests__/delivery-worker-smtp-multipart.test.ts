// @vitest-environment node
// ============================================================================
// QM-SMTP-MULTIPART — the direct-SMTP fallback (used when SES is not
// configured) must transmit the same text+html pair the SES Simple
// `Body {Html, Text}` shape carries: multipart/alternative when both variants
// exist, and a declared single-part Content-Type otherwise. Before the fix it
// sent a single body variant (`trackedBodyHtml ?? bodyPlain`) with no
// Content-Type at all, so plain-text-only clients got raw HTML.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { isSesConfiguredMock, sendViaSesMock } = vi.hoisted(() => ({
  isSesConfiguredMock: vi.fn().mockReturnValue(false),
  sendViaSesMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@aws-sdk/client-sesv2', () => {
  class SESv2Client {
    constructor(_opts: unknown) {}
    send = vi.fn();
  }
  class SendEmailCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return { SESv2Client, SendEmailCommand };
});

vi.mock('../services/email.service', () => ({
  // Must be a `function`, not an arrow — the worker does
  // `new EmailService(...)`, and arrow functions are not constructable.
  EmailService: vi.fn().mockImplementation(function (this: unknown) {}),
}));

// Real ses-sender (so the worker exercises the real buildAlternativeBody),
// with only the SES-configured probe + SES transmit stubbed out.
vi.mock('../lib/ses-sender', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/ses-sender')>();
  return { ...orig, isSesConfigured: isSesConfiguredMock, sendViaSes: sendViaSesMock };
});

import { DeliveryWorker } from '../services/delivery-worker.service';

interface SignedCall {
  headers: Record<string, string>;
  body: string;
}

interface SmtpCall {
  mxHost: string;
  from: string;
  recipient: string;
  rawMessage: string;
}

const signedCalls: SignedCall[] = [];
const smtpCalls: SmtpCall[] = [];

function makePrisma(email: Record<string, unknown>) {
  const attempts = new Map<string, Record<string, unknown>>();
  return {
    email: {
      findUnique: vi.fn().mockResolvedValue(email),
      update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        ...email,
        ...data,
      })),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    deliveryAttempt: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
        const key = `${where.emailId_recipient.emailId}:${where.emailId_recipient.recipient}`;
        return attempts.get(key) ?? null;
      }),
      upsert: vi.fn().mockImplementation(async ({ where, create }: any) => {
        const key = `${where.emailId_recipient.emailId}:${where.emailId_recipient.recipient}`;
        const row = { ...create };
        attempts.set(key, row);
        return row;
      }),
    },
  };
}

function makeEmail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'email-1',
    userId: 'user-1',
    fromAddress: 'kundan@quantmail.in',
    fromName: 'Kundan',
    subject: 'hello',
    bodyHtml: '<p>hi</p>',
    bodyPlain: 'hi',
    toAddresses: ['friend@gmail.com'],
    ccAddresses: [],
    bccAddresses: [],
    threadId: null,
    inReplyTo: null,
    attachments: [],
    messageKind: 'MAIL',
    messageId: '<email-1@quantmail.in>',
    deliveryStatus: 'queued',
    isSent: false,
    isDraft: true,
    openTrackingEnabled: false,
    openToken: null,
    ...overrides,
  };
}

function makeWorker(prisma: unknown): DeliveryWorker {
  const auth = {
    getDkimSigner: vi.fn().mockResolvedValue({
      signMessage: (headers: Record<string, string>, body: string): string => {
        signedCalls.push({ headers: { ...headers }, body });
        return 'DKIM-SIGNED-MESSAGE';
      },
    }),
  };
  const deps = {
    smtp: {
      send: vi.fn().mockImplementation(async (params: SmtpCall) => {
        smtpCalls.push({ ...params });
        return { outcome: 'accepted', response: '250 2.0.0 OK' };
      }),
    },
    mx: {
      resolveMx: vi.fn().mockResolvedValue([{ priority: 10, exchange: 'mx.example.com' }]),
    },
    senderDomain: 'quantmail.in',
    now: () => new Date('2026-10-20T00:00:00Z'),
  };
  return new DeliveryWorker(prisma as never, auth as never, deps as never);
}

beforeEach(() => {
  signedCalls.length = 0;
  smtpCalls.length = 0;
  vi.clearAllMocks();
  isSesConfiguredMock.mockReturnValue(false);
});

describe('DeliveryWorker direct-SMTP fallback body shape (QM-SMTP-MULTIPART)', () => {
  it('sends multipart/alternative with both text and html when both variants exist (SES parity)', async () => {
    const worker = makeWorker(makePrisma(makeEmail()));
    const receipt = await worker.processDelivery({
      data: { emailId: 'email-1', userId: 'user-1' },
    } as never);

    expect(sendViaSesMock).not.toHaveBeenCalled();
    expect(receipt.deliveryStatus).toBe('sent');
    expect(receipt.recipients).toHaveLength(1);
    expect(receipt.recipients[0]?.status).toBe('sent');

    expect(signedCalls).toHaveLength(1);
    const { headers, body } = signedCalls[0]!;
    expect(headers['mime-version']).toBe('1.0');
    expect(headers['content-type']).toMatch(/^multipart\/alternative; boundary="/);

    const textIdx = body.indexOf('Content-Type: text/plain; charset=UTF-8');
    const htmlIdx = body.indexOf('Content-Type: text/html; charset=UTF-8');
    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(htmlIdx).toBeGreaterThan(textIdx);
    const unfolded = body.replace(/\r\n/g, '');
    expect(unfolded).toContain(Buffer.from('hi', 'utf8').toString('base64'));
    expect(unfolded).toContain(Buffer.from('<p>hi</p>', 'utf8').toString('base64'));

    expect(smtpCalls).toHaveLength(1);
    expect(smtpCalls[0]?.recipient).toBe('friend@gmail.com');
    expect(smtpCalls[0]?.rawMessage).toBe('DKIM-SIGNED-MESSAGE');
  });

  it('sends a declared text/html single part when only HTML exists', async () => {
    const worker = makeWorker(makePrisma(makeEmail({ bodyPlain: '' })));
    const receipt = await worker.processDelivery({
      data: { emailId: 'email-1', userId: 'user-1' },
    } as never);

    expect(receipt.deliveryStatus).toBe('sent');
    expect(signedCalls).toHaveLength(1);
    const { headers, body } = signedCalls[0]!;
    expect(headers['content-type']).toBe('text/html; charset=UTF-8');
    expect(headers['mime-version']).toBeUndefined();
    expect(body).toBe('<p>hi</p>');
  });

  it('sends a declared text/plain single part when only text exists', async () => {
    const worker = makeWorker(makePrisma(makeEmail({ bodyHtml: '' })));
    const receipt = await worker.processDelivery({
      data: { emailId: 'email-1', userId: 'user-1' },
    } as never);

    expect(receipt.deliveryStatus).toBe('sent');
    expect(signedCalls).toHaveLength(1);
    const { headers, body } = signedCalls[0]!;
    expect(headers['content-type']).toBe('text/plain; charset=UTF-8');
    expect(body).toBe('hi');
  });
});
