// @vitest-environment node
// ============================================================================
// fix/qm-followup-auto-dismiss-2 — dismiss-on-reply in the inbound ingest path.
//
// The bug: a persisted follow-up reminder stayed ACTIVE forever until the
// user manually dismissed it. When the recipient replied after the reminder
// was set, the People-home "Due reminders" strip still nudged the user to
// follow up on a thread that already got a reply (Gmail/Superhuman
// auto-resolve on reply; QuantMail had no reply hook anywhere).
//
// These tests pin the real contract on the REAL InboundIngestAdapter with a
// Prisma double that behaves like tables:
//
//   1. Inbound mail in a thread with an ACTIVE reminder auto-dismisses it
//      (dismissedAt set via updateMany on (userId, threadId)).
//   2. A legacy threadId-null row keyed on the sent email's id is dismissed
//      when that email lives in the replied thread.
//   3. Quarantined (spam) inbound does NOT dismiss — spam is not a reply.
//   4. Ingest still succeeds when no reminder exists (no crash on the
//      dismiss path).
//   5. A dismissal fault never breaks mail ingest (best-effort swallowed).
// ============================================================================

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
const MESSAGE_ID = 'CAreply@mail.example.com';

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

interface Row {
  id: string;
  userId?: string;
  messageId?: string | null;
  threadId?: string | null;
  [column: string]: unknown;
}

interface ReminderRow {
  id: string;
  userId: string;
  emailId: string;
  threadId: string | null;
  dismissedAt: Date | null;
  [column: string]: unknown;
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

interface UpdateManyWhere {
  userId: string;
  threadId: string | null;
  dismissedAt: null;
  emailId?: { in: string[] };
}

function createMockPrisma() {
  const rows: Row[] = [];
  const reminders: ReminderRow[] = [];
  const mock = {
    rows,
    reminders,
    user: { findFirst: vi.fn(async () => null) },
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
      findFirst: vi.fn(async (args: { where: { userId: string; messageId?: string } }) => {
        const found = rows.find(
          (row) =>
            row.userId === args.where.userId &&
            (args.where.messageId === undefined || row.messageId === args.where.messageId),
        );
        return found ?? null;
      }),
      findMany: vi.fn(
        async (args: { where: { userId?: string; threadId?: string | null } }) => {
          return rows.filter(
            (row) =>
              (args.where.userId === undefined || row.userId === args.where.userId) &&
              (args.where.threadId === undefined || row.threadId === args.where.threadId),
          );
        },
      ),
    },
    followUpReminder: {
      updateMany: vi.fn(async (args: { where: UpdateManyWhere; data: { dismissedAt: Date } }) => {
        let count = 0;
        for (const reminder of reminders) {
          if (reminder.userId !== args.where.userId) continue;
          if (reminder.dismissedAt !== null) continue;
          if (reminder.threadId !== args.where.threadId) continue;
          if (args.where.emailId && !args.where.emailId.in.includes(reminder.emailId)) continue;
          reminder.dismissedAt = args.data.dismissedAt;
          count += 1;
        }
        return { count };
      }),
    },
    outboxEvent: {
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: `outbox-${rows.length + 1}`,
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

function createSpyIndexer(): EmailIndexerPort & { index: ReturnType<typeof vi.fn> } {
  return { index: vi.fn(async () => undefined) };
}

function makeAdapter(prisma: MockPrisma, indexer: EmailIndexerPort): InboundIngestAdapter {
  return new InboundIngestAdapter(prisma as never, authNeverCalled, { indexer });
}

function message(overrides: Partial<InboundRawMessage> = {}): InboundRawMessage {
  return {
    from: 'Ada Lovelace <ada@example.com>',
    to: ['bob@quantmail.in'],
    subject: 'Re: Quarterly numbers',
    text: 'Here are the numbers you asked for.',
    messageId: MESSAGE_ID,
    date: new Date('2026-10-19T04:00:00.000Z'),
    ...overrides,
  };
}

function seedReminder(
  prisma: MockPrisma,
  overrides: Partial<ReminderRow> = {},
): ReminderRow {
  const reminder: ReminderRow = {
    id: `rem-${prisma.reminders.length + 1}`,
    userId: BOB,
    emailId: 'sent-1',
    threadId: 'thread-1',
    dismissedAt: null,
    remindAt: new Date('2026-10-26T09:00:00.000Z'),
    createdAt: new Date('2026-10-18T10:00:00.000Z'),
    ...overrides,
  };
  prisma.reminders.push(reminder);
  return reminder;
}

let prisma: MockPrisma;
let indexer: ReturnType<typeof createSpyIndexer>;
let adapter: InboundIngestAdapter;

beforeEach(() => {
  prisma = createMockPrisma();
  indexer = createSpyIndexer();
  adapter = makeAdapter(prisma, indexer);
});

describe('dismiss-on-reply in the inbound ingest path', () => {
  it('auto-dismisses an active reminder on the replied thread', async () => {
    const reminder = seedReminder(prisma);

    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });

    expect(prisma.followUpReminder.updateMany).toHaveBeenCalledWith({
      where: { userId: BOB, threadId: 'thread-1', dismissedAt: null },
      data: { dismissedAt: expect.any(Date) },
    });
    expect(reminder.dismissedAt).toBeInstanceOf(Date);
  });

  it('dismisses a legacy threadId-null row keyed on the sent email id', async () => {
    // Seed the sent email in the thread first (as EmailService.receive
    // would have stored it), then the legacy reminder keyed on it. The
    // inbound's thread id comes from the emailThread.create double, which
    // derives it from the stored-row count at ingest time — i.e. AFTER this
    // push, so +2 not +1.
    const expectedThreadId = `thread-${prisma.rows.length + 2}`;
    prisma.rows.push({
      id: 'sent-1',
      userId: BOB,
      threadId: expectedThreadId,
      isSent: true,
    });
    const legacy = seedReminder(prisma, {
      emailId: 'sent-1',
      threadId: null,
    });

    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });

    expect(legacy.dismissedAt).toBeInstanceOf(Date);
  });

  it('does not dismiss on a quarantined (spam) inbound — spam is not a reply', async () => {
    const reminder = seedReminder(prisma);

    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT, quarantine: true });

    expect(prisma.followUpReminder.updateMany).not.toHaveBeenCalled();
    expect(reminder.dismissedAt).toBeNull();
  });

  it('ingest succeeds when no reminder exists', async () => {
    const stored = await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });

    expect(stored.id).toBe('email-1');
    expect(prisma.followUpReminder.updateMany).toHaveBeenCalled();
    expect(prisma.reminders).toHaveLength(0);
  });

  it('a dismissal fault never breaks mail ingest', async () => {
    seedReminder(prisma);
    prisma.followUpReminder.updateMany.mockRejectedValueOnce(new Error('DB down'));

    const stored = await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });

    // The mail landed and was indexed; the reminder dismissal failed
    // silently (best-effort) and ingest did not throw.
    expect(stored.id).toBe('email-1');
    expect(indexer.index).toHaveBeenCalledTimes(1);
  });

  it('never dismisses another user\u2019s reminder on the same thread', async () => {
    const mine = seedReminder(prisma, { userId: BOB });
    const theirs = seedReminder(prisma, {
      id: 'rem-other',
      userId: 'user-carol',
      threadId: 'thread-1',
    });

    await adapter.ingest(message(), { userId: BOB, verdict: PASS_VERDICT });

    expect(mine.dismissedAt).toBeInstanceOf(Date);
    expect(theirs.dismissedAt).toBeNull();
  });
});
