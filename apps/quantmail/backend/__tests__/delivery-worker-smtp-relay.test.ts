// @vitest-environment node
// ============================================================================
// DeliveryWorker with MAIL_TRANSPORT=smtp: external recipients go through the
// SMTP relay (real SmtpMailTransport against an in-process fake server).
// Checks the Bcc/envelope invariant end to end, 5xx -> bounced, 4xx -> deferred
// (BullMQ/backoff semantics), and that the worker's own DKIM signer stays off
// unless SMTP_DKIM_SIGN=true (the relay signs; no double signature).
// ============================================================================

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/email.service', () => ({
  EmailService: vi.fn().mockImplementation(function (this: unknown) {
    (this as { deliverInternally: unknown }).deliverInternally = vi.fn();
  }),
}));

import { DeliveryWorker } from '../services/delivery-worker.service';
import { closeMailTransport } from '../lib/mail-transport';
import { startFakeSmtpServer, type FakeSmtpServer } from './helpers/fake-smtp-server';

const KEYS = [
  'MAIL_TRANSPORT',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_REQUIRE_TLS',
  'SMTP_DKIM_SIGN',
  'NODE_TLS_REJECT_UNAUTHORIZED',
] as const;
const saved: Record<string, string | undefined> = {};
const servers: FakeSmtpServer[] = [];

function useRelay(port: number, over: Record<string, string> = {}): void {
  process.env['MAIL_TRANSPORT'] = 'smtp';
  process.env['SMTP_HOST'] = '127.0.0.1';
  process.env['SMTP_PORT'] = String(port);
  process.env['SMTP_USER'] = 'relay-user';
  process.env['SMTP_PASS'] = 'relay-pass';
  // The fake server's certificate is self-signed.
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
  for (const [k, v] of Object.entries(over)) process.env[k] = v;
}

async function relay(opts: Parameters<typeof startFakeSmtpServer>[0] = {}): Promise<FakeSmtpServer> {
  const s = await startFakeSmtpServer({ user: 'relay-user', pass: 'relay-pass', ...opts });
  servers.push(s);
  return s;
}

function makePrisma(email: Record<string, unknown>) {
  const attempts = new Map<string, Record<string, unknown>>();
  const key = (w: any) => `${w.emailId_recipient.emailId}:${w.emailId_recipient.recipient}`;
  return {
    email: {
      findUnique: vi.fn().mockResolvedValue(email),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...email, ...data })),
    },
    user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null) },
    deliveryAttempt: {
      findUnique: vi.fn().mockImplementation(async ({ where }: any) => attempts.get(key(where)) ?? null),
      upsert: vi.fn().mockImplementation(async ({ where, create }: any) => {
        attempts.set(key(where), { ...create });
        return { ...create };
      }),
    },
  };
}

function makeEmail(over: Record<string, unknown> = {}) {
  return {
    id: 'email-1',
    userId: 'user-1',
    fromAddress: 'kundan@quantmail.in',
    fromName: 'Kundan',
    subject: 'hello',
    bodyHtml: '<p>hi</p>',
    bodyPlain: 'hi',
    toAddresses: ['friend@example.com'],
    ccAddresses: ['cc@example.com'],
    bccAddresses: ['hidden@example.com'],
    attachments: [],
    messageId: '<email-1@quantmail.in>',
    deliveryStatus: 'queued',
    isSent: false,
    isDraft: true,
    ...over,
  };
}

const JOB = {
  data: { to: 'friend@example.com', subject: 'hello', body: 'hi', emailId: 'email-1', userId: 'user-1' },
};

function makeWorker(prisma: unknown, signer?: { signMessage: (h: Record<string, string>, b: string) => string }) {
  const auth = { getDkimSigner: vi.fn().mockResolvedValue(signer) };
  const worker = new DeliveryWorker(prisma as any, auth as any, {
    smtp: {} as any,
    mx: {} as any,
    senderDomain: 'quantmail.in',
    now: () => new Date('2026-10-24T00:00:00Z'),
  });
  return { worker, auth };
}

beforeAll(() => {
  for (const k of KEYS) saved[k] = process.env[k];
});

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});

afterEach(async () => {
  closeMailTransport();
  while (servers.length) await servers.pop()!.close();
});

afterAll(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('DeliveryWorker over the SMTP relay', () => {
  it('relays externally, keeps Bcc out of the headers, reuses the stored Message-ID, does not DKIM-sign', async () => {
    const srv = await relay();
    useRelay(srv.port);
    const { worker, auth } = makeWorker(makePrisma(makeEmail()));

    const result = await worker.processDelivery(JOB);

    expect(srv.messages).toHaveLength(1);
    const msg = srv.messages[0]!;
    expect(msg.mailFrom).toBe('kundan@quantmail.in');
    expect(msg.rcptTo.sort()).toEqual(['cc@example.com', 'friend@example.com', 'hidden@example.com']);
    expect(msg.headers).not.toMatch(/^Bcc:/im);
    expect(msg.raw.toString('latin1')).not.toContain('hidden@example.com');
    expect(msg.headers).toMatch(/^Message-ID: <email-1@quantmail\.in>$/m);
    expect(msg.headers).not.toMatch(/^DKIM-Signature:/im);
    expect(auth.getDkimSigner).not.toHaveBeenCalled();
    expect(result.deliveryStatus).toBe('sent');
    expect(result.recipients.map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
    expect(result.recipients[0]!.smtpResponse).toBe('250 2.0.0 OK (SMTP relay)');
  });

  it('a 5xx from the relay is a bounce, a 4xx stays deferred for retry', async () => {
    const hard = await relay({ rejectRcpt: { 'friend@example.com': 550 } });
    useRelay(hard.port);
    const bounced = await makeWorker(makePrisma(makeEmail({ ccAddresses: [], bccAddresses: [] }))).worker.processDelivery(JOB);
    expect(bounced.deliveryStatus).toBe('bounced');
    expect(bounced.recipients[0]).toMatchObject({ status: 'bounced' });
    expect(bounced.recipients[0]!.smtpResponse).toMatch(/^550 SMTP relay rejected/);
    closeMailTransport();

    const soft = await relay({ rejectRcpt: { 'friend@example.com': 451 } });
    useRelay(soft.port);
    const deferred = await makeWorker(makePrisma(makeEmail({ ccAddresses: [], bccAddresses: [] }))).worker.processDelivery(JOB);
    expect(deferred.deliveryStatus).toBe('deferred');
    expect(deferred.recipients[0]).toMatchObject({ status: 'deferred' });
    expect(deferred.recipients[0]!.smtpResponse).toMatch(/^451 SMTP relay delivery error/);
  });

  it('records the recipient the relay refused as a bounce while the rest are sent', async () => {
    const srv = await relay({ rejectRcpt: { 'cc@example.com': 550 } });
    useRelay(srv.port);
    const result = await makeWorker(makePrisma(makeEmail())).worker.processDelivery(JOB);
    const byRecipient = Object.fromEntries(result.recipients.map((r) => [r.recipient, r.status]));
    expect(byRecipient).toEqual({
      'friend@example.com': 'sent',
      'cc@example.com': 'bounced',
      'hidden@example.com': 'sent',
    });
    expect(result.deliveryStatus).toBe('sent');
  });

  it('SMTP_DKIM_SIGN=true signs once in the worker and relays the signed message with envelope-only Bcc', async () => {
    const srv = await relay();
    useRelay(srv.port, { SMTP_DKIM_SIGN: 'true' });
    const signer = {
      signMessage: vi.fn((headers: Record<string, string>, body: string) => {
        const head = Object.entries(headers).map(([k, v]) => `${k}: ${v}`);
        return ['DKIM-Signature: v=1; a=rsa-sha256; d=quantmail.in; s=test; b=abc', ...head, '', body].join('\r\n');
      }),
    };
    const { worker, auth } = makeWorker(makePrisma(makeEmail()), signer);

    const result = await worker.processDelivery(JOB);

    expect(auth.getDkimSigner).toHaveBeenCalledTimes(1);
    expect(signer.signMessage).toHaveBeenCalledTimes(1);
    const msg = srv.messages[0]!;
    expect(msg.headers.match(/^DKIM-Signature:/gim)).toHaveLength(1);
    expect(msg.headers).not.toMatch(/^Bcc:/im);
    expect(msg.raw.toString('latin1')).not.toContain('hidden@example.com');
    expect(msg.rcptTo).toContain('hidden@example.com');
    expect(result.deliveryStatus).toBe('sent');
  });
});
