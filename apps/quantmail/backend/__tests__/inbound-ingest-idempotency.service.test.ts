/**
 * Message-ID idempotency in the inbound ingest adapter.
 *
 * SNS delivers at least once, and the hardened webhook deliberately answers
 * non-2xx when a recipient's ingest fails so that SNS *will* redeliver. Both of
 * those depend on a second delivery of the same message being a no-op — without
 * it every retry, and every run of the admin replay endpoint, would put another
 * copy of the same mail in the mailbox.
 *
 * The `(userId, messageId)` unique index added in migration 0053 is the real
 * guard. This pre-check keeps the pipeline from using a constraint violation as
 * control flow, and these tests pin its scope: per mailbox, keyed on the
 * originating Message-ID, and never a reason to drop a message it cannot key.
 *
 * The existing ingest suites could not cover this. Their Prisma double supplies
 * only `email.create`/`email.update`, and `findByMessageId` reads a missing
 * `email.findFirst` as "not a duplicate", so the branch never ran. The double
 * here behaves like a table — what `create` inserts, `findFirst` can find, and
 * the `messageId` lands via the follow-up `update` exactly as it does in
 * Postgres — which is what makes the branch reachable at all.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AuthVerdict,
  DeliverabilityAuthService,
} from '../services/deliverability-auth.service';
import {
  InboundIngestAdapter,
  type EmailIndexerPort,
  type InboundRawMessage,
} from '../services/inbound-ingest.service';

const BOB = 'user-bob';
const CAROL = 'user-carol';
const MESSAGE_ID = 'CAredelivered@mail.example.com';

/**
 * The SES path always arrives with a verdict SES produced at SMTP time, so the
 * adapter must never re-authenticate. Throwing makes that a failing test rather
 * than a silent DNS lookup.
 */
const authNeverCalled = {
  verifyInbound: async () => {
    throw new Error('verifyInbound must not run when the caller supplies a verdict');
  },
} as unknown as DeliverabilityAuthService;

const PASS_VERDICT: AuthVerdict = {
  spf: 'pass',
  dkim: 'pass',
  dmarc: 'pass',
  aligned: true,
  details: {
    spfDomain: 'example.com',
    dkimDomain: 'example.com',
    fromDomain: 'example.com',
    spfAligned: true,
    dkimAligned: true,
    dmarcPolicy: 'none',
  },
};

/** One stored email, as the double keeps it. */
interface Row {
  id: string;
  userId?: string;
  messageId?: string | null;
  [column: string]: unknown;
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

/**
 * A Prisma double that stores what it is given. `email.create` inserts,
 * `email.update` mutates the stored row (which is how `messageId` gets there),
 * and `email.findFirst` reads back — the three together are the minimum needed
 * for a redelivery to be recognisable.
 */
function createMockPrisma() {
  const rows: Row[] = [];
  return {
    rows,
    user: { findUnique: vi.fn(async () => null) },
    emailFolder: {
      findFirst: vi.fn(async (args: { where: { userId: string; type: string } }) => ({
        id: args.where.type === 'SPAM' ? 'folder-spam' : 'folder-inbox',
      })),
    },
    emailThread: {
      findMany: vi.fn(async () => [] as unknown[]),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: `thread-${rows.length + 1}`,
        ...args.data,
      })),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: args.where.id,
        ...args.data,
      })),
    },
    email: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        const row: Row = { id: `email-${rows.length + 1}`, ...args.data };
        rows.push(row);
        return row;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = rows.find((candidate) => candidate.id === args.where.id);
        if (row) {
          Object.assign(row, args.data);
          return row;
        }
        return { id: args.where.id, ...args.data };
      }),
      findFirst: vi.fn(async (args: { where: { userId: string; messageId: string } }) => {
        const found = rows.find(
          (row) => row.userId === args.where.userId && row.messageId === args.where.messageId,
        );
        return found ?? null;
      }),
    },
  };
}

/** A spy indexer, so a redelivery re-indexing the same mail would be caught. */
function createSpyIndexer(): EmailIndexerPort & { index: ReturnType<typeof vi.fn> } {
  return { index: vi.fn(async () => undefined) };
}

function makeAdapter(prisma: MockPrisma, indexer: EmailIndexerPort): InboundIngestAdapter {
  return new InboundIngestAdapter(prisma as never, authNeverCalled, { indexer });
}

/** The same notification SES would post twice. */
function message(overrides: Partial<InboundRawMessage> = {}): InboundRawMessage {
  return {
    from: 'Ada Lovelace <ada@example.com>',
    to: ['bob@quantmail.in'],
    subject: 'Quarterly numbers',
    text: 'Numbers attached.',
    messageId: MESSAGE_ID,
    date: new Date('2026-08-31T09:00:00.000Z'),
    ...overrides,
  };
}

let prisma: MockPrisma;
let indexer: ReturnType<typeof createSpyIndexer>;
let adapter: InboundIngestAdapter;

beforeEach(() => {
  prisma = createMockPrisma();
  indexer = createSpyIndexer();
  adapter = makeAdapter(prisma, indexer);
});

describe('the first delivery records the key a redelivery is recognised by', () => {
  it('persists the originating Message-ID on the stored email', async () => {
    const stored = await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });

    expect(prisma.email.create).toHaveBeenCalledTimes(1);
    expect(prisma.email.update).toHaveBeenCalledWith({
      where: { id: stored.id },
      data: { messageId: MESSAGE_ID },
    });
    // Read back through the double: this is the row a later lookup has to match.
    expect(prisma.rows).toEqual([expect.objectContaining({ userId: BOB, messageId: MESSAGE_ID })]);
  });

  it('asks whether the message is already here before writing anything', async () => {
    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });

    expect(prisma.email.findFirst).toHaveBeenCalledWith({
      where: { userId: BOB, messageId: MESSAGE_ID },
    });
    // The ordering is the property. A lookup made after the insert would find the
    // row it just wrote and call every message a duplicate of itself.
    const lookup = prisma.email.findFirst.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER;
    const insert = prisma.email.create.mock.invocationCallOrder[0] ?? 0;
    expect(lookup).toBeLessThan(insert);
  });
});

describe('a redelivery of the same message is a no-op', () => {
  it('returns the stored copy instead of inserting a second row', async () => {
    const first = await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });
    const second = await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });

    expect(second.id).toBe(first.id);
    expect(prisma.email.create).toHaveBeenCalledTimes(1);
    expect(prisma.rows).toHaveLength(1);
  });

  it('does not re-index, re-thread or re-stamp the duplicate', async () => {
    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });
    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });

    // Indexing twice would show the mail twice in search while the mailbox holds
    // one copy; a second thread would split the conversation in half.
    expect(indexer.index).toHaveBeenCalledTimes(1);
    expect(prisma.emailThread.create).toHaveBeenCalledTimes(1);
    expect(prisma.email.update).toHaveBeenCalledTimes(1);
  });

  it('recognises a redelivery whose recipient list was resolved differently', async () => {
    // SNS re-posts the same S3 object, and the webhook can legitimately resolve a
    // different address for it — a plus-tag, or a Bcc that appears in
    // `receipt.recipients` but in no header. The Message-ID is the only stable
    // identity, so a changed To must not defeat the check.
    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });
    await adapter.ingest(message({ to: ['bob+newsletters@quantmail.in'] }), {
      userId: BOB,
      verdict: PASS_VERDICT,
    });

    expect(prisma.email.create).toHaveBeenCalledTimes(1);
  });
});

describe('the check is scoped to one mailbox and one Message-ID', () => {
  it('delivers the same message to a second recipient', async () => {
    // One message addressed to two QuantMail users is two ingests by design. A
    // global Message-ID check would deliver it to whichever mailbox was resolved
    // first and silently drop the other copy.
    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });
    await adapter.ingest(message(), { userId: CAROL, verdict: PASS_VERDICT });

    expect(prisma.rows.map((row) => [row.userId, row.messageId])).toEqual([
      [BOB, MESSAGE_ID],
      [CAROL, MESSAGE_ID],
    ]);
  });

  it('treats a different Message-ID in the same mailbox as new mail', async () => {
    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });
    await adapter.ingest(message({ messageId: 'second@mail.example.com' }), {
      userId: BOB,
      verdict: PASS_VERDICT,
    });

    expect(prisma.email.create).toHaveBeenCalledTimes(2);
    expect(indexer.index).toHaveBeenCalledTimes(2);
  });

  it('keys a quarantined copy the same way', async () => {
    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT, quarantine: true });
    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT, quarantine: true });

    expect(prisma.email.create).toHaveBeenCalledTimes(1);
    expect(prisma.rows[0]?.isSpam).toBe(true);
    expect(indexer.index).not.toHaveBeenCalled();
  });
});

describe('a message the check cannot key is still delivered', () => {
  it('ingests a message with no Message-ID rather than dropping it', async () => {
    const stored = await adapter.ingest(message({ messageId: null }), {
      userId: BOB,
      verdict: PASS_VERDICT,
    });

    expect(stored.id).toBe('email-1');
    expect(prisma.email.findFirst).not.toHaveBeenCalled();
    // Nothing stable to key on, so the stamping update is skipped as well.
    expect(prisma.email.update).not.toHaveBeenCalled();
  });

  it('accepts a second copy of a Message-ID-less message — a stated limitation', async () => {
    // Written down rather than hidden: mail that carries no Message-ID cannot be
    // deduplicated, and inventing a key from the content would make two genuinely
    // different messages collide, which loses mail instead of duplicating it.
    await adapter.ingest(message({ messageId: null }), { userId: BOB, verdict: PASS_VERDICT });
    await adapter.ingest(message({ messageId: null }), { userId: BOB, verdict: PASS_VERDICT });

    expect(prisma.rows).toHaveLength(2);
  });
});

describe('the lookup suppresses noise; the unique index is the guarantee', () => {
  it('ingests when the client cannot look duplicates up at all', async () => {
    // The shape the other ingest suites use — a double with no `email.findFirst`.
    // An absent lookup must not stop mail; it only means a redelivery costs a
    // constraint violation instead of a cheap read.
    const bare = createMockPrisma();
    delete (bare.email as { findFirst?: unknown }).findFirst;

    const stored = await makeAdapter(bare, indexer).ingest(message(), {
      userId: BOB,
      verdict: PASS_VERDICT,
    });

    expect(stored.id).toBe('email-1');
    expect(bare.email.create).toHaveBeenCalledTimes(1);
  });

  it('ingests when the lookup itself fails', async () => {
    prisma.email.findFirst.mockRejectedValueOnce(new Error('connection reset'));

    await expect(
      adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT }),
    ).resolves.toMatchObject({ id: 'email-1' });
  });
});
