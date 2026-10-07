import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RandomChatService } from '../services/random-chat.service';

function createMockPrisma() {
  // Per-user allowRandomChat setting; absent => default ON.
  const settings = new Map<string, boolean>();
  return {
    _settings: settings,
    userSafetySetting: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (!settings.has(where.userId)) return null;
        return { userId: where.userId, allowRandomChat: settings.get(where.userId) };
      }),
    },
    videoChatSession: {
      create: vi.fn(async ({ data }: any) => ({ id: 'vcs-1', ...data })),
    },
  };
}

describe('RandomChatService', () => {
  let service: RandomChatService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new RandomChatService(prisma as never);
  });

  it('queues the first caller (no partner yet) and matches the second', async () => {
    const first = await service.findRandomPartner('alice');
    expect(first).toBeNull();
    const second = await service.findRandomPartner('bob');
    expect(second).toBe('alice');
  });

  it('rejects a user who opted out of random chat', async () => {
    prisma._settings.set('alice', false);
    await expect(service.findRandomPartner('alice')).rejects.toMatchObject({
      code: 'RANDOM_CHAT_DISABLED',
    });
  });

  it('skips a queued partner who opted out after queueing', async () => {
    // alice queues (allowed), then disables random chat.
    await service.findRandomPartner('alice');
    prisma._settings.set('alice', false);
    // bob arrives — alice is no longer eligible, so bob waits instead of matching.
    const result = await service.findRandomPartner('bob');
    expect(result).toBeNull();
  });

  it('never self-matches', async () => {
    const first = await service.findRandomPartner('alice');
    expect(first).toBeNull();
    // Same user re-finds — should not match themselves; re-queues and waits.
    const again = await service.findRandomPartner('alice');
    expect(again).toBeNull();
  });

  it('persists an ended session', async () => {
    await service.endChat('alice', 'bob');
    expect(prisma.videoChatSession.create).toHaveBeenCalledWith({
      data: { user1Id: 'alice', user2Id: 'bob', status: 'ENDED', endedAt: expect.any(Date) },
    });
  });
});
