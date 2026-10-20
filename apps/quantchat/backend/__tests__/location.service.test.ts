import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LocationService,
  assertValidCoordinates,
  type CloseFriendRecord,
  type FriendLocationRecord,
  type MapUserRecord,
} from '../services/location.service';

// QC-F-437 fixture clock: the default location row must be FRESH (inside the
// 8-hour staleness window) — a hardcoded 2024 date is correctly stale now.
// Shared const so the expected-shape assertion below compares the exact
// same instant the factory produced. Assertions are unchanged.
const FRESH_UPDATED_AT = new Date();

function makeLocation(overrides: Partial<FriendLocationRecord> = {}): FriendLocationRecord {
  return {
    id: 'loc-1',
    userId: 'friend-1',
    latitude: 35.6762,
    longitude: 139.6503,
    updatedAt: FRESH_UPDATED_AT,
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
    friendId: 'caller-1',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };
}

// QC-F-533: the fake is WHERE-AWARE — it answers from the actual `where`
// (the privacy.service.test.ts pattern), so the old caller-side query
// shape ({ where: { userId: caller } }) finds no authorizing edges in
// these fixtures instead of silently passing.
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

function makeUser(overrides: Partial<MapUserRecord> = {}): MapUserRecord {
  return {
    id: 'friend-1',
    username: 'alice',
    displayName: 'Alice',
    avatarUrl: 'https://cdn/quantchat/alice.jpg',
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
    // QC-F-533: empty DIRECT delegates — these fixtures carry no
    // conversation relationships, so the DIRECT half of the owner-side
    // enumeration proves nobody (fail-closed), exactly as a missing
    // delegate would.
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

describe('assertValidCoordinates', () => {
  it('accepts coordinates within WGS84 bounds (including edges)', () => {
    expect(() => assertValidCoordinates({ latitude: 0, longitude: 0 })).not.toThrow();
    expect(() => assertValidCoordinates({ latitude: 90, longitude: 180 })).not.toThrow();
    expect(() => assertValidCoordinates({ latitude: -90, longitude: -180 })).not.toThrow();
  });

  it('rejects out-of-range latitude with a 400 error', () => {
    expect(() => assertValidCoordinates({ latitude: 90.1, longitude: 0 })).toThrow(
      /latitude must be a number/,
    );
    expect(() => assertValidCoordinates({ latitude: -91, longitude: 0 })).toThrow(
      /latitude must be a number/,
    );
  });

  it('rejects out-of-range longitude with a 400 error', () => {
    expect(() => assertValidCoordinates({ latitude: 0, longitude: 180.5 })).toThrow(
      /longitude must be a number/,
    );
    expect(() => assertValidCoordinates({ latitude: 0, longitude: -200 })).toThrow(
      /longitude must be a number/,
    );
  });

  it('rejects non-finite values', () => {
    expect(() => assertValidCoordinates({ latitude: NaN, longitude: 0 })).toThrow();
    expect(() => assertValidCoordinates({ latitude: 0, longitude: Infinity })).toThrow();
  });
});

describe('LocationService.updateLocation', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: LocationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LocationService(prisma);
  });

  it('upserts the caller location keyed by unique userId', async () => {
    const record = makeLocation({ userId: 'caller-1' });
    prisma.friendLocation.upsert.mockResolvedValue(record);

    const result = await service.updateLocation('caller-1', {
      latitude: 35.6762,
      longitude: 139.6503,
    });

    expect(result).toBe(record);
    expect(prisma.friendLocation.upsert).toHaveBeenCalledWith({
      where: { userId: 'caller-1' },
      create: { userId: 'caller-1', latitude: 35.6762, longitude: 139.6503 },
      update: { latitude: 35.6762, longitude: 139.6503 },
    });
  });

  it('validates bounds before touching the database (rejects bad lat/long)', async () => {
    await expect(
      service.updateLocation('caller-1', { latitude: 120, longitude: 0 }),
    ).rejects.toThrow(/latitude/);
    await expect(
      service.updateLocation('caller-1', { latitude: 0, longitude: 999 }),
    ).rejects.toThrow(/longitude/);
    expect(prisma.friendLocation.upsert).not.toHaveBeenCalled();
  });
});

describe('LocationService.clearLocation', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: LocationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LocationService(prisma);
  });

  it('reports cleared=true when a row was removed', async () => {
    prisma.friendLocation.deleteMany.mockResolvedValue({ count: 1 });

    const result = await service.clearLocation('caller-1');

    expect(result).toEqual({ cleared: true });
    expect(prisma.friendLocation.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'caller-1' },
    });
  });

  it('is idempotent: cleared=false and no throw when no row exists', async () => {
    prisma.friendLocation.deleteMany.mockResolvedValue({ count: 0 });

    const result = await service.clearLocation('caller-1');

    expect(result).toEqual({ cleared: false });
  });
});

describe('LocationService.getFriendsOnMap (privacy)', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let service: LocationService;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new LocationService(prisma);
  });

  it('returns [] without querying locations when no owner authorized the caller', async () => {
    installEdges(prisma, []);

    const result = await service.getFriendsOnMap('caller-1');

    expect(result).toEqual([]);
    expect(prisma.friendLocation.findMany).not.toHaveBeenCalled();
  });

  it('only queries locations for the owner-authorized ids (QC-F-533)', async () => {
    installEdges(prisma, [makeEdge('friend-1'), makeEdge('friend-2')]);
    prisma.friendLocation.findMany.mockResolvedValue([]);

    await service.getFriendsOnMap('caller-1');

    expect(prisma.closeFriend.findMany).toHaveBeenCalledWith({
      where: { friendId: 'caller-1' },
      select: { userId: true },
    });
    expect(prisma.friendLocation.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['friend-1', 'friend-2'] } },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('returns [] when no authorized owner is currently sharing', async () => {
    installEdges(prisma, [makeEdge('friend-1')]);
    prisma.friendLocation.findMany.mockResolvedValue([]);

    const result = await service.getFriendsOnMap('caller-1');

    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('shapes only authorized owners who are sharing, excluding non-authorized users', async () => {
    // Two owners authorized the caller; only friend-1 is sharing. (friend-2
    // has no location row, and stranger-9 never authorized the caller so is
    // never queried.)
    installEdges(prisma, [makeEdge('friend-1'), makeEdge('friend-2')]);
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({ id: 'loc-1', userId: 'friend-1', latitude: 10, longitude: 20 }),
    ]);
    prisma.user.findMany.mockResolvedValue([
      makeUser({ id: 'friend-1', username: 'alice', displayName: 'Alice', avatarUrl: null }),
    ]);

    const result = await service.getFriendsOnMap('caller-1');

    expect(result).toEqual([
      {
        userId: 'friend-1',
        username: 'alice',
        displayName: 'Alice',
        avatarUrl: null,
        latitude: 10,
        longitude: 20,
        updatedAt: FRESH_UPDATED_AT,
      },
    ]);
    // User profiles only fetched for the sharing friend id.
    // QC-F-042: `preferences` joins the select so the owner's own
    // whoCanSeeLocation pref can be enforced on the already-fetched rows.
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['friend-1'] } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        preferences: true,
      },
    });
  });

  it('skips a sharing friend whose user record is missing (no placeholder identity)', async () => {
    installEdges(prisma, [makeEdge('friend-1'), makeEdge('friend-2')]);
    prisma.friendLocation.findMany.mockResolvedValue([
      makeLocation({ id: 'loc-1', userId: 'friend-1' }),
      makeLocation({ id: 'loc-2', userId: 'friend-2' }),
    ]);
    // Only friend-1 has a resolvable profile.
    prisma.user.findMany.mockResolvedValue([makeUser({ id: 'friend-1' })]);

    const result = await service.getFriendsOnMap('caller-1');

    expect(result.map((f) => f.userId)).toEqual(['friend-1']);
  });
});
