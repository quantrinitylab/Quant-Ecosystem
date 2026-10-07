import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DeliverabilityAuthService,
  type DnsResolverPort,
} from '../services/deliverability-auth.service';
import {
  InboundIngestAdapter,
  type EmailIndexerPort,
  type InboundAutoResponderPort,
  type InboundRawMessage,
} from '../services/inbound-ingest.service';
import { MailFilterService } from '../services/mail-filter.service';
import { VacationResponderService } from '../services/vacation-responder.service';

/**
 * Integration tests for the inbound pipeline's filter-rules and vacation
 * auto-responder wiring (the "make it real" step): a received message is run
 * through the user's enabled filters and, when eligible, an out-of-office reply
 * is dispatched. Filters and the responder are opt-in deps, so these exercise
 * the REAL MailFilterService / VacationResponderService over a mocked Prisma.
 */

const RECIPIENT = 'alice@quantmail.test';
const RECIPIENT_USER_ID = 'user-1';
const FOLDERS: Record<string, string> = {
  INBOX: 'folder-inbox',
  SPAM: 'folder-spam',
  ARCHIVE: 'folder-archive',
  TRASH: 'folder-trash',
};

class FakeDns implements DnsResolverPort {
  async resolveTxt(host: string): Promise<string[][]> {
    if (host.toLowerCase() === 'example.com') return [['v=spf1 ip4:203.0.113.10 -all']];
    throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  }
  async resolveMx(): Promise<Array<{ exchange: string; priority: number }>> {
    throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  }
  async resolve4(): Promise<string[]> {
    throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  }
  async resolve6(): Promise<string[]> {
    throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
  }
}

interface SeededFilter {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchAll: boolean;
  conditions: unknown;
  actions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function createMockPrisma(opts: {
  filters?: SeededFilter[];
  responder?: Record<string, unknown> | null;
  priorReplyLog?: Record<string, unknown> | null;
}) {
  return {
    user: {
      findUnique: vi.fn(async (a: { where: { email: string } }) =>
        a.where.email === RECIPIENT ? { id: RECIPIENT_USER_ID } : null,
      ),
    },
    emailFolder: {
      findFirst: vi.fn(async (a: { where: { userId: string; type: string } }) => {
        const id = FOLDERS[a.where.type];
        return id ? { id } : null;
      }),
    },
    emailThread: {
      findMany: vi.fn(async () => [] as unknown[]),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({
        id: 'thread-1',
        ...a.data,
      })),
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: a.where.id,
        ...a.data,
      })),
    },
    email: {
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 'email-1', ...a.data })),
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => ({
        id: a.where.id,
        ...a.data,
      })),
    },
    mailFilter: {
      findMany: vi.fn(async () => opts.filters ?? []),
    },
    vacationResponder: {
      findUnique: vi.fn(async () => opts.responder ?? null),
    },
    vacationAutoReplyLog: {
      findFirst: vi.fn(async () => opts.priorReplyLog ?? null),
      upsert: vi.fn(async (a: { create: Record<string, unknown> }) => ({
        id: 'log-1',
        ...a.create,
      })),
    },
    contact: {
      findFirst: vi.fn(async () => null),
    },
  };
}

function createSpyIndexer(): EmailIndexerPort & { index: ReturnType<typeof vi.fn> } {
  return { index: vi.fn(async () => undefined) };
}

function createSpyResponder(): InboundAutoResponderPort & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(async () => undefined) };
}

function makeFilter(overrides: Partial<SeededFilter>): SeededFilter {
  return {
    id: 'f-1',
    userId: RECIPIENT_USER_ID,
    name: 'Rule',
    enabled: true,
    priority: 0,
    matchAll: true,
    conditions: [{ from: 'news' }],
    actions: [{ markRead: true }],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

function passingMessage(): InboundRawMessage {
  return {
    from: 'Newsletter <news@example.com>',
    to: [RECIPIENT],
    subject: 'Your weekly digest',
    text: 'Hello there.',
    html: '<p>Hello there.</p>',
    messageId: '<pass-1@example.com>',
    inReplyTo: null,
    date: new Date('2024-06-01T00:00:00Z'),
    envelopeFrom: 'bounce@example.com',
    clientIp: '203.0.113.10',
  };
}

function emailUpdateData(prisma: ReturnType<typeof createMockPrisma>): Record<string, unknown> {
  // The first email.update writes the Message-ID; the filter-action update is
  // the last call. Read the most recent update's data.
  const calls = prisma.email.update.mock.calls;
  const call = calls[calls.length - 1]?.[0] as { data: Record<string, unknown> } | undefined;
  return call?.data ?? {};
}

function buildAdapter(
  prisma: ReturnType<typeof createMockPrisma>,
  extra: {
    indexer: EmailIndexerPort;
    autoResponder?: InboundAutoResponderPort;
    withFilters?: boolean;
    withVacation?: boolean;
  },
): InboundIngestAdapter {
  const auth = new DeliverabilityAuthService(prisma as never, { dns: new FakeDns() });
  return new InboundIngestAdapter(prisma as never, auth, {
    indexer: extra.indexer,
    ...(extra.autoResponder ? { autoResponder: extra.autoResponder } : {}),
    ...(extra.withFilters ? { filters: new MailFilterService(prisma as never) } : {}),
    ...(extra.withVacation ? { vacation: new VacationResponderService(prisma as never) } : {}),
  });
}

describe('InboundIngestAdapter — filter-rules wiring', () => {
  let indexer: ReturnType<typeof createSpyIndexer>;

  beforeEach(() => {
    indexer = createSpyIndexer();
  });

  it('applies markRead + label + archive from a matching filter, and still indexes', async () => {
    const prisma = createMockPrisma({
      filters: [makeFilter({ actions: [{ markRead: true, addLabelId: 'lbl-1', archive: true }] })],
    });
    const adapter = buildAdapter(prisma, { indexer, withFilters: true });

    await adapter.ingest(passingMessage());

    const data = emailUpdateData(prisma);
    expect(data['isRead']).toBe(true);
    expect(data['labels']).toEqual(['lbl-1']);
    expect(data['folderId']).toBe(FOLDERS.ARCHIVE);
    // Archived mail is still indexed (only spam/delete suppress indexing).
    expect(indexer.index).toHaveBeenCalledTimes(1);
  });

  it('quarantines via filter markSpam and suppresses indexing', async () => {
    const prisma = createMockPrisma({
      filters: [makeFilter({ actions: [{ markSpam: true }] })],
    });
    const adapter = buildAdapter(prisma, { indexer, withFilters: true });

    await adapter.ingest(passingMessage());

    const data = emailUpdateData(prisma);
    expect(data['isSpam']).toBe(true);
    expect(data['folderId']).toBe(FOLDERS.SPAM);
    expect(indexer.index).not.toHaveBeenCalled();
  });

  it('soft-deletes via filter delete (routes to TRASH) and suppresses indexing', async () => {
    const prisma = createMockPrisma({
      filters: [makeFilter({ actions: [{ delete: true }] })],
    });
    const adapter = buildAdapter(prisma, { indexer, withFilters: true });

    await adapter.ingest(passingMessage());

    const data = emailUpdateData(prisma);
    expect(data['isTrash']).toBe(true);
    expect(data['deletedAt']).toBeInstanceOf(Date);
    expect(data['folderId']).toBe(FOLDERS.TRASH);
    expect(indexer.index).not.toHaveBeenCalled();
  });

  it('forwards via filter forwardTo through the auto-responder port', async () => {
    const prisma = createMockPrisma({
      filters: [makeFilter({ actions: [{ forwardTo: 'team@quantmail.test' }] })],
    });
    const autoResponder = createSpyResponder();
    const adapter = buildAdapter(prisma, { indexer, autoResponder, withFilters: true });

    await adapter.ingest(passingMessage());

    expect(autoResponder.send).toHaveBeenCalledTimes(1);
    expect(autoResponder.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'team@quantmail.test', kind: 'filter-forward' }),
    );
  });

  it('does nothing special when no filter matches', async () => {
    const prisma = createMockPrisma({
      filters: [makeFilter({ conditions: [{ from: 'no-match-domain' }] })],
    });
    const adapter = buildAdapter(prisma, { indexer, withFilters: true });

    await adapter.ingest(passingMessage());

    expect(prisma.email.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isRead: true }) }),
    );
    expect(indexer.index).toHaveBeenCalledTimes(1);
  });
});

describe('InboundIngestAdapter — vacation auto-responder wiring', () => {
  let indexer: ReturnType<typeof createSpyIndexer>;
  let autoResponder: ReturnType<typeof createSpyResponder>;

  beforeEach(() => {
    indexer = createSpyIndexer();
    autoResponder = createSpyResponder();
  });

  it('sends a one-shot auto-reply to an eligible sender', async () => {
    const prisma = createMockPrisma({
      responder: {
        userId: RECIPIENT_USER_ID,
        enabled: true,
        subject: 'OOO',
        message: 'Away until July.',
        startAt: null,
        endAt: null,
        onlyContacts: false,
        intervalDays: 4,
      },
      priorReplyLog: null,
    });
    const adapter = buildAdapter(prisma, { indexer, autoResponder, withVacation: true });

    await adapter.ingest(passingMessage());

    expect(autoResponder.send).toHaveBeenCalledTimes(1);
    expect(autoResponder.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'news@example.com',
        subject: 'OOO',
        bodyPlain: 'Away until July.',
        kind: 'vacation-reply',
      }),
    );
    // The reply is logged for interval rate-limiting.
    expect(prisma.vacationAutoReplyLog.upsert).toHaveBeenCalledTimes(1);
  });

  it('does not auto-reply when the responder is disabled', async () => {
    const prisma = createMockPrisma({
      responder: {
        userId: RECIPIENT_USER_ID,
        enabled: false,
        subject: 'OOO',
        message: 'Away.',
        startAt: null,
        endAt: null,
        onlyContacts: false,
        intervalDays: 4,
      },
    });
    const adapter = buildAdapter(prisma, { indexer, autoResponder, withVacation: true });

    await adapter.ingest(passingMessage());

    expect(autoResponder.send).not.toHaveBeenCalled();
  });
});
