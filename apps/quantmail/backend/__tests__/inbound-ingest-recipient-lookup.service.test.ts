/**
 * Recipient resolution for inbound ingest — case-insensitive user lookup.
 *
 * User rows created before email normalization landed may carry mixed case
 * (e.g. `LegacyCase@quantmail.test`). The ingest path lowercases the recipient
 * address, so the lookup has to be case-insensitive (Postgres
 * `mode: 'insensitive'`, mirroring routes/auth.ts `findUserByEmailInsensitive`);
 * an exact-match `findUnique` never hits those rows and their inbound mail was
 * dropped with INBOUND_NO_RECIPIENT.
 *
 * The `user.findFirst` double below emulates Postgres `mode: 'insensitive'`
 * semantics (comparison on the lowercased value) over a seeded user table, so a
 * lowercase on-the-wire address resolves to the mixed-case legacy row exactly
 * like production does.
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

const LEGACY_USER_ID = 'user-legacy';
const CANONICAL_USER_ID = 'user-canonical';

/** Seeded users: one legacy mixed-case row, one canonical lowercase row. */
const USERS = [
  { id: LEGACY_USER_ID, email: 'LegacyCase@quantmail.test' },
  { id: CANONICAL_USER_ID, email: 'canonical@quantmail.test' },
];

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
  [key: string]: unknown;
}

type MockPrisma = ReturnType<typeof createMockPrisma>;

function createMockPrisma() {
  const rows: Row[] = [];
  const mock = {
    rows,
    user: {
      // Emulates `where: { email: { equals, mode: 'insensitive' } }`: matches
      // the seeded row regardless of the stored row's case.
      findFirst: vi.fn(
        async (args: { where: { email: { equals: string; mode?: string } } }) => {
          const wanted = args.where.email.equals.toLowerCase();
          const found = USERS.find((user) => user.email.toLowerCase() === wanted);
          return found ? { id: found.id } : null;
        },
      ),
      findUnique: vi.fn(async () => null),
    },
    emailFolder: {
      findFirst: vi.fn(async () => ({ id: 'folder-inbox' })),
    },
    emailThread: {
      findMany: vi.fn(async () => [] as unknown[]),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'thread-1',
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
      findFirst: vi.fn(async () => null),
    },
    // K1: EmailService.receive runs inside `prisma.$transaction`; the double
    // hands the callback the mock itself as the tx client.
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

/** A spy indexer, so the ingest path can complete without a real index. */
function createSpyIndexer(): EmailIndexerPort & { index: ReturnType<typeof vi.fn> } {
  return { index: vi.fn(async () => undefined) };
}

function makeAdapter(prisma: MockPrisma, indexer: EmailIndexerPort): InboundIngestAdapter {
  return new InboundIngestAdapter(prisma as never, authNeverCalled, { indexer });
}

/** The `data` object passed to the (single) email.create call. */
function emailCreateData(prisma: MockPrisma): Record<string, unknown> {
  expect(prisma.email.create).toHaveBeenCalledTimes(1);
  return (prisma.email.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
}

function message(overrides: Partial<InboundRawMessage> = {}): InboundRawMessage {
  return {
    from: 'Ada Lovelace <ada@example.com>',
    to: ['legacycase@quantmail.test'],
    subject: 'Quarterly numbers',
    text: 'Numbers attached.',
    messageId: 'CAcase-insensitive-1@mail.example.com',
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

describe('inbound ingest recipient lookup — case-insensitive user match', () => {
  it('routes inbound mail to a legacy mixed-case user row', async () => {
    // No `userId` override: the adapter must resolve the recipient itself.
    // Note the recipient is all-lowercase on the wire; the stored row is not.
    const email = await adapter.ingest(message(), { verdict: PASS_VERDICT });

    const data = emailCreateData(prisma);
    expect(data['userId']).toBe(LEGACY_USER_ID);
    expect(email.id).toBeDefined();
    // The lookup must ask for case-insensitive matching, not an exact match.
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'legacycase@quantmail.test', mode: 'insensitive' } },
    });
  });

  it('still routes a canonical lowercase user row', async () => {
    await adapter.ingest(
      message({ to: ['canonical@quantmail.test'], messageId: 'CAcase-insensitive-2@mail.example.com' }),
      { verdict: PASS_VERDICT },
    );

    expect(emailCreateData(prisma)['userId']).toBe(CANONICAL_USER_ID);
  });

  it('strips the plus-tag before the case-insensitive lookup', async () => {
    await adapter.ingest(
      message({
        to: ['LegacyCase+newsletters@quantmail.test'],
        messageId: 'CAcase-insensitive-3@mail.example.com',
      }),
      { verdict: PASS_VERDICT },
    );

    expect(emailCreateData(prisma)['userId']).toBe(LEGACY_USER_ID);
  });

  it('still rejects an address no user row matches (INBOUND_NO_RECIPIENT)', async () => {
    await expect(
      adapter.ingest(
        message({
          to: ['nobody@quantmail.test'],
          messageId: 'CAcase-insensitive-4@mail.example.com',
        }),
        { verdict: PASS_VERDICT },
      ),
    ).rejects.toMatchObject({ code: 'INBOUND_NO_RECIPIENT', statusCode: 404 });

    expect(prisma.email.create).not.toHaveBeenCalled();
  });
});
