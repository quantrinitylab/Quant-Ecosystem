// ============================================================================
// QC-F-437 — Snap Map FriendLocation staleness regression tests
//
// Defect: LocationService.getFriendsOnMap returned every FriendLocation row
// for the caller's close friends with NO age condition — a location published
// once stayed visible (precise lat/long) forever, because the schema has no
// expiresAt, no TTL/cleanup exists, and the only removal path is an explicit
// DELETE the shipped web client never sends (QC-F-056).
//
// Slice-1 fix: a read-side staleness window in getFriendsOnMap — only rows
// whose updatedAt is within FRIEND_LOCATION_MAX_AGE_MS (8 hours,
// Snapchat-equivalent) are returned. The filter runs in the service AFTER
// the friendLocation.findMany and BEFORE any profile fetch; the DB query
// shape is unchanged; the QC-F-042 whoCanSeeLocation gate is untouched.
//
// Negative control (verified against the ORIGINAL code):
//   FAIL: T1, T2, T3, T7   (stale rows leak with precise coordinates)
//   PASS: T4, T5, T6, T8, T9 (controls — behaviour that must not change)
//
// All fixture timestamps are relative-to-now (hoursAgo/minutesAgo) — no
// hardcoded dates (the QC-F-437 C1 lesson: the pre-existing suites' 2024
// fixtures silently became "stale" once a real window existed).
// Mocks use stable module-level identities (no fresh-identity mocks).
// ============================================================================
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LocationService,
  type CloseFriendRecord,
  type FriendLocationRecord,
  type MapUserRecord,
} from '../services/location.service';

const CALLER = 'caller-1';
const FRIEND_FRESH = 'friend-fresh';
const FRIEND_STALE = 'friend-stale';

function minutesAgo(m: number): Date {
  return new Date(Date.now() - m * 60 * 1000);
}
function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function makeLocation(overrides: Partial<FriendLocationRecord> = {}): FriendLocationRecord {
  return {
    id: 'loc-1',
    userId: FRIEND_FRESH,
    latitude: 35.6762,
    longitude: 139.6503,
    updatedAt: minutesAgo(5),
    ...overrides,
  };
}

// QC-F-533 harness direction: makeEdge(ownerId) is an OWNER -> caller edge
// (the owner listed the caller as a close friend) — the only edge direction
// that authorizes the caller to see the owner's location.
function makeEdge(ownerId: string): CloseFriendRecord {
  return {
    id: `edge-${ownerId}`,
    userId: ownerId,
    friendId: CALLER,
    createdAt: minutesAgo(60),
  };
}

// QC-F-533: WHERE-AWARE fake (the privacy.service.test.ts pattern) — the
// old caller-side query shape ({ where: { userId: caller } }) finds no
// authorizing edges in these fixtures instead of silently passing.
function installEdges(
  prisma: ReturnType<typeof createMockPrisma>,
  edges: CloseFriendRecord[],
) {
  prisma.closeFriend.findMany.mockImplementation(async (args: unknown) => {
    const where =
      (args as { where?: { userId?: string; friendId?: string } }).where ?? {};
    return edges.filter(
      (e) =>
        (where.userId === undefined || e.userId === where.userId) &&
        (where.friendId === undefined || e.friendId === where.friendId),
    );
  });
}

function prefs(whoCanSeeLocation: string) {
  return { chatSettings: { privacy: { whoCanSeeLocation } } };
}

function makeUser(overrides: Partial<MapUserRecord> = {}): MapUserRecord {
  return {
    id: FRIEND_FRESH,
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: 'https://cdn/quantchat/alice.jpg',
    preferences: prefs('friends'),
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    friendLocation: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    closeFriend: {
      findMany: vi.fn(),
    },
    // QC-F-533: empty DIRECT delegates — no conversation relationships in
    // these fixtures, so the DIRECT half proves nobody (fail-closed).
    conversationMember: {
      findMany: vi.fn(async () => []),
    },
    conversation: {
      findMany: vi.fn(async () => []),
    },
    user: {
      findMany: vi.fn(),
    },
  };
}

describe('QC-F-437 LocationService.getFriendsOnMap staleness window', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: LocationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LocationService(prisma);
  });

  it('T1: a stale-only close friend (8h + 5min old) is not returned at all', async () => {
    installEdges(prisma, [makeEdge(FRIEND_STALE)]);
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({ id: 'loc-stale', userId: FRIEND_STALE, updatedAt: new Date(Date.now() - (8 * 60 + 5) * 60 * 1000) }),
    ]);
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: FRIEND_STALE, username: 'stalefriend' }),
    ]);

    const result = await service.getFriendsOnMap(CALLER);

    expect(result).toEqual([]);
  });

  it('T2: mixed fresh + stale friends — only the fresh friend is returned', async () => {
    installEdges(prisma, [makeEdge(FRIEND_FRESH), makeEdge(FRIEND_STALE)]);
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({ id: 'loc-fresh', userId: FRIEND_FRESH, latitude: 10, longitude: 20, updatedAt: minutesAgo(5) }),
      makeLocation({ id: 'loc-stale', userId: FRIEND_STALE, latitude: 1, longitude: 2, updatedAt: hoursAgo(24 * 30) }),
    ]);
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: FRIEND_FRESH }),
      makeUser({ id: FRIEND_STALE, username: 'stalefriend' }),
    ]);

    const result = await service.getFriendsOnMap(CALLER);

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe(FRIEND_FRESH);
    expect(result[0].latitude).toBe(10);
    expect(result[0].longitude).toBe(20);
    expect(result.map((f) => f.userId)).not.toContain(FRIEND_STALE);
  });

  it('T3: a stale row triggers no profile fetch at all', async () => {
    installEdges(prisma, [makeEdge(FRIEND_STALE)]);
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({ id: 'loc-stale', userId: FRIEND_STALE, updatedAt: hoursAgo(9) }),
    ]);
    prisma.user.findMany.mockResolvedValue([makeUser({ id: FRIEND_STALE })]);

    const result = await service.getFriendsOnMap(CALLER);

    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('T4 (control): a fresh friend is returned with the exact unchanged shape', async () => {
    const freshAt = minutesAgo(5);
    installEdges(prisma, [makeEdge(FRIEND_FRESH)]);
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({ id: 'loc-fresh', userId: FRIEND_FRESH, updatedAt: freshAt }),
    ]);
    prisma.user.findMany.mockResolvedValue([makeUser({ id: FRIEND_FRESH })]);

    const result = await service.getFriendsOnMap(CALLER);

    expect(result).toEqual([
      {
        userId: FRIEND_FRESH,
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: 'https://cdn/quantchat/alice.jpg',
        latitude: 35.6762,
        longitude: 139.6503,
        updatedAt: freshAt,
      },
    ]);
  });

  it('T5 (control): no close friends → [] and locations are never queried', async () => {
    installEdges(prisma, []);

    const result = await service.getFriendsOnMap(CALLER);

    expect(result).toEqual([]);
    expect(prisma.friendLocation.findMany).not.toHaveBeenCalled();
  });

  it('T6 (control): QC-F-042 gate composition is unchanged (nobody/ghost hide, incl. stale)', async () => {
    // (i) fresh row + pref 'nobody' → []
    installEdges(prisma, [makeEdge(FRIEND_FRESH)]);
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({ updatedAt: minutesAgo(5) }),
    ]);
    prisma.user.findMany.mockResolvedValue([
      makeUser({ preferences: prefs('nobody') }),
    ]);
    await expect(service.getFriendsOnMap(CALLER)).resolves.toEqual([]);

    // (ii) fresh row + pref 'ghost' → []
    prisma.user.findMany.mockResolvedValue([
      makeUser({ preferences: prefs('ghost') }),
    ]);
    await expect(service.getFriendsOnMap(CALLER)).resolves.toEqual([]);

    // (iii) stale row + pref 'nobody' → [] (gate and/or filter — still hidden)
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({ updatedAt: hoursAgo(48) }),
    ]);
    prisma.user.findMany.mockResolvedValue([
      makeUser({ preferences: prefs('nobody') }),
    ]);
    await expect(service.getFriendsOnMap(CALLER)).resolves.toEqual([]);
  });

  it('T7: window boundary — 8h − 2min is shown, 8h + 2min is hidden', async () => {
    installEdges(prisma, [makeEdge(FRIEND_FRESH), makeEdge(FRIEND_STALE)]);
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({
        id: 'loc-just-fresh',
        userId: FRIEND_FRESH,
        updatedAt: new Date(Date.now() - (8 * 60 - 2) * 60 * 1000),
      }),
      makeLocation({
        id: 'loc-just-stale',
        userId: FRIEND_STALE,
        updatedAt: new Date(Date.now() - (8 * 60 + 2) * 60 * 1000),
      }),
    ]);
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: FRIEND_FRESH }),
      makeUser({ id: FRIEND_STALE, username: 'stalefriend' }),
    ]);

    const result = await service.getFriendsOnMap(CALLER);

    expect(result.map((f) => f.userId)).toEqual([FRIEND_FRESH]);
  });

  it('T8 (control): the friendLocation query shape is unchanged (filter is service-side)', async () => {
    installEdges(prisma, [makeEdge(FRIEND_FRESH), makeEdge(FRIEND_STALE)]);
    prisma.friendLocation.findMany.mockResolvedValue([]);

    await service.getFriendsOnMap(CALLER);

    expect(prisma.friendLocation.findMany).toHaveBeenCalledWith({
      where: { userId: { in: [FRIEND_FRESH, FRIEND_STALE] } },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('T9 (control): ordering of fresh rows follows the findMany order (no re-ranking)', async () => {
    const secondFresh = 'friend-fresh-2';
    installEdges(prisma, [makeEdge(FRIEND_FRESH), makeEdge(secondFresh)]);
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({ id: 'loc-a', userId: FRIEND_FRESH, updatedAt: minutesAgo(10) }),
      makeLocation({ id: 'loc-b', userId: secondFresh, updatedAt: minutesAgo(30) }),
    ]);
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: FRIEND_FRESH }),
      makeUser({ id: secondFresh, username: 'bob' }),
    ]);

    const result = await service.getFriendsOnMap(CALLER);

    expect(result.map((f) => f.userId)).toEqual([FRIEND_FRESH, secondFresh]);
  });
});
