import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LocationService,
  assertValidCoordinates,
  type CloseFriendRecord,
  type FriendLocationRecord,
  type MapUserRecord,
} from '../services/location.service';

function makeLocation(overrides: Partial<FriendLocationRecord> = {}): FriendLocationRecord {
  return {
    id: 'loc-1',
    userId: 'friend-1',
    latitude: 35.6762,
    longitude: 139.6503,
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeEdge(friendId: string): CloseFriendRecord {
  return {
    id: `edge-${friendId}`,
    userId: 'caller-1',
    friendId,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  };
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

  it('returns [] without querying locations when the caller has no close friends', async () => {
    prisma.closeFriend.findMany.mockResolvedValue([]);

    const result = await service.getFriendsOnMap('caller-1');

    expect(result).toEqual([]);
    expect(prisma.friendLocation.findMany).not.toHaveBeenCalled();
  });

  it('only queries locations for the caller close-friend ids', async () => {
    prisma.closeFriend.findMany.mockResolvedValue([makeEdge('friend-1'), makeEdge('friend-2')]);
    prisma.friendLocation.findMany.mockResolvedValue([]);

    await service.getFriendsOnMap('caller-1');

    expect(prisma.closeFriend.findMany).toHaveBeenCalledWith({
      where: { userId: 'caller-1' },
      select: { friendId: true },
    });
    expect(prisma.friendLocation.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ['friend-1', 'friend-2'] } },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('returns [] when no close friend is currently sharing', async () => {
    prisma.closeFriend.findMany.mockResolvedValue([makeEdge('friend-1')]);
    prisma.friendLocation.findMany.mockResolvedValue([]);

    const result = await service.getFriendsOnMap('caller-1');

    expect(result).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('shapes only close friends who are sharing, excluding non-close-friends', async () => {
    // Caller has two close friends; only friend-1 is sharing. (friend-2 has no
    // location row, and stranger-9 is never a close friend so never queried.)
    prisma.closeFriend.findMany.mockResolvedValue([makeEdge('friend-1'), makeEdge('friend-2')]);
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
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);
    // User profiles only fetched for the sharing friend id.
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['friend-1'] } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });
  });

  it('skips a sharing friend whose user record is missing (no placeholder identity)', async () => {
    prisma.closeFriend.findMany.mockResolvedValue([makeEdge('friend-1'), makeEdge('friend-2')]);
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
