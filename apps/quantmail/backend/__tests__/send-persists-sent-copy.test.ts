import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { EmailService } from '../services/email.service';
import emailsRoutes from '../routes/emails';

// SES is stubbed file-wide: throwing on transmit, reporting as configured.
// The delayMs send path (test 1) never reaches the SES fallback, so this is
// inert there and drives the direct-SES failure branch in test 2.
vi.mock('../lib/ses-sender', () => ({
  isSesConfigured: () => true,
  sendViaSes: async () => {
    throw new Error('SES 500 InternalError');
  },
}));

/**
 * Regression tests for the 2026-10-04 live QA trust-breakers:
 *   BUG 1 — /sent ("delivery trail") stayed EMPTY after confirmed sends.
 *   BUG 2 — the inbox list showed "0 unread, 0 total / All done for the day"
 *           while the search query surfaced the real conversation.
 *
 * Root cause (one defect, both symptoms): EmailService.send() assigned
 * `deliveryStatus = 'failed'` on its two delivery-failure paths, but 'failed'
 * is not a member of the Prisma EmailDeliveryStatus enum
 * (draft | queued | sent | deferred | bounced | delivered —
 * packages/database/prisma/schema.prisma). Prisma validates enum inputs
 * client-side and throws, so the final email.update — the single statement
 * that flips isDraft: false, isSent: true, folderId: <Sent> — never ran and
 * the mail stayed a draft forever:
 *   - GET /emails?folderType=SENT filters `isSent = true`  -> missed it (bug 1)
 *   - GET /emails (default inbox) requires `isDraft = false` -> missed it (bug 2)
 *   - GET /emails/search has no isDraft filter               -> found it
 *
 * The interim fix recorded a transport failure as 'deferred' and still
 * flipped to Sent — but that was a silent lie (CUST-P0-2): the UI announced
 * "Message sent" while no queue job existed and nothing could ever deliver
 * the mail. The current contract is honest: when no transport can deliver
 * (queue down and no direct fallback applies), send() throws a real 503
 * DELIVERY_QUEUE_UNAVAILABLE and the draft stays a draft, so the user sees
 * the actual reason and can retry.
 */

// Mirrors Prisma's client-side enum validation (PrismaClientValidationError is
// thrown before any DB roundtrip). The fake prisma below enforces the same
// contract, so the test fails if the service ever hands the client a value
// outside the enum again.
const VALID_DELIVERY_STATUSES = new Set([
  'draft',
  'queued',
  'sent',
  'deferred',
  'bounced',
  'delivered',
]);

const DRAFT_ROW = {
  id: 'e1',
  userId: 'u1',
  threadId: null as string | null,
  folderId: null as string | null,
  fromAddress: 'museqatest@quantmail.in',
  fromName: 'QA',
  toAddresses: ['friend@gmail.com'],
  ccAddresses: [],
  bccAddresses: [],
  subject: 'QA probe',
  bodyHtml: '<p>hi</p>',
  bodyPlain: 'hi',
  isRead: false,
  isDraft: true,
  isSent: false,
  isSpam: false,
  isTrash: false,
  receivedAt: null as Date | null,
  deletedAt: null as Date | null,
  deliveryStatus: 'draft',
};

function prismaValidationError(value: unknown): Error {
  const err = new Error(
    `Invalid value for argument 'deliveryStatus': expected EmailDeliveryStatus, got '${String(value)}'`,
  );
  err.name = 'PrismaClientValidationError';
  return err;
}

function makePrisma() {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const findManyWheres: unknown[] = [];
  const prisma = {
    email: {
      findUnique: vi.fn(async ({ where }: any) =>
        where?.id === 'e1' ? { ...DRAFT_ROW } : null,
      ),
      update: vi.fn(async ({ where, data }: any) => {
        if (
          data.deliveryStatus !== undefined &&
          !VALID_DELIVERY_STATUSES.has(data.deliveryStatus)
        ) {
          throw prismaValidationError(data.deliveryStatus);
        }
        updates.push({ where, data });
        return { ...DRAFT_ROW, ...data };
      }),
      findMany: vi.fn(async ({ where }: any) => {
        findManyWheres.push(where);
        return [];
      }),
      count: vi.fn(async () => 0),
    },
    user: {
      findUnique: vi.fn(async () => ({
        email: 'museqatest@quantmail.in',
        displayName: 'QA',
        username: 'museqatest',
      })),
      // No internal recipients: the probe goes to an external address.
      findMany: vi.fn(async () => []),
    },
    emailFolder: {
      findFirst: vi.fn(async () => ({ id: 'sent-folder-id' })),
    },
  };
  return { prisma, updates, findManyWheres };
}

const allowAllSuppression = {
  filterAllowedRecipients: async (addrs: string[]) => ({ allowed: addrs, suppressed: [] }),
};

describe('EmailService.send fails honestly when delivery transport is down', () => {
  it('throws 503 and keeps the draft when the queue is down (no fake Sent flip)', async () => {
    const { prisma, updates } = makePrisma();
    // BullMQ/Redis unavailable: enqueueSend rejects, exactly as in the
    // deployment where the queue was not reachable.
    const brokenPipeline = {
      enqueueSend: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379')),
    };
    const service = new EmailService(prisma as any, brokenPipeline as any, allowAllSuppression);

    // The composer always sends with a 10s undo delay, which also disables the
    // direct-SES fallback — this is the exact QA path.
    // CUST-P0-2: the send must not fake success. Nothing can deliver the
    // message, so send() throws a real, retryable 503 — and the draft is
    // never flipped to Sent (the old deferred-flip made the UI announce
    // "Message sent" while the mail sat undeliverable).
    const err = await service
      .send('u1', 'e1', 'sent-folder-id', { delayMs: 10_000 })
      .then(
        () => null,
        (e: any) => e,
      );
    expect(err).not.toBeNull();
    expect(err?.statusCode).toBe(503);
    expect(err?.code).toBe('DELIVERY_QUEUE_UNAVAILABLE');
    expect(updates).toHaveLength(0);
  });

  it('still records the Sent copy when direct SES transmission throws', async () => {
    const { prisma, updates } = makePrisma();
    // No pipeline and no undo delay: the direct-SES fallback runs (mocked
    // above to throw), exercising the second failure branch.
    const service = new EmailService(prisma as any, undefined, allowAllSuppression);

    const sent = await service.send('u1', 'e1', 'sent-folder-id');

    expect(updates).toHaveLength(1);
    expect(updates[0]!.data.isSent).toBe(true);
    expect(updates[0]!.data.isDraft).toBe(false);
    expect(updates[0]!.data.folderId).toBe('sent-folder-id');
    expect(VALID_DELIVERY_STATUSES.has(updates[0]!.data.deliveryStatus as string)).toBe(true);
    expect(sent.isSent).toBe(true);
  });
});

/**
 * Minimal matcher for the subset of Prisma where-operators the GET /emails
 * handler builds (equality, null, OR/AND, and the nullable-relation `is`
 * filter with `not` / `lte`). Enough to prove the row the send path writes
 * satisfies the filters the /sent page and the inbox page query with.
 */
function matchesWhere(row: any, where: any): boolean {
  if (!where || typeof where !== 'object') return true;
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'OR') return cond.some((c: any) => matchesWhere(row, c));
    if (key === 'AND') return cond.every((c: any) => matchesWhere(row, c));
    if (key === 'NOT') return !matchesWhere(row, cond);
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('is' in cond) {
        const rel = value == null ? null : value;
        if (rel === null) return false;
        return matchesWhere(rel, cond.is);
      }
      if ('not' in cond) return !matchesWhere({ [key]: value }, { [key]: cond.not });
      if ('lte' in cond) return value != null && value <= cond.lte;
      if ('gte' in cond) return value != null && value >= cond.gte;
      if ('in' in cond) return cond.in.includes(value);
      return false;
    }
    if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
    return value === cond;
  });
}

describe('GET /emails list filters match the row the send path writes', () => {
  let app: FastifyInstance;
  let findManyWheres: unknown[];

  beforeEach(async () => {
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request) => {
      (request as any).auth = { userId: 'u1' };
    });
    const made = makePrisma();
    findManyWheres = made.findManyWheres;
    // The fake only implements the delegates the routes under test touch.
    app.decorate('prisma', made.prisma as any);
    await app.register(emailsRoutes, { prefix: '/emails' });
    await app.ready();
  });

  it('folderType=SENT filters on isSent (the /sent "delivery trail" query)', async () => {
    const res = await app.inject({ method: 'GET', url: '/emails?folderType=SENT' });
    expect(res.statusCode).toBe(200);
    const where = findManyWheres[0] as any;
    expect(where.isSent).toBe(true);
    expect(where.isTrash).toBe(false);
  });

  it('the default inbox query excludes drafts but admits sent mail via the isSent arm', async () => {
    const res = await app.inject({ method: 'GET', url: '/emails' });
    expect(res.statusCode).toBe(200);
    const where = findManyWheres[0] as any;
    expect(where.isDraft).toBe(false);
    expect(where.isSpam).toBe(false);
    expect(where.isTrash).toBe(false);
    const folderArm = (where.AND as any[]).find((c) => c.OR);
    expect(folderArm.OR).toContainEqual({ isSent: true });
  });

  it('a post-send row satisfies both list filters; a stuck draft satisfies neither', async () => {
    await app.inject({ method: 'GET', url: '/emails?folderType=SENT' });
    await app.inject({ method: 'GET', url: '/emails' });
    const [sentWhere, inboxWhere] = findManyWheres as any[];

    // A successfully sent row: flipped out of drafts, into Sent. (A send with
    // no deliverable transport now throws 503 instead of writing a row, so
    // 'deferred' here is just one valid enum member for the filter match.)
    const sentRow = {
      ...DRAFT_ROW,
      isDraft: false,
      isSent: true,
      folderId: 'sent-folder-id',
      folder: { type: 'SENT' },
      threadId: null,
      thread: null,
      sentAt: new Date(),
      receivedAt: new Date(),
      deliveryStatus: 'deferred',
    };
    expect(matchesWhere(sentRow, sentWhere)).toBe(true);
    expect(matchesWhere(sentRow, inboxWhere)).toBe(true);

    // What the buggy send() left behind: a draft, invisible to both lists
    // but still returned by search (which has no isDraft filter).
    const stuckDraft = { ...DRAFT_ROW, folder: null, thread: null };
    expect(matchesWhere(stuckDraft, sentWhere)).toBe(false);
    expect(matchesWhere(stuckDraft, inboxWhere)).toBe(false);
  });
});
