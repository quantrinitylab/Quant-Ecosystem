/**
 * K1 — the mail outbox/event spine.
 *
 * These tests prove the doc-05 contract: every core mail mutation writes its
 * domain row AND its `outbox_events` row in the SAME transaction, so the
 * cdc-relay poller can never see a state change without its event (or vice
 * versa). The fake Prisma below implements real commit/rollback semantics —
 * `$transaction` snapshots state, commits on success, and restores the snapshot
 * when the callback throws — so the rollback tests prove atomicity, not just
 * call order.
 *
 * Event names asserted here are the exact spec'd names from
 * docs/quant-architecture/products/quantmail/backend/*-events.md.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../services/email.service';
import { emitOutbox, MailOutboxEvents } from '../lib/outbox-events';

vi.mock('../lib/ses-sender', () => ({
  isSesConfigured: () => true,
  sendViaSes: vi.fn(async () => {
    throw new Error('SES unavailable in tests');
  }),
}));

type Row = Record<string, unknown>;

interface TxPrisma {
  emails: Map<string, Row>;
  outbox: Row[];
  txCalls: number;
  prisma: {
    $transaction: (cb: (tx: unknown) => Promise<unknown>) => Promise<unknown>;
    email: {
      findUnique: (args: { where: { id: string } }) => Promise<Row | null>;
      findFirst: (args: unknown) => Promise<Row | null>;
    };
    emailThread: {
      findMany: () => Promise<Row[]>;
      findUnique: () => Promise<null>;
      create: (args: { data: Row }) => Promise<Row>;
      update: (args: { where: { id: string }; data: Row }) => Promise<Row>;
    };
    user: {
      findUnique: () => Promise<Row>;
      findMany: (args?: unknown) => Promise<Row[]>;
    };
    mailFilter: { findMany: () => Promise<Row[]> };
  };
}

/**
 * A Prisma double with genuine transaction semantics: `$transaction`
 * deep-snapshots the stores, runs the callback against a tx-scoped client, and
 * rolls everything back when the callback throws. `failOutbox` makes the
 * outbox write throw so tests can prove the domain write rolls back with it.
 */
function createTxPrisma(opts: { failOutbox?: boolean; recipients?: Row[] } = {}): TxPrisma {
  const emails = new Map<string, Row>();
  const outbox: Row[] = [];
  let emailSeq = 0;
  let outboxSeq = 0;
  let txCalls = 0;
  const failOutbox = opts.failOutbox ?? false;

  const txClient = () => ({
    email: {
      create: async (args: { data: Row }) => {
        const row: Row = { id: `email-${++emailSeq}`, ...args.data };
        emails.set(row['id'] as string, row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Row }) => {
        const row = emails.get(args.where.id);
        if (!row) throw new Error(`email not found: ${args.where.id}`);
        Object.assign(row, args.data);
        return row;
      },
      // QM-BACK-002: versionedUpdate runs a conditional updateMany (+ version
      // reads) inside the tx. The fake honours the version predicate and the
      // { increment } marker so conflict/rollback semantics stay truthful.
      findUnique: async (args: { where: { id: string } }) => emails.get(args.where.id) ?? null,
      updateMany: async (args: { where: { id?: string; version?: number }; data: Row }) => {
        let count = 0;
        for (const [id, row] of emails) {
          if (args.where.id !== undefined && id !== args.where.id) continue;
          if (args.where.version !== undefined && (row['version'] ?? 0) !== args.where.version)
            continue;
          const data: Row = { ...args.data };
          const bump = data['version'] as { increment?: number } | undefined;
          if (bump && typeof bump === 'object' && typeof bump.increment === 'number') {
            data['version'] = ((row['version'] as number) ?? 0) + bump.increment;
          }
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
    },
    outboxEvent: {
      create: async (args: { data: Row }) => {
        if (failOutbox) throw new Error('outbox write failed');
        const row: Row = {
          id: `outbox-${++outboxSeq}`,
          publishedAt: null,
          createdAt: new Date(),
          ...args.data,
        };
        outbox.push(row);
        return row;
      },
    },
  });

  const prisma = {
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      txCalls++;
      // Deep snapshot: updates mutate rows in place, so a shallow copy would
      // let a rolled-back update leak into the "committed" state.
      const emailsSnap = new Map<string, Row>(
        [...emails.entries()].map(([k, v]) => [k, { ...v }]),
      );
      const outboxLen = outbox.length;
      try {
        return await cb(txClient());
      } catch (err) {
        emails.clear();
        for (const [k, v] of emailsSnap) emails.set(k, v);
        outbox.length = outboxLen;
        throw err;
      }
    },
    email: {
      findUnique: async (args: { where: { id: string } }) =>
        emails.get(args.where.id) ?? null,
      findFirst: async () => null,
    },
    emailThread: {
      findMany: async () => [] as Row[],
      findUnique: async () => null,
      create: async (args: { data: Row }) => ({ id: 'thread-1', ...args.data }),
      update: async (args: { where: { id: string }; data: Row }) => ({
        id: args.where.id,
        ...args.data,
      }),
    },
    user: {
      findUnique: async () => ({
        id: 'user-1',
        email: 'user-1@quantmail.in',
        username: 'user1',
        displayName: 'User One',
      }),
      findMany: async () => opts.recipients ?? [],
    },
    mailFilter: { findMany: async () => [] as Row[] },
  };

  return {
    emails,
    outbox,
    get txCalls() {
      return txCalls;
    },
    prisma: prisma as TxPrisma['prisma'],
  };
}

function createAllowAllSuppression() {
  return {
    filterAllowedRecipients: vi.fn(async (recipients: string[]) => ({
      allowed: recipients,
      suppressed: [],
    })),
  };
}

function createWorkingPipeline() {
  return {
    enqueueSend: vi.fn(async () => 'job-1'),
    cancelSend: vi.fn(async () => true),
    getEmail: vi.fn(async () => null),
  };
}

function seedDraft(db: TxPrisma, overrides: Row = {}): Row {
  const row: Row = {
    id: 'email-1',
    userId: 'user-1',
    toAddresses: [],
    ccAddresses: [],
    bccAddresses: [],
    subject: 'Hello',
    bodyHtml: '',
    bodyPlain: 'hi',
    fromAddress: 'user-1@quantmail.in',
    fromName: 'User One',
    isDraft: true,
    isSent: false,
    threadId: 'thread-1',
    labels: [],
    ...overrides,
  };
  db.emails.set(row['id'] as string, row);
  return row;
}

function lastOutbox(db: TxPrisma): Row {
  expect(db.outbox.length).toBeGreaterThan(0);
  return db.outbox[db.outbox.length - 1]!;
}

describe('K1 mail outbox spine', () => {
  let db: TxPrisma;

  beforeEach(() => {
    db = createTxPrisma();
  });

  describe('emitOutbox helper', () => {
    it('writes the exact outbox row shape the cdc-relay polls', async () => {
      const tx = {
        outboxEvent: {
          create: vi.fn(async (args: { data: Row }) => ({ id: 'e1', ...args.data })),
        },
      };
      await emitOutbox(tx, {
        event: MailOutboxEvents.messageReceived,
        aggregateType: 'Email',
        aggregateId: 'email-9',
        payload: { userId: 'user-1' },
      });
      expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
      const data = tx.outboxEvent.create.mock.calls[0]![0].data as Row;
      expect(data.aggregateType).toBe('Email');
      expect(data.aggregateId).toBe('email-9');
      expect(data.eventType).toBe('mail.message.received.v1');
      expect(data.payload).toMatchObject({ userId: 'user-1' });
      expect(typeof (data.payload as Row)['occurredAt']).toBe('string');
    });
  });

  describe('compose (draft save)', () => {
    it('emits mail.draft.create in the same transaction as the draft row', async () => {
      const service = new EmailService(db.prisma as never);
      const draft = await service.compose({
        userId: 'user-1',
        toAddresses: ['a@example.com'],
        subject: 'Draft',
        bodyPlain: 'body',
      });

      expect(db.txCalls).toBe(1);
      expect(db.emails.get(draft.id)).toMatchObject({ isDraft: true });
      const event = lastOutbox(db);
      expect(event['eventType']).toBe('mail.draft.create');
      expect(event['aggregateType']).toBe('Email');
      expect(event['aggregateId']).toBe(draft.id);
      expect(event['publishedAt']).toBeNull();
    });

    it('rolls back the draft when the outbox write fails', async () => {
      db = createTxPrisma({ failOutbox: true });
      const service = new EmailService(db.prisma as never);
      await expect(
        service.compose({
          userId: 'user-1',
          toAddresses: ['a@example.com'],
          subject: 'Draft',
          bodyPlain: 'body',
        }),
      ).rejects.toThrow('outbox write failed');
      expect(db.emails.size).toBe(0);
      expect(db.outbox.length).toBe(0);
    });
  });

  describe('receive (inbound ingest)', () => {
    it('emits mail.message.received.v1 in the same transaction as the message row', async () => {
      const service = new EmailService(db.prisma as never);
      const email = await service.receive({
        userId: 'user-1',
        folderId: 'folder-inbox',
        fromAddress: 'bob@example.com',
        toAddresses: ['user-1@quantmail.in'],
        subject: 'Inbound',
        threadId: 'thread-7',
        deliveryStatus: 'delivered',
      });

      expect(db.txCalls).toBe(1);
      expect(db.emails.get(email.id)).toBeDefined();
      const event = lastOutbox(db);
      expect(event['eventType']).toBe('mail.message.received.v1');
      expect(event['aggregateType']).toBe('Email');
      expect(event['aggregateId']).toBe(email.id);
      expect(event['payload']).toMatchObject({
        userId: 'user-1',
        threadId: 'thread-7',
        deliveryStatus: 'delivered',
      });
    });

    it('rolls back the message when the outbox write fails', async () => {
      db = createTxPrisma({ failOutbox: true });
      const service = new EmailService(db.prisma as never);
      await expect(
        service.receive({
          userId: 'user-1',
          folderId: 'folder-inbox',
          fromAddress: 'bob@example.com',
          toAddresses: ['user-1@quantmail.in'],
          subject: 'Inbound',
        }),
      ).rejects.toThrow('outbox write failed');
      expect(db.emails.size).toBe(0);
      expect(db.outbox.length).toBe(0);
    });
  });

  describe('send', () => {
    it('emits mail.outbound.submitted.v1 when delivered immediately', async () => {
      seedDraft(db);
      const service = new EmailService(db.prisma as never, undefined, createAllowAllSuppression());
      const sent = await service.send('user-1', 'email-1', 'folder-sent');

      expect(sent.isSent).toBe(true);
      expect(db.emails.get('email-1')).toMatchObject({
        isSent: true,
        isDraft: false,
        deliveryStatus: 'delivered',
      });
      const event = lastOutbox(db);
      expect(event['eventType']).toBe('mail.outbound.submitted.v1');
      expect(event['aggregateId']).toBe('email-1');
      expect(event['payload']).toMatchObject({ userId: 'user-1', deliveryStatus: 'delivered' });
    });

    it('emits mail.outbound.queued.v1 when handed to the durable pipeline', async () => {
      seedDraft(db, { toAddresses: ['a@gmail.com'] });
      const pipeline = createWorkingPipeline();
      const service = new EmailService(db.prisma as never, pipeline as never, createAllowAllSuppression());
      await service.send('user-1', 'email-1', 'folder-sent', { delayMs: 60_000 });

      expect(pipeline.enqueueSend).toHaveBeenCalled();
      expect(db.emails.get('email-1')).toMatchObject({ deliveryStatus: 'queued' });
      const event = lastOutbox(db);
      expect(event['eventType']).toBe('mail.outbound.queued.v1');
      expect(event['payload']).toMatchObject({ deliveryStatus: 'queued' });
    });

    it('emits mail.outbound.deferred.v1 when the provider send fails transiently', async () => {
      seedDraft(db, { toAddresses: ['a@gmail.com'] });
      const service = new EmailService(db.prisma as never, undefined, createAllowAllSuppression());
      await service.send('user-1', 'email-1', 'folder-sent');

      expect(db.emails.get('email-1')).toMatchObject({ deliveryStatus: 'deferred' });
      const event = lastOutbox(db);
      expect(event['eventType']).toBe('mail.outbound.deferred.v1');
      expect(event['payload']).toMatchObject({ deliveryStatus: 'deferred' });
    });

    it('rolls back the sent flip when the outbox write fails', async () => {
      db = createTxPrisma({ failOutbox: true });
      seedDraft(db);
      const service = new EmailService(db.prisma as never, undefined, createAllowAllSuppression());
      await expect(service.send('user-1', 'email-1', 'folder-sent')).rejects.toThrow(
        'outbox write failed',
      );
      // The draft must NOT have flipped to sent: the whole transaction rolled back.
      expect(db.emails.get('email-1')).toMatchObject({ isDraft: true, isSent: false });
      expect(db.outbox.length).toBe(0);
    });
  });

  describe('undoSend', () => {
    it('emits mail.outbound.cancelled.v1 when a queued send is undone', async () => {
      seedDraft(db, { isDraft: false, isSent: true, deliveryStatus: 'queued', sentAt: new Date() });
      const pipeline = createWorkingPipeline();
      const service = new EmailService(db.prisma as never, pipeline as never, createAllowAllSuppression());
      const undone = await service.undoSend('user-1', 'email-1');

      expect(undone.isDraft).toBe(true);
      const event = lastOutbox(db);
      expect(event['eventType']).toBe('mail.outbound.cancelled.v1');
      expect(event['aggregateId']).toBe('email-1');
    });
  });

  describe('deliverInternally', () => {
    it('emits mail.message.received.v1 for each internal recipient copy', async () => {
      db = createTxPrisma({
        recipients: [{ id: 'user-2', email: 'user-2@quantmail.in', username: 'user2' }],
      });
      const service = new EmailService(db.prisma as never);
      const delivered = await service.deliverInternally({
        fromUserId: 'user-1',
        subject: 'Internal',
        bodyPlain: 'hi',
        toAddresses: ['user-2@quantmail.in'],
      });

      expect(delivered).toBe(1);
      const copies = [...db.emails.values()].filter((r) => r['userId'] === 'user-2');
      expect(copies).toHaveLength(1);
      const event = lastOutbox(db);
      expect(event['eventType']).toBe('mail.message.received.v1');
      expect(event['aggregateType']).toBe('Email');
      expect(event['aggregateId']).toBe(copies[0]!['id']);
      expect(event['payload']).toMatchObject({ userId: 'user-2', deliveryStatus: 'delivered' });
    });
  });

  describe('archive', () => {
    it('emits mail.thread.archived.v1 in the same transaction as the move', async () => {
      seedDraft(db, { isDraft: false });
      const service = new EmailService(db.prisma as never);
      await service.archive('email-1', 'folder-archive', 'user-1');

      expect(db.emails.get('email-1')).toMatchObject({ folderId: 'folder-archive' });
      const event = lastOutbox(db);
      expect(event['eventType']).toBe('mail.thread.archived.v1');
      expect(event['aggregateType']).toBe('EmailThread');
      expect(event['aggregateId']).toBe('thread-1');
    });
  });

  describe('delete', () => {
    it('emits mail.message.deleted.v1 on trash (hard=false) and on permanent delete', async () => {
      seedDraft(db, { isDraft: false });
      const service = new EmailService(db.prisma as never);

      await service.delete('email-1', 'user-1');
      expect(db.emails.get('email-1')).toMatchObject({ isTrash: true });
      expect(lastOutbox(db)['eventType']).toBe('mail.message.deleted.v1');
      expect(lastOutbox(db)['payload']).toMatchObject({ hard: false });

      await service.delete('email-1', 'user-1');
      expect(db.emails.get('email-1')!['deletedAt']).toBeDefined();
      expect(lastOutbox(db)['payload']).toMatchObject({ hard: true });
      expect(db.outbox).toHaveLength(2);
    });

    it('rolls back the trash move when the outbox write fails', async () => {
      db = createTxPrisma({ failOutbox: true });
      seedDraft(db, { isDraft: false });
      const service = new EmailService(db.prisma as never);
      await expect(service.delete('email-1', 'user-1')).rejects.toThrow('outbox write failed');
      expect(db.emails.get('email-1')).not.toHaveProperty('isTrash');
      expect(db.outbox.length).toBe(0);
    });
  });

  describe('applyLabel', () => {
    it('emits mail.thread.label_changed.v1 in the same transaction as the label write', async () => {
      seedDraft(db, { isDraft: false, labels: [] });
      const service = new EmailService(db.prisma as never);
      await service.applyLabel('email-1', 'label-1', 'user-1');

      expect(db.emails.get('email-1')).toMatchObject({ labels: ['label-1'] });
      const event = lastOutbox(db);
      expect(event['eventType']).toBe('mail.thread.label_changed.v1');
      expect(event['aggregateType']).toBe('EmailThread');
      expect(event['aggregateId']).toBe('thread-1');
      expect(event['payload']).toMatchObject({ labelId: 'label-1', labels: ['label-1'] });
    });

    it('emits nothing when the label is already applied', async () => {
      seedDraft(db, { isDraft: false, labels: ['label-1'] });
      const service = new EmailService(db.prisma as never);
      await service.applyLabel('email-1', 'label-1', 'user-1');
      expect(db.outbox.length).toBe(0);
      expect(db.txCalls).toBe(0);
    });
  });
});
