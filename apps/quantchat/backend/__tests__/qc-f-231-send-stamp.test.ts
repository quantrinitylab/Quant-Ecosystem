import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageService } from '../services/message.service';
import { EXPIRY_DURATIONS } from '../services/disappearing.service';

// ============================================================================
// QC-F-231 Slice A: send-stamp — the conversation's disappear timer is
// snapshotted server-side into metadata.disappearTimerSeconds at send time,
// and timed disappear modes stamp expiresAt at send time.
//
// Negative control: on the original code (no Slice A) every one of these
// tests FAILS — sendMessage never read Conversation.disappearTimer and
// never wrote expiresAt for timed modes.
// ============================================================================

function createMockPrisma() {
  const prisma = {
    message: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ preferences: null }),
    },
    conversationMember: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    messageOutbox: {
      create: vi.fn(),
    },
    snapView: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

describe('QC-F-231 Slice A — send-stamp', () => {
  let service: MessageService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MessageService(prisma as never);
    // Active member; no blocked pairs (QC-F-359 gate passes).
    prisma.conversationMember.findFirst.mockResolvedValue({
      id: 'member-1',
      conversationId: 'conv-1',
      userId: 'user-1',
      role: 'MEMBER',
      leftAt: null,
    });
    prisma.conversationMember.findMany.mockResolvedValue([
      { userId: 'user-1' },
      { userId: 'user-2' },
    ]);
    prisma.message.create.mockImplementation(async ({ data }: { data: unknown }) => ({
      id: 'msg-1',
      ...(data as object),
      createdAt: new Date(),
    }));
    prisma.conversation.update.mockResolvedValue({});
  });

  async function send(extra: Record<string, unknown> = {}) {
    return service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: 'hello',
      ...extra,
    });
  }

  function createdData() {
    return prisma.message.create.mock.calls[0][0].data as Record<string, unknown>;
  }

  it('stamps the conversation timer server-side when the timer is ON', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', disappearTimer: 30 });

    await send();

    const data = createdData();
    expect(data.metadata).toMatchObject({ disappearTimerSeconds: 30 });
    // View-anchored (D1): no expiresAt at send time for conversation timers.
    expect(data.expiresAt).toBeNull();
  });

  it('stamps nothing when the conversation timer is OFF', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', disappearTimer: null });

    await send();

    const data = createdData();
    expect(data.metadata).not.toHaveProperty('disappearTimerSeconds');
    expect(data.expiresAt).toBeNull();
  });

  it('treats a missing conversation row as timer-off (fail-closed)', async () => {
    // Call order in sendMessage: the QC-F-359 gate reads the conversation
    // first (needs the row), then Slice A reads the timer (missing here).
    prisma.conversation.findUnique
      .mockResolvedValueOnce({ id: 'conv-1', type: 'DIRECT' })
      .mockResolvedValueOnce(null);

    await send();

    const data = createdData();
    expect(data.metadata).not.toHaveProperty('disappearTimerSeconds');
  });

  it("stamps expiresAt = createdAt + 24h for disappearMode '24h' (send-anchored)", async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', disappearTimer: null });
    const before = Date.now();

    await send({ disappearMode: '24h' });

    const data = createdData();
    const expiresAt = (data.expiresAt as Date).getTime();
    expect(expiresAt - before).toBeGreaterThanOrEqual(EXPIRY_DURATIONS['24h'] - 1000);
    expect(expiresAt - before).toBeLessThanOrEqual(EXPIRY_DURATIONS['24h'] + 5000);
    expect(data.metadata).toMatchObject({ disappearMode: '24h' });
  });

  it("does NOT stamp expiresAt for 'after_view' (view-anchored — first view stamps)", async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', disappearTimer: null });

    await send({ disappearMode: 'after_view', type: 'text' });

    const data = createdData();
    expect(data.expiresAt).toBeNull();
    expect(data.metadata).toMatchObject({ viewOnce: true });
  });

  it('snapshots the timer: a later timer change does not rewrite the old stamp', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', disappearTimer: 30 });
    await send();
    const first = createdData();

    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', disappearTimer: 300 });
    await send({ content: 'second' });
    const second = prisma.message.create.mock.calls[1][0].data as Record<string, unknown>;

    expect(first.metadata).toMatchObject({ disappearTimerSeconds: 30 });
    expect(second.metadata).toMatchObject({ disappearTimerSeconds: 300 });
  });

  it('strips a client-forged disappearTimerSeconds (QC-F-274 regression)', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', disappearTimer: 30 });

    await send({ metadata: { disappearTimerSeconds: 999, caption: 'x' } });

    const data = createdData();
    // The server stamp wins; the forged value is gone.
    expect(data.metadata).toMatchObject({ disappearTimerSeconds: 30, caption: 'x' });
    expect(data.metadata).not.toMatchObject({ disappearTimerSeconds: 999 });
  });

  it('strips a client-forged stamp even when the conversation timer is OFF', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1', disappearTimer: null });

    await send({ metadata: { disappearTimerSeconds: 999 } });

    const data = createdData();
    expect(data.metadata).not.toHaveProperty('disappearTimerSeconds');
  });
});
