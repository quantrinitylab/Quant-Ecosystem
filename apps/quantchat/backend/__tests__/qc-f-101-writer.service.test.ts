// ===========================================================================
// QC-F-101 — durable notification WRITER regression tests (cases 1-8)
//
// Two layers, both driving REAL code:
//   A. NotificationService directly, against an in-memory fake of its
//      structural-prisma surface (NotificationPrismaLike).
//   B. MessageService.sendMessage with a REAL NotificationService injected
//      (6th constructor param) bound to a recording fake — this pins that
//      the writer lives in the service layer (post-commit, best-effort),
//      not in the HTTP route: voice-notes and REST both funnel here.
//
// Stable module-level identities only — no fresh-identity mocks.
// ===========================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageType } from '@prisma/client';
import { MessageService } from '../services/message.service';
import {
  NotificationService,
  type MemberMuteInfo,
} from '../services/notification.service';

// Stable identities (module-level).
const SENDER = 'user_writer_s';
const RECIP = 'user_writer_r';
const CONV_D = 'conv_writer_d';
const CONV_G = 'conv_writer_g';

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

// --- A. direct NotificationService fake -------------------------------------

interface WriterUserRow {
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
}

function makeWriterFake() {
  const createdRows: Array<Record<string, unknown>> = [];
  const calls = { createMany: 0, create: 0, findFirst: 0, userFindUnique: 0, convFindUnique: 0 };
  const users = new Map<string, WriterUserRow | null>();
  let conversation: { name: string | null; type: string } | null = null;

  const prisma = {
    notification: {
      async createMany({ data }: { data: Array<Record<string, unknown>> }) {
        calls.createMany++;
        createdRows.push(...data);
        return { count: data.length };
      },
      async create({ data }: { data: Record<string, unknown> }) {
        calls.create++;
        const row = { id: `n_${createdRows.length + 1}`, ...data };
        createdRows.push(row);
        return row;
      },
      async findFirst() {
        calls.findFirst++;
        return null;
      },
    },
    user: {
      async findUnique({ where }: { where: { id: string } }) {
        calls.userFindUnique++;
        return users.has(where.id) ? (users.get(where.id) ?? null) : null;
      },
    },
    conversation: {
      async findUnique() {
        calls.convFindUnique++;
        return conversation;
      },
    },
  };

  return {
    prisma,
    calls,
    createdRows,
    users,
    setConversation(c: { name: string | null; type: string } | null) {
      conversation = c;
    },
  };
}

const member = (
  userId: string,
  isMuted = false,
  muteUntil: Date | null = null,
): MemberMuteInfo => ({ userId, isMuted, muteUntil });

describe('QC-F-101 NotificationService.notifyMessageSent (cases 1-3, 7)', () => {
  let fake: ReturnType<typeof makeWriterFake>;
  let writer: NotificationService;

  beforeEach(() => {
    fake = makeWriterFake();
    fake.users.set(SENDER, {
      displayName: 'Sender Name',
      username: 'sender',
      avatarUrl: 'https://avatar.example/s.png',
    });
    writer = new NotificationService(fake.prisma as never);
  });

  // Case 1 — 1:1 send: exactly one row, exact shape, no default fields sent.
  it('case 1: one DIRECT recipient gets exactly one row with the pinned shape', async () => {
    fake.setConversation({ name: null, type: 'DIRECT' });

    await writer.notifyMessageSent({
      senderId: SENDER,
      conversationId: CONV_D,
      messageId: 'msg_1',
      members: [member(SENDER), member(RECIP)],
    });

    expect(fake.calls.createMany).toBe(1);
    expect(fake.createdRows).toHaveLength(1);
    const row = fake.createdRows[0]!;
    expect(row).toEqual({
      userId: RECIP,
      type: 'message',
      title: 'Sender Name',
      body: 'New message',
      imageUrl: 'https://avatar.example/s.png',
      actionUrl: `/chat/${CONV_D}`,
      sourceApp: 'quantchat',
      sourceUserId: SENDER,
      sourceEntityId: 'msg_1',
      data: { conversationId: CONV_D, messageId: 'msg_1', category: 'MESSAGES' },
    });
    // Defaults are left to the DB — isRead/sentVia/expiresAt are NOT sent.
    expect('isRead' in row).toBe(false);
    expect('sentVia' in row).toBe(false);
    expect('expiresAt' in row).toBe(false);
    expect('priority' in row).toBe(false);
  });

  // Case 2 — group: sender excluded, muted excluded, one createMany.
  it('case 2: group send notifies only the unmuted non-sender, via a single createMany', async () => {
    const R1 = 'user_writer_r1';
    const R2 = 'user_writer_r2';
    fake.setConversation({ name: 'Team', type: 'GROUP' });

    await writer.notifyMessageSent({
      senderId: SENDER,
      conversationId: CONV_G,
      messageId: 'msg_2',
      members: [member(SENDER), member(R1), member(R2, true, FUTURE)],
    });

    expect(fake.calls.createMany).toBe(1);
    expect(fake.createdRows).toHaveLength(1);
    const row = fake.createdRows[0]!;
    expect(row.userId).toBe(R1);
    expect(row.title).toBe('Team'); // group: the place is the news
    expect(row.body).toBe('New message');
    expect(fake.createdRows.every((r) => r.userId !== SENDER)).toBe(true);
  });

  // Case 3 — mute edges.
  it('case 3: muteUntil past => row; isMuted false => row regardless of muteUntil', async () => {
    const M1 = 'user_writer_m1'; // mute expired
    const M2 = 'user_writer_m2'; // actively muted
    const M3 = 'user_writer_m3'; // not muted, muteUntil set but irrelevant
    fake.setConversation({ name: 'Team', type: 'GROUP' });

    await writer.notifyMessageSent({
      senderId: SENDER,
      conversationId: CONV_G,
      messageId: 'msg_3',
      members: [
        member(SENDER),
        member(M1, true, PAST),
        member(M2, true, FUTURE),
        member(M3, false, FUTURE),
      ],
    });

    const recipients = fake.createdRows.map((r) => r.userId).sort();
    expect(recipients).toEqual([M1, M3].sort());
  });

  // Case 7 — title fallback chain.
  it('case 7: DIRECT title = displayName ?? username ?? QuantChat', async () => {
    fake.setConversation({ name: null, type: 'DIRECT' });

    await writer.notifyMessageSent({
      senderId: SENDER,
      conversationId: CONV_D,
      messageId: 'msg_7a',
      members: [member(SENDER), member(RECIP)],
    });
    expect(fake.createdRows[0]!.title).toBe('Sender Name');

    fake.users.set(SENDER, { displayName: null, username: 'sender', avatarUrl: null });
    await writer.notifyMessageSent({
      senderId: SENDER,
      conversationId: CONV_D,
      messageId: 'msg_7b',
      members: [member(SENDER), member(RECIP)],
    });
    expect(fake.createdRows[1]!.title).toBe('sender');
  });

  it('case 7: sender lookup miss falls back to QuantChat and still resolves', async () => {
    fake.users.set(SENDER, null); // row exists as null — the miss case
    fake.setConversation({ name: null, type: 'DIRECT' });

    await expect(
      writer.notifyMessageSent({
        senderId: SENDER,
        conversationId: CONV_D,
        messageId: 'msg_7c',
        members: [member(SENDER), member(RECIP)],
      }),
    ).resolves.toBeUndefined();
    expect(fake.createdRows[0]!.title).toBe('QuantChat');
  });

  it('case 7: GROUP title = conversation name, falling back to the sender', async () => {
    fake.setConversation({ name: 'Team', type: 'GROUP' });
    await writer.notifyMessageSent({
      senderId: SENDER,
      conversationId: CONV_G,
      messageId: 'msg_7d',
      members: [member(SENDER), member(RECIP)],
    });
    expect(fake.createdRows[0]!.title).toBe('Team');

    fake.setConversation({ name: null, type: 'GROUP' });
    await writer.notifyMessageSent({
      senderId: SENDER,
      conversationId: CONV_G,
      messageId: 'msg_7e',
      members: [member(SENDER), member(RECIP)],
    });
    expect(fake.createdRows[1]!.title).toBe('Sender Name');
  });
});

// --- B. MessageService-level (service entry, post-commit, best-effort) ------

function createSendMockPrisma() {
  const prisma = {
    conversationMember: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn().mockResolvedValue({ id: 'conv_msg', type: 'DIRECT' }),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      // QC-F-359 fixture shape: readable empty block list ('clear' both ways).
      findUnique: vi.fn().mockResolvedValue({ preferences: null }),
    },
    message: { create: vi.fn() },
    messageOutbox: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  // Interactive transaction runs the callback with the same mock client.
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

const CONV_MSG = 'conv_msg';

function seedSendPath(prisma: ReturnType<typeof createSendMockPrisma>, members: MemberMuteInfo[]) {
  prisma.conversationMember.findFirst.mockResolvedValue({
    id: 'member_s',
    conversationId: CONV_MSG,
    userId: SENDER,
    leftAt: null,
  });
  prisma.conversationMember.findMany.mockResolvedValue(
    members.map((m) => ({ ...m, leftAt: null })),
  );
  const messageRow = {
    id: 'msg_live_1',
    conversationId: CONV_MSG,
    senderId: SENDER,
    content: 'hello',
    type: MessageType.TEXT,
    createdAt: new Date(),
  };
  prisma.message.create.mockResolvedValue(messageRow);
  return messageRow;
}

function buildServiceWithWriter(
  prisma: ReturnType<typeof createSendMockPrisma>,
  writerFake: ReturnType<typeof makeWriterFake>,
) {
  const notifications = new NotificationService(writerFake.prisma as never);
  const streaks = { recordMessage: vi.fn().mockResolvedValue({ count: 1 }) };
  return new MessageService(
    prisma as never,
    undefined,
    streaks as never,
    undefined,
    undefined,
    notifications,
  );
}

function seedWriterLookups(writerFake: ReturnType<typeof makeWriterFake>) {
  writerFake.users.set(SENDER, { displayName: 'S Name', username: 's', avatarUrl: null });
  writerFake.setConversation({ name: null, type: 'DIRECT' });
}

describe('QC-F-101 MessageService wiring (cases 4-6, 8)', () => {
  let prisma: ReturnType<typeof createSendMockPrisma>;
  let writerFake: ReturnType<typeof makeWriterFake>;

  beforeEach(() => {
    prisma = createSendMockPrisma();
    writerFake = makeWriterFake();
    seedWriterLookups(writerFake);
  });

  // Case 4 — no recipients: no rows, no writer prisma calls, send succeeds.
  it('case 4: sender alone — send succeeds, writer makes zero prisma calls', async () => {
    seedSendPath(prisma, [member(SENDER)]);
    const service = buildServiceWithWriter(prisma, writerFake);

    const message = await service.sendMessage({
      conversationId: CONV_MSG,
      senderId: SENDER,
      content: 'hello',
    });

    expect(message.id).toBe('msg_live_1');
    expect(writerFake.createdRows).toHaveLength(0);
    expect(writerFake.calls.createMany).toBe(0);
    expect(writerFake.calls.userFindUnique).toBe(0);
    expect(writerFake.calls.convFindUnique).toBe(0);
  });

  // Case 5 — writer failure never fails delivery.
  it('case 5: createMany throwing does not stop the send', async () => {
    seedSendPath(prisma, [member(SENDER), member(RECIP)]);
    writerFake.prisma.notification.createMany = async () => {
      throw new Error('notification db down');
    };
    const service = buildServiceWithWriter(prisma, writerFake);

    const message = await service.sendMessage({
      conversationId: CONV_MSG,
      senderId: SENDER,
      content: 'hello',
    });

    expect(message.id).toBe('msg_live_1');
    expect(prisma.message.create).toHaveBeenCalled();
  });

  it('case 5: sender/conversation lookups throwing does not stop the send', async () => {
    seedSendPath(prisma, [member(SENDER), member(RECIP)]);
    writerFake.prisma.user.findUnique = async () => {
      throw new Error('user db down');
    };
    const service = buildServiceWithWriter(prisma, writerFake);

    const message = await service.sendMessage({
      conversationId: CONV_MSG,
      senderId: SENDER,
      content: 'hello',
    });

    expect(message.id).toBe('msg_live_1');
  });

  // Case 6 — the load-bearing content-leak pin.
  it('case 6: message plaintext never lands in title/body/data', async () => {
    seedSendPath(prisma, [member(SENDER), member(RECIP)]);
    const service = buildServiceWithWriter(prisma, writerFake);

    await service.sendMessage({
      conversationId: CONV_MSG,
      senderId: SENDER,
      content: 'SECRET_PLAINTEXT_DO_NOT_LEAK',
    });

    expect(writerFake.createdRows).toHaveLength(1);
    const row = writerFake.createdRows[0]!;
    expect(row.body).toBe('New message');
    expect(JSON.stringify(row)).not.toContain('SECRET_PLAINTEXT_DO_NOT_LEAK');
  });

  it('case 6: ciphertext-like blobs stay out of the row too', async () => {
    seedSendPath(prisma, [member(SENDER), member(RECIP)]);
    const service = buildServiceWithWriter(prisma, writerFake);
    const blob = 'x'.repeat(500);

    await service.sendMessage({
      conversationId: CONV_MSG,
      senderId: SENDER,
      content: blob,
    });

    expect(writerFake.createdRows).toHaveLength(1);
    const row = writerFake.createdRows[0]!;
    expect(row.body).toBe('New message');
    expect(String(row.title)).not.toContain('xxxx');
    expect(JSON.stringify(row.data)).not.toContain('xxxx');
  });

  // Case 8 — the writer is in the SERVICE, not the route: type 'audio'
  // through sendMessage produces a row with the committed message id.
  it('case 8: sendMessage(type audio) fans out one row bound to the committed message id', async () => {
    seedSendPath(prisma, [member(SENDER), member(RECIP)]);
    const service = buildServiceWithWriter(prisma, writerFake);

    const message = await service.sendMessage({
      conversationId: CONV_MSG,
      senderId: SENDER,
      content: 'voice note',
      type: 'audio',
    });

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: MessageType.AUDIO }) }),
    );
    expect(writerFake.createdRows).toHaveLength(1);
    const row = writerFake.createdRows[0]!;
    expect(row.userId).toBe(RECIP);
    expect(row.sourceEntityId).toBe(message.id);
    expect(row.sourceEntityId).toBe('msg_live_1');
    expect(row.type).toBe('message');
  });
});
