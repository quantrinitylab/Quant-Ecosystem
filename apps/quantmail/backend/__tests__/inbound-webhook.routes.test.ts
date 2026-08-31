/**
 * Route-level security for the inbound-mail webhook.
 *
 * This endpoint is public and live: `quantmail.in`'s MX record points at SES, and
 * `publicPaths` exempts the path from the JWT hook. Every test here corresponds to
 * something the previous version actually did — accept an unsigned body, read a
 * bucket the caller named, invent a recipient out of a To header, or replay the
 * whole bucket for anyone who asked. They are written against the Fastify route
 * rather than the helpers because the ordering is the security property: the
 * signature has to be checked before anything in the body is used.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeUser {
  id: string;
  email: string;
  username: string;
  role: string;
}

const state = vi.hoisted(() => ({
  users: [] as Array<{ id: string; email: string; username: string; role: string }>,
  s3Send: vi.fn(),
}));

vi.mock('@quant/database', () => ({
  prisma: {
    user: {
      findMany: vi.fn(async (args: unknown) => {
        const where = (args as { where?: { OR?: Array<Record<string, { in?: string[] }>> } }).where;
        const emails = where?.OR?.[0]?.['email']?.in ?? [];
        const handles = where?.OR?.[1]?.['username']?.in ?? [];
        return state.users.filter(
          (user) => emails.includes(user.email) || handles.includes(user.username),
        );
      }),
      findUnique: vi.fn(async (args: unknown) => {
        const id = (args as { where?: { id?: string } }).where?.id;
        return state.users.find((user) => user.id === id) ?? null;
      }),
    },
  },
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = state.s3Send;
  },
  GetObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  ListObjectsV2Command: class {
    constructor(public readonly input: unknown) {}
  },
}));

import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import inboundWebhookRoutes, { __setInboundIngestAdapter } from '../routes/inbound-webhook';
import type { InboundIngestAdapter } from '../services/inbound-ingest.service';

const TOPIC = 'arn:aws:sns:us-east-1:123456789012:quantmail-inbound';
const BUCKET = 'quantmail-inbound-emails';
const KEY = 'emails/abc123';

const RAW_EMAIL = [
  'From: Ada Lovelace <ada@example.com>',
  'To: bob@quantmail.in',
  'Subject: Numbers',
  'Message-ID: <mid-1@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="B"',
  '',
  '--B',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hello Bob.',
  '--B',
  'Content-Type: application/pdf',
  'Content-Disposition: attachment; filename="Q3.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from('%PDF-1.4').toString('base64'),
  '--B--',
  '',
].join('\r\n');

interface ReceiptOverrides {
  recipients?: string[];
  spfVerdict?: { status: string };
  dkimVerdict?: { status: string };
  dmarcVerdict?: { status: string };
  spamVerdict?: { status: string };
  virusVerdict?: { status: string };
  dmarcPolicy?: string;
  action?: { type?: string; bucketName?: string; objectKey?: string };
}

/** A signed-shaped SES notification. Signature checking is bypassed per test. */
function notification(receipt: ReceiptOverrides = {}, envelope: Record<string, unknown> = {}) {
  return {
    Type: 'Notification',
    MessageId: '11111111-2222-3333-4444-555555555555',
    TopicArn: TOPIC,
    Timestamp: new Date().toISOString(),
    Message: JSON.stringify({
      notificationType: 'Received',
      mail: { messageId: 'abc123', source: 'ada@example.com', destination: ['bob@quantmail.in'] },
      receipt: {
        recipients: ['bob@quantmail.in'],
        spfVerdict: { status: 'PASS' },
        dkimVerdict: { status: 'PASS' },
        dmarcVerdict: { status: 'PASS' },
        spamVerdict: { status: 'PASS' },
        virusVerdict: { status: 'PASS' },
        action: { type: 'S3', bucketName: BUCKET, objectKey: KEY },
        ...receipt,
      },
    }),
    ...envelope,
  };
}

let app: FastifyInstance;
let ingest: ReturnType<typeof vi.fn>;
/**
 * The subscription handshake is the one place this route makes an outbound request,
 * and the check that it only ever GETs an AWS URL is only meaningful if a refusal
 * can be distinguished from a call that was made and failed.
 */
const realFetch = globalThis.fetch;
let fetchStub: ReturnType<typeof vi.fn>;
const savedEnv = { ...process.env };

/**
 * The real app authenticates every non-public path in a global hook and decorates
 * `request.auth`. Here that is a header, so the admin route can be exercised as
 * nobody, as a normal user, and as an admin.
 */
async function buildTestApp(): Promise<FastifyInstance> {
  const instance = Fastify();
  instance.addHook('preHandler', async (request) => {
    const actorId = request.headers['x-test-user'];
    if (typeof actorId === 'string' && actorId) {
      (request as unknown as { auth: { userId: string } }).auth = { userId: actorId };
    }
  });
  await instance.register(inboundWebhookRoutes);
  await instance.ready();
  return instance;
}

function s3ReturnsRawEmail(body = RAW_EMAIL): void {
  state.s3Send.mockImplementation(async () => ({
    Body: { transformToString: async () => body },
  }));
}

/**
 * Serve `ListObjectsV2` one page at a time, and the raw message for any object that
 * is then fetched. A page carrying `next` reports itself truncated, which is what
 * makes the pagination in sync-all observable.
 */
function s3ListsPages(pages: Array<{ keys: string[]; next?: string }>): void {
  let listCalls = 0;
  state.s3Send.mockImplementation(async (command: unknown) => {
    if (command instanceof ListObjectsV2Command) {
      const page = pages[Math.min(listCalls, pages.length - 1)];
      listCalls += 1;
      return {
        Contents: (page?.keys ?? []).map((Key) => ({ Key })),
        IsTruncated: Boolean(page?.next),
        NextContinuationToken: page?.next,
      };
    }
    return { Body: { transformToString: async () => RAW_EMAIL } };
  });
}

/** A single-part message addressed wherever the test needs it. */
function plainEmail(to: string): string {
  return [
    'From: Ada Lovelace <ada@example.com>',
    `To: ${to}`,
    'Subject: Numbers',
    'Message-ID: <mid-2@example.com>',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Hello.',
    '',
  ].join('\r\n');
}

/** A message whose only non-text part is a cid: image the body references. */
function inlineImageEmail(): string {
  return [
    'From: Ada Lovelace <ada@example.com>',
    'To: bob@quantmail.in',
    'Subject: Signature',
    'Message-ID: <mid-3@example.com>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; boundary="R"',
    '',
    '--R',
    'Content-Type: text/html; charset=utf-8',
    '',
    '<p>Hi <img src="cid:logo@x"></p>',
    '--R',
    'Content-Type: image/png',
    'Content-Disposition: inline; filename="logo.png"',
    'Content-ID: <logo@x>',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('PNGDATA').toString('base64'),
    '--R--',
    '',
  ].join('\r\n');
}

interface IngestArgs {
  raw: {
    subject: string;
    to: string[];
    cc: string[];
    messageId: string | null;
    hasAttachments: boolean;
    attachments: Array<{ filename: string; isInline: boolean }>;
  };
  options: {
    userId: string;
    quarantine: boolean;
    verdict: {
      spf: string;
      dkim: string;
      dmarc: string;
      aligned: boolean;
      details: {
        spfDomain: string | null;
        dkimDomain: string | null;
        fromDomain: string | null;
        spfAligned: boolean;
        dkimAligned: boolean;
        dmarcPolicy: string | null;
      };
    };
  };
}

/** One `ingest` call's arguments, typed enough to assert on. */
function ingestCall(index = 0): IngestArgs {
  const call = ingest.mock.calls[index] as [IngestArgs['raw'], IngestArgs['options']] | undefined;
  if (!call) {
    throw new Error(`ingest was called ${ingest.mock.calls.length} time(s), not ${index + 1}`);
  }
  return { raw: call[0], options: call[1] };
}

beforeEach(async () => {
  state.users.length = 0;
  state.s3Send.mockReset();
  s3ReturnsRawEmail();
  delete process.env['INBOUND_SNS_TOPIC_ARNS'];
  delete process.env['INBOUND_S3_BUCKETS'];
  process.env['NODE_ENV'] = 'test';
  process.env['INBOUND_WEBHOOK_ALLOW_UNSIGNED'] = 'true';
  fetchStub = vi.fn(async () => ({ status: 200 }));
  globalThis.fetch = fetchStub as unknown as typeof globalThis.fetch;
  ingest = vi.fn(async () => ({ id: 'email-1' }));
  __setInboundIngestAdapter({ ingest } as unknown as InboundIngestAdapter);
  app = await buildTestApp();
});

afterEach(async () => {
  await app.close();
  __setInboundIngestAdapter(undefined);
  globalThis.fetch = realFetch;
  process.env = { ...savedEnv };
});

function localUser(overrides: Partial<FakeUser> = {}): FakeUser {
  return { id: 'u-bob', email: 'bob@quantmail.in', username: 'bob', role: 'USER', ...overrides };
}

describe('POST /webhook/inbound — the recipient is one the message named, or nobody', () => {
  it('delivers to a local mailbox with the SES verdict and the attachment metadata', async () => {
    state.users.push(localUser());

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, key: KEY, delivered: 1 });

    const { raw, options } = ingestCall();
    expect(options.userId).toBe('u-bob');
    expect(options.quarantine).toBe(false);
    expect(options.verdict).toMatchObject({
      spf: 'pass',
      dkim: 'pass',
      dmarc: 'pass',
      aligned: true,
    });
    // SES reports no per-mechanism alignment, so these two are derived from its
    // DMARC verdict and the domains are left null rather than guessed at.
    expect(options.verdict.details).toMatchObject({
      spfAligned: true,
      dkimAligned: true,
      spfDomain: null,
      dkimDomain: null,
      fromDomain: 'example.com',
    });
    expect(raw).toMatchObject({
      subject: 'Numbers',
      messageId: 'mid-1@example.com',
      hasAttachments: true,
    });
    expect(raw.attachments).toHaveLength(1);
    expect(raw.attachments[0]).toMatchObject({ filename: 'Q3.pdf', isInline: false });
  });

  it('delivers a blind copy that only the SES receipt names', async () => {
    // A Bcc'd address appears in neither To nor Cc; reading the headers alone is how
    // blind copies were silently dropped.
    state.users.push(
      localUser(),
      localUser({ id: 'u-carol', email: 'carol@quantmail.in', username: 'carol' }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification({ recipients: ['bob@quantmail.in', 'carol@quantmail.in'] }),
    });

    expect(response.json()).toEqual({ ok: true, key: KEY, delivered: 2 });
    expect(ingest).toHaveBeenCalledTimes(2);
    expect([ingestCall(0).options.userId, ingestCall(1).options.userId]).toEqual([
      'u-bob',
      'u-carol',
    ]);
  });

  it('resolves a plus-tagged address to the mailbox behind it', async () => {
    state.users.push(localUser());
    s3ReturnsRawEmail(plainEmail('bob+newsletters@quantmail.in'));

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification({ recipients: ['bob+newsletters@quantmail.in'] }),
    });

    expect(response.json()).toMatchObject({ ok: true, delivered: 1 });
    expect(ingestCall().options.userId).toBe('u-bob');
  });

  it('resolves an alias in another of our own domains by handle', async () => {
    state.users.push(localUser());
    s3ReturnsRawEmail(plainEmail('bob@quantrinity.in'));

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification({ recipients: ['bob@quantrinity.in'] }),
    });

    expect(response.json()).toMatchObject({ ok: true, delivered: 1 });
    expect(ingestCall().options.userId).toBe('u-bob');
  });

  it('drops a message addressed only outside our domains, handle collision or not', async () => {
    // The previous version took the handle out of *any* To header and appended
    // `@quantmail.in`, so a notification for bob@example.com landed in our bob's
    // mailbox. One forged body could be aimed at any user by handle.
    state.users.push(localUser());
    s3ReturnsRawEmail(plainEmail('bob@example.com'));

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification({ recipients: ['bob@example.com'] }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      key: KEY,
      delivered: 0,
      skipped: 'no-local-recipient',
    });
    expect(ingest).not.toHaveBeenCalled();
  });

  it('does not raise the paperclip for a cid: image that is part of the body', async () => {
    state.users.push(localUser());
    s3ReturnsRawEmail(inlineImageEmail());

    await app.inject({ method: 'POST', url: '/webhook/inbound', payload: notification() });

    const { raw } = ingestCall();
    expect(raw.attachments).toHaveLength(1);
    expect(raw.attachments[0]).toMatchObject({ filename: 'logo.png', isInline: true });
    expect(raw.hasAttachments).toBe(false);
  });
});

describe('POST /webhook/inbound — the bucket is the configured one or it is not read', () => {
  it('refuses to read a bucket the notification named', async () => {
    state.users.push(localUser());

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification({
        action: { type: 'S3', bucketName: 'someone-elses-bucket', objectKey: 'secrets/db.sql' },
      }),
    });

    // Acknowledged, so SNS stops retrying a notification we will never accept.
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, ignored: 'bucket-not-allowlisted' });
    // The assertion that matters: an S3 read runs with the service's own IAM role,
    // so a bucket the caller names is an arbitrary read of whatever that role sees.
    expect(state.s3Send).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it('accepts a second bucket while a region migration is in flight', async () => {
    process.env['INBOUND_S3_BUCKETS'] = 'quantmail-inbound-emails-eu';
    state.users.push(localUser());

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification({
        action: { type: 'S3', bucketName: 'quantmail-inbound-emails-eu', objectKey: KEY },
      }),
    });

    expect(response.statusCode).toBe(200);
    const get = state.s3Send.mock.calls
      .map((call) => call[0])
      .find((command): command is GetObjectCommand => command instanceof GetObjectCommand);
    expect(get?.input.Bucket).toBe('quantmail-inbound-emails-eu');
    expect(get?.input.Key).toBe(KEY);
  });
});

const QUARANTINE_CASES: Array<[string, ReceiptOverrides]> = [
  ['a DMARC failure', { dmarcVerdict: { status: 'FAIL' } }],
  ['a spam verdict', { spamVerdict: { status: 'FAIL' } }],
  ['a virus verdict', { virusVerdict: { status: 'FAIL' } }],
];

describe('POST /webhook/inbound — spam, virus and DMARC decide the folder', () => {
  it.each(QUARANTINE_CASES)('quarantines on %s', async (_label, receipt) => {
    state.users.push(localUser());

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification(receipt),
    });

    expect(response.statusCode).toBe(200);
    expect(ingestCall().options.quarantine).toBe(true);
  });

  it('quarantines on spam without misreporting DMARC to get it there', async () => {
    // The quarantine flag exists so the folder decision and the authentication
    // record can disagree. Writing dmarc: 'fail' to move a message to spam would
    // put a lie in the record the user is shown.
    state.users.push(localUser());

    await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification({ spamVerdict: { status: 'FAIL' } }),
    });

    const { options } = ingestCall();
    expect(options.quarantine).toBe(true);
    expect(options.verdict.dmarc).toBe('pass');
  });

  it('records an absent verdict as none rather than a pass', async () => {
    state.users.push(localUser());

    await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification({
        spfVerdict: undefined,
        dkimVerdict: undefined,
        dmarcVerdict: undefined,
      }),
    });

    const { options } = ingestCall();
    expect(options.verdict).toMatchObject({
      spf: 'none',
      dkim: 'none',
      dmarc: 'none',
      aligned: false,
    });
    expect(options.quarantine).toBe(false);
  });
});

describe('POST /webhook/inbound — the subscription handshake', () => {
  function confirmation(subscribeUrl: string): Record<string, unknown> {
    return {
      Type: 'SubscriptionConfirmation',
      MessageId: '66666666-7777-8888-9999-000000000000',
      TopicArn: TOPIC,
      Timestamp: new Date().toISOString(),
      Message: 'You have chosen to subscribe to the topic.',
      Token: 'tok',
      SubscribeURL: subscribeUrl,
    };
  }

  it('confirms by GETting the AWS URL that SNS supplied', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: confirmation(
        'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=tok',
      ),
    });

    expect(response.json()).toEqual({ ok: true, confirmed: true });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('refuses a SubscribeURL that is not an AWS SNS URL', async () => {
    // `startsWith('https://sns.')` accepts this host. Confirming it would be a GET
    // to an attacker-chosen URL from inside our network, with our egress.
    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: confirmation('https://sns.attacker.example/?Action=ConfirmSubscription'),
    });

    expect(response.statusCode).toBe(403);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('answers 502 when the confirmation GET fails, rather than claiming success', async () => {
    fetchStub.mockRejectedValueOnce(new Error('network unreachable'));

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: confirmation('https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription'),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ ok: false, error: 'CONFIRMATION_FAILED' });
  });
});

describe('POST /webhook/inbound — a malformed payload is acknowledged, not retried forever', () => {
  it('ignores a Message that is not JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: { ...notification(), Message: 'not json' },
    });

    expect(response.json()).toEqual({ ok: true, ignored: 'unparseable-message' });
    expect(state.s3Send).not.toHaveBeenCalled();
  });

  it('ignores a notification that names no object at all', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: {
        ...notification(),
        Message: JSON.stringify({
          notificationType: 'Received',
          mail: {},
          receipt: { recipients: ['bob@quantmail.in'] },
        }),
      },
    });

    expect(response.json()).toEqual({ ok: true, ignored: 'no-object-key' });
    expect(state.s3Send).not.toHaveBeenCalled();
  });

  it('rejects a type SNS does not publish', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: { ...notification(), Type: 'Delivery' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, error: 'UNSUPPORTED_TYPE' });
  });
});

describe('POST /webhook/inbound — a failed delivery is not reported as success', () => {
  it('answers 500 so SNS redelivers when ingest throws', async () => {
    state.users.push(localUser());
    ingest.mockRejectedValueOnce(new Error('database is down'));

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification(),
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ ok: false, error: 'DELIVERY_FAILED' });
  });

  it('answers 500 when the stored message cannot be read', async () => {
    state.users.push(localUser());
    state.s3Send.mockRejectedValueOnce(new Error('AccessDenied'));

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification(),
    });

    expect(response.statusCode).toBe(500);
    expect(ingest).not.toHaveBeenCalled();
  });

  it('still attempts the second recipient when the first one fails', async () => {
    state.users.push(
      localUser(),
      localUser({ id: 'u-carol', email: 'carol@quantmail.in', username: 'carol' }),
    );
    ingest.mockRejectedValueOnce(new Error('database is down'));

    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound',
      payload: notification({ recipients: ['bob@quantmail.in', 'carol@quantmail.in'] }),
    });

    // Non-2xx for the copy that failed; the retry is safe for the copy that landed
    // because ingest is idempotent on (userId, messageId).
    expect(response.statusCode).toBe(500);
    expect(ingest).toHaveBeenCalledTimes(2);
  });
});

describe('POST /admin/inbound/sync-all — replaying the bucket is not a public button', () => {
  const admin = { id: 'u-admin', email: 'admin@quantmail.in', username: 'admin', role: 'ADMIN' };

  it('refuses an unauthenticated caller', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/inbound/sync-all',
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ ok: false, error: 'UNAUTHORIZED' });
    expect(state.s3Send).not.toHaveBeenCalled();
  });

  it('refuses a signed-in user who is not an admin', async () => {
    state.users.push(localUser());

    const response = await app.inject({
      method: 'POST',
      url: '/admin/inbound/sync-all',
      headers: { 'x-test-user': 'u-bob' },
      payload: {},
    });

    expect(response.statusCode).toBe(403);
    expect(state.s3Send).not.toHaveBeenCalled();
  });

  it('does not answer under the prefix that exempts the webhook from auth', async () => {
    // `publicPaths` matches by prefix, so anything under `/webhook/inbound/`
    // inherits its JWT exemption. That is how this became an unauthenticated
    // "replay the whole bucket into everyone's inbox" endpoint.
    const response = await app.inject({
      method: 'POST',
      url: '/webhook/inbound/sync-all',
      payload: {},
    });

    expect(response.statusCode).toBe(404);
  });

  it('replays every page of the bucket, not just the first one', async () => {
    // The previous version made a single ListObjectsV2 call, which caps a page at
    // 1000 keys — it stopped there and reported success for a partial replay.
    state.users.push(localUser(), admin);
    s3ListsPages([{ keys: ['emails/one'], next: 'page-2' }, { keys: ['emails/two'] }]);

    const response = await app.inject({
      method: 'POST',
      url: '/admin/inbound/sync-all',
      headers: { 'x-test-user': 'u-admin' },
      payload: { limit: 50 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, scanned: 2, delivered: 2, skipped: 0, failed: 0 });

    const lists = state.s3Send.mock.calls
      .map((call) => call[0])
      .filter(
        (command): command is ListObjectsV2Command => command instanceof ListObjectsV2Command,
      );
    expect(lists).toHaveLength(2);
    expect(lists[1]?.input.ContinuationToken).toBe('page-2');
  });

  it('records an unknown verdict for a replayed message rather than a pass', async () => {
    state.users.push(localUser(), admin);
    s3ListsPages([{ keys: ['emails/one'] }]);

    await app.inject({
      method: 'POST',
      url: '/admin/inbound/sync-all',
      headers: { 'x-test-user': 'u-admin' },
      payload: {},
    });

    // The SES receipt is not part of the stored object, and nobody can still
    // determine the SPF result of mail that was accepted days ago.
    const { options } = ingestCall();
    expect(options.verdict).toMatchObject({
      spf: 'none',
      dkim: 'none',
      dmarc: 'none',
      aligned: false,
    });
    expect(options.quarantine).toBe(false);
  });

  it('reports the objects it could not deliver instead of counting them as sent', async () => {
    state.users.push(localUser(), admin);
    s3ListsPages([{ keys: ['emails/one', 'emails/two'] }]);
    ingest.mockRejectedValueOnce(new Error('database is down'));

    const response = await app.inject({
      method: 'POST',
      url: '/admin/inbound/sync-all',
      headers: { 'x-test-user': 'u-admin' },
      payload: {},
    });

    expect(response.json()).toEqual({ ok: true, scanned: 2, delivered: 1, skipped: 0, failed: 1 });
  });
});
