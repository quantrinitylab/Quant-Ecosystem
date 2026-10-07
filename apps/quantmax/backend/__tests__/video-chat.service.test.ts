import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoChatService } from '../services/video-chat.service';

function createMockPrisma() {
  return {
    videoChatSession: {
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
    },
  };
}

describe('VideoChatService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let now: number;
  let idSeq: number;
  let service: VideoChatService;

  beforeEach(() => {
    prisma = createMockPrisma();
    now = 1_000_000;
    idSeq = 0;
    service = new VideoChatService(
      prisma as never,
      () => now,
      () => `sess-${++idSeq}`,
    );
  });

  it('queues the first caller and matches the second on overlapping interests', async () => {
    const first = await service.join('alice', { interests: ['Music', 'Gaming'] });
    expect(first).toEqual({ status: 'waiting' });

    const second = await service.join('bob', { interests: ['gaming', 'art'] });
    expect(second.status).toBe('matched');
    if (second.status === 'matched') {
      expect(second.session.participants).toEqual(['alice', 'bob']);
      expect(second.session.matchedInterests).toEqual(['gaming']);
    }
    expect(prisma.videoChatSession.create).toHaveBeenCalledTimes(1);
  });

  it('persists a durable session row on start with the full payload', async () => {
    await service.join('alice', { interests: ['Music', 'Gaming'] });
    await service.join('bob', { interests: ['gaming'] });

    expect(prisma.videoChatSession.create).toHaveBeenCalledTimes(1);
    expect(prisma.videoChatSession.create).toHaveBeenCalledWith({
      data: {
        id: 'sess-1',
        user1Id: 'alice',
        user2Id: 'bob',
        status: 'CONNECTED',
        matchedInterests: ['gaming'],
        hasTextFallback: false,
        startedAt: new Date(now),
      },
    });
  });

  it('matches via the General bucket when one side has no interests', async () => {
    await service.join('alice', {});
    const r = await service.join('bob', { interests: ['cooking'] });
    expect(r.status).toBe('matched');
    if (r.status === 'matched') expect(r.session.matchedInterests).toEqual(['general']);
  });

  it('does NOT match when both have interests but none overlap', async () => {
    await service.join('alice', { interests: ['music'] });
    const r = await service.join('bob', { interests: ['sports'] });
    expect(r).toEqual({ status: 'waiting' });
    expect(prisma.videoChatSession.create).not.toHaveBeenCalled();
  });

  it('returns the existing session when an already-matched user re-joins', async () => {
    await service.join('alice', { interests: ['x'] });
    const m = await service.join('bob', { interests: ['x'] });
    const again = await service.join('alice', { interests: ['x'] });
    expect(again.status).toBe('matched');
    if (again.status === 'matched' && m.status === 'matched') {
      expect(again.session.id).toBe(m.session.id);
    }
    // No second session row created.
    expect(prisma.videoChatSession.create).toHaveBeenCalledTimes(1);
  });

  it('end records the session with a computed duration and frees both users', async () => {
    await service.join('alice', { interests: ['x'] });
    await service.join('bob', { interests: ['x'] });
    now += 5000; // 5s later

    const res = await service.end('alice');
    expect(res).toEqual({ ended: true });
    expect(prisma.videoChatSession.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { status: 'ENDED', endedAt: new Date(now), durationSec: 5 },
    });
    // Both users are now free; alice has no active session.
    expect(service.getActiveSession('alice')).toBeNull();
    expect(service.getActiveSession('bob')).toBeNull();
  });

  it('end is a no-op when the user has no session', async () => {
    const res = await service.end('nobody');
    expect(res).toEqual({ ended: false });
    expect(prisma.videoChatSession.update).not.toHaveBeenCalled();
  });

  it('lets either participant end the session (ownership), persisting once', async () => {
    await service.join('alice', { interests: ['x'] });
    await service.join('bob', { interests: ['x'] }); // alice+bob matched

    // user2 (bob) ends the shared session.
    const res = await service.end('bob');
    expect(res).toEqual({ ended: true });
    expect(prisma.videoChatSession.update).toHaveBeenCalledTimes(1);
    expect(prisma.videoChatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sess-1' },
        data: expect.objectContaining({ status: 'ENDED' }),
      }),
    );
    // A second end by the other participant is now a no-op (no extra row write).
    const again = await service.end('alice');
    expect(again).toEqual({ ended: false });
    expect(prisma.videoChatSession.update).toHaveBeenCalledTimes(1);
  });

  it('skip ends the current session and re-queues the caller', async () => {
    await service.join('alice', { interests: ['x'] });
    await service.join('bob', { interests: ['x'] }); // alice+bob matched

    const skipped = await service.skip('alice'); // no other waiting -> waiting
    expect(skipped).toEqual({ status: 'waiting' });
    // The skipped session was recorded.
    expect(prisma.videoChatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) }),
    );
  });

  it('carries text-fallback when either party enabled it', async () => {
    await service.join('alice', { interests: ['x'], enableTextFallback: true });
    const r = await service.join('bob', { interests: ['x'] });
    if (r.status === 'matched') expect(r.session.hasTextFallback).toBe(true);
  });
});

describe('VideoChatService LiveKit token issuance (own-token-only)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let idSeq: number;

  // Fake issuer encodes the identity into the token so we can assert exactly
  // which identity each participant received a token for.
  const issuer = {
    issue: vi.fn(async (roomName: string, identity: string) => `tok:${roomName}:${identity}`),
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    idSeq = 0;
    issuer.issue.mockClear();
  });

  function build() {
    return new VideoChatService(
      prisma as never,
      () => 1_000_000,
      () => `sess-${++idSeq}`,
      issuer,
    );
  }

  it('gives each participant ONLY their own token (no partner token leak)', async () => {
    const service = build();
    await service.join('alice', { interests: ['x'] });
    const bobMatch = await service.join('bob', { interests: ['x'] });

    expect(bobMatch.status).toBe('matched');
    if (bobMatch.status === 'matched') {
      expect(bobMatch.roomName).toBe('max-random:sess-1');
      // Bob receives a token scoped to bob only.
      expect(bobMatch.selfToken).toBe('tok:max-random:sess-1:bob');
      expect(bobMatch.selfToken).not.toContain('alice');
    }

    // Alice discovers the match on her next join/poll and gets HER own token.
    const aliceMatch = await service.join('alice', { interests: ['x'] });
    if (aliceMatch.status === 'matched') {
      expect(aliceMatch.selfToken).toBe('tok:max-random:sess-1:alice');
      expect(aliceMatch.selfToken).not.toContain('bob');
    }
  });

  it('issues no token when LiveKit is unconfigured (fail-closed, no fake token)', async () => {
    // Default issuer (no LIVEKIT_* env) is undefined in the test environment.
    const service = new VideoChatService(
      prisma as never,
      () => 1_000_000,
      () => `sess-${++idSeq}`,
    );
    await service.join('alice', { interests: ['x'] });
    const r = await service.join('bob', { interests: ['x'] });
    if (r.status === 'matched') {
      expect(r.roomName).toBe('max-random:sess-1');
      expect(r.selfToken).toBeUndefined();
    }
  });
});
