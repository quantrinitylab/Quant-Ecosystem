// ============================================================================
// QC-F-533 — Snap Map location gate direction regression tests
//
// Defect: LocationService.getFriendsOnMap took its candidate set from the
// CALLER's own CloseFriend list (`closeFriend.findMany({ where:
// { userId: caller } })`), so the per-viewer gate stood on the viewer's
// one-sided claim, not the owner's consent. The CloseFriend table is
// ecosystem-shared and QuantGram's writer mints an edge with only a
// self-check, so any logged-in user could list a victim as a "close
// friend" and read the victim's precise lat/long from GET /map/friends
// (given a publish inside 8h + the default 'friends' pref). The feature
// was inverted too: owners who listed the caller (but were not listed
// back) and DIRECT-only pairs never got a pin, though the codebase's one
// v1 "friend" definition (PrivacyService.isFriendOf) is owner-side.
//
// Fix: step 1 of getFriendsOnMap is now owner-side enumeration —
// PrivacyService.friendOwnerIdsFor(caller), the batched reverse form of
// isFriendOf (owners who listed the caller, plus owners sharing an active
// DIRECT with the caller). Freshness (QC-F-437), blocked-pair (QC-F-447)
// and owner-pref (QC-F-042) gates are unchanged and run after it.
//
// Negative control (verified against the ORIGINAL production code, with
// these FIXED where-aware fixtures — harness fixes are not stashed):
//   FAIL: T1, T2, T3, T7, T13, T14 (compile — friendOwnerIdsFor absent)
//   PASS: T4, T5, T6, T9, T10, T11 (controls — behaviour that must not
//         change; T9–T11 pass on the original because there the pin never
//         got past step 1 in these fixtures — their real work is pinning
//         that the gates still cut AFTER authorization on fixed code,
//         re-proven with authorized fixtures by the F-042/F-447 suites)
//   T8, T12, T15 pin fixed behaviour only (not applicable to the
//   original — counted separately, never as NC failures).
//
// The fake is WHERE-AWARE throughout (the privacy.service.test.ts
// pattern): a where-blind fake would let a pin flow through the mocks
// without any authorization and turn the negative control into theatre.
// Mocks use stable identities; all fixture timestamps are relative-to-now.
// ============================================================================
import { describe, it, expect, vi } from 'vitest';
import { LocationService } from '../services/location.service';
import { PrivacyService } from '../services/privacy.service';

const CALLER = 'caller-1';
const OWNER = 'owner-1';
const FRIEND2 = 'friend-2';
const DIRECT_PAL = 'direct-pal';
const GROUP_PAL = 'group-pal';
const STRANGER = 'stranger-1';

interface Edge {
  userId: string;
  friendId: string;
}
interface Member {
  conversationId: string;
  userId: string;
  leftAt: Date | null;
}
interface Conv {
  id: string;
  type: string;
}
interface LocRow {
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt: Date;
}

function prefsWith(privacy?: Record<string, unknown>, blockedUsers?: unknown) {
  const chatSettings: Record<string, unknown> = {};
  if (privacy) chatSettings['privacy'] = privacy;
  if (blockedUsers !== undefined) chatSettings['blockedUsers'] = blockedUsers;
  return { chatSettings };
}
const FRIENDS_PREF = prefsWith({ whoCanSeeLocation: 'friends' });

const FRESH = new Date();
const NINE_HOURS_AGO = new Date(Date.now() - 9 * 60 * 60 * 1000);

interface WorldOpts {
  edges?: Edge[];
  members?: Member[];
  conversations?: Conv[];
  locations?: LocRow[];
  prefsById?: Record<string, unknown>;
  throwOn?: { closeFriend?: boolean; conversationMember?: boolean };
}

function loc(userId: string, overrides: Partial<LocRow> = {}): LocRow {
  return {
    userId,
    latitude: 10,
    longitude: 20,
    updatedAt: FRESH,
    ...overrides,
  };
}

function makeWorld(opts: WorldOpts) {
  const edges = opts.edges ?? [];
  const members = opts.members ?? [];
  const conversations = opts.conversations ?? [];
  const locations = opts.locations ?? [];
  const prefsById = opts.prefsById ?? {};

  const userIds = new Set<string>([CALLER, ...locations.map((l) => l.userId)]);
  const users = [...userIds].map((id) => ({
    id,
    username: `name-${id}`,
    displayName: `Name ${id}`,
    avatarUrl: null as string | null,
    preferences: prefsById[id] ?? FRIENDS_PREF,
  }));

  const calls = {
    closeFriend: [] as Array<Record<string, unknown>>,
    conversationMember: [] as Array<Record<string, unknown>>,
    conversation: [] as Array<Record<string, unknown>>,
    friendLocation: [] as Array<Record<string, unknown>>,
    user: [] as Array<Record<string, unknown>>,
  };

  const prisma = {
    closeFriend: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        calls.closeFriend.push(args);
        if (opts.throwOn?.closeFriend) throw new Error('db down');
        const where = (args['where'] ?? {}) as {
          userId?: string | { in: string[] };
          friendId?: string;
        };
        return edges
          .filter((e) => {
            if (typeof where.userId === 'string') return e.userId === where.userId;
            if (where.userId && Array.isArray(where.userId.in))
              return where.userId.in.includes(e.userId);
            return true;
          })
          .filter((e) => where.friendId === undefined || e.friendId === where.friendId)
          .map((e) => ({ id: `edge-${e.userId}-${e.friendId}`, ...e, createdAt: FRESH }));
      }),
    },
    conversationMember: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        calls.conversationMember.push(args);
        if (opts.throwOn?.conversationMember) throw new Error('db down');
        const where = (args['where'] ?? {}) as {
          userId?: string | { in: string[] };
          conversationId?: string | { in: string[] };
          leftAt?: Date | null;
        };
        return members
          .filter((m) => {
            if (typeof where.userId === 'string') return m.userId === where.userId;
            if (where.userId && Array.isArray(where.userId.in))
              return where.userId.in.includes(m.userId);
            return true;
          })
          .filter((m) => {
            if (typeof where.conversationId === 'string')
              return m.conversationId === where.conversationId;
            if (where.conversationId && Array.isArray(where.conversationId.in))
              return where.conversationId.in.includes(m.conversationId);
            return true;
          })
          .filter((m) => where.leftAt === undefined || (where.leftAt === null ? m.leftAt === null : true))
          .map((m) => ({ conversationId: m.conversationId, userId: m.userId }));
      }),
    },
    conversation: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        calls.conversation.push(args);
        const where = (args['where'] ?? {}) as {
          id?: { in: string[] };
          type?: string;
        };
        return conversations
          .filter((c) => !where.id || where.id.in.includes(c.id))
          .filter((c) => where.type === undefined || c.type === where.type)
          .map((c) => ({ id: c.id }));
      }),
    },
    friendLocation: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        calls.friendLocation.push(args);
        const where = (args['where'] ?? {}) as { userId?: { in: string[] } };
        const inList = where.userId?.in ?? [];
        return locations
          .filter((l) => inList.includes(l.userId))
          .map((l) => ({ id: `loc-${l.userId}`, ...l }));
      }),
    },
    user: {
      findMany: vi.fn(async (args: Record<string, unknown>) => {
        calls.user.push(args);
        const where = (args['where'] ?? {}) as { id?: { in: string[] } };
        const inList = where.id?.in ?? [];
        return users.filter((u) => inList.includes(u.id));
      }),
    },
  };

  return {
    prisma,
    calls,
    service: new LocationService(prisma as never),
  };
}

function friendLocationInLists(calls: { friendLocation: Array<Record<string, unknown>> }): string[] {
  return calls.friendLocation.flatMap((a) => {
    const where = (a['where'] ?? {}) as { userId?: { in: string[] } };
    return where.userId?.in ?? [];
  });
}

describe('QC-F-533 getFriendsOnMap gate direction', () => {
  it('T1 [NC]: caller->owner one-sided edge (Gram shape) yields ZERO pins and the owner id never reaches the location query', async () => {
    const { service, calls } = makeWorld({
      edges: [{ userId: CALLER, friendId: OWNER }],
      locations: [loc(OWNER)],
    });

    const result = await service.getFriendsOnMap(CALLER);

    expect(result).toEqual([]);
    expect(friendLocationInLists(calls)).not.toContain(OWNER);
  });

  it('T2 [NC]: owner->caller edge yields the pin with the exact FriendOnMap shape', async () => {
    const { service } = makeWorld({
      edges: [{ userId: OWNER, friendId: CALLER }],
      locations: [loc(OWNER, { latitude: 51.5074, longitude: -0.1278 })],
    });

    const result = await service.getFriendsOnMap(CALLER);

    expect(result).toEqual([
      {
        userId: OWNER,
        username: `name-${OWNER}`,
        displayName: `Name ${OWNER}`,
        avatarUrl: null,
        latitude: 51.5074,
        longitude: -0.1278,
        updatedAt: FRESH,
      },
    ]);
  });

  it('T3 [NC]: DIRECT-only pair (no close-friend edge either way) yields the pin', async () => {
    const { service } = makeWorld({
      edges: [],
      members: [
        { conversationId: 'conv-direct', userId: CALLER, leftAt: null },
        { conversationId: 'conv-direct', userId: DIRECT_PAL, leftAt: null },
      ],
      conversations: [{ id: 'conv-direct', type: 'DIRECT' }],
      locations: [loc(DIRECT_PAL)],
    });

    const result = await service.getFriendsOnMap(CALLER);

    expect(result.map((f) => f.userId)).toEqual([DIRECT_PAL]);
  });

  it('T4 (control): GROUP-only shared conversation yields no pin', async () => {
    const { service } = makeWorld({
      edges: [],
      members: [
        { conversationId: 'conv-group', userId: CALLER, leftAt: null },
        { conversationId: 'conv-group', userId: GROUP_PAL, leftAt: null },
      ],
      conversations: [{ id: 'conv-group', type: 'GROUP' }],
      locations: [loc(GROUP_PAL)],
    });

    await expect(service.getFriendsOnMap(CALLER)).resolves.toEqual([]);
  });

  it('T5 (control): a DIRECT the pal has left (leftAt set) yields no pin', async () => {
    const { service } = makeWorld({
      edges: [],
      members: [
        { conversationId: 'conv-direct', userId: CALLER, leftAt: null },
        { conversationId: 'conv-direct', userId: DIRECT_PAL, leftAt: new Date() },
      ],
      conversations: [{ id: 'conv-direct', type: 'DIRECT' }],
      locations: [loc(DIRECT_PAL)],
    });

    await expect(service.getFriendsOnMap(CALLER)).resolves.toEqual([]);
  });

  it('T6 (control): mutual edges still yield the pin (real friends unaffected)', async () => {
    const { service } = makeWorld({
      edges: [
        { userId: OWNER, friendId: CALLER },
        { userId: CALLER, friendId: OWNER },
      ],
      locations: [loc(OWNER)],
    });

    const result = await service.getFriendsOnMap(CALLER);

    expect(result.map((f) => f.userId)).toEqual([OWNER]);
  });

  it('T7 [NC]: edge read throws -> resolves [] (fail-closed, never a rejection, no caller-list fallback)', async () => {
    const { service } = makeWorld({
      edges: [{ userId: OWNER, friendId: CALLER }],
      locations: [loc(OWNER)],
      throwOn: { closeFriend: true },
    });

    await expect(service.getFriendsOnMap(CALLER)).resolves.toEqual([]);
  });

  it('T8 (fixed-behaviour pin): one half failing does not take the other half down', async () => {
    // DIRECT chain throws, owner->caller edge present -> pin still returned.
    const a = makeWorld({
      edges: [{ userId: OWNER, friendId: CALLER }],
      locations: [loc(OWNER)],
      throwOn: { conversationMember: true },
    });
    await expect(a.service.getFriendsOnMap(CALLER)).resolves.toMatchObject([
      { userId: OWNER },
    ]);

    // Edge read throws, DIRECT present -> pin still returned.
    const b = makeWorld({
      edges: [],
      members: [
        { conversationId: 'conv-direct', userId: CALLER, leftAt: null },
        { conversationId: 'conv-direct', userId: DIRECT_PAL, leftAt: null },
      ],
      conversations: [{ id: 'conv-direct', type: 'DIRECT' }],
      locations: [loc(DIRECT_PAL)],
      throwOn: { closeFriend: true },
    });
    await expect(b.service.getFriendsOnMap(CALLER)).resolves.toMatchObject([
      { userId: DIRECT_PAL },
    ]);
  });

  it("T9 (control): owner pref 'nobody' / 'ghost' still hides an authorized owner", async () => {
    const nobody = makeWorld({
      edges: [{ userId: OWNER, friendId: CALLER }],
      locations: [loc(OWNER)],
      prefsById: { [OWNER]: prefsWith({ whoCanSeeLocation: 'nobody' }) },
    });
    await expect(nobody.service.getFriendsOnMap(CALLER)).resolves.toEqual([]);

    const ghost = makeWorld({
      edges: [{ userId: OWNER, friendId: CALLER }],
      locations: [loc(OWNER)],
      prefsById: { [OWNER]: prefsWith({ whoCanSeeLocation: 'ghost' }) },
    });
    await expect(ghost.service.getFriendsOnMap(CALLER)).resolves.toEqual([]);
  });

  it('T10 (control): a blocked pair (either direction) still hides an authorized owner', async () => {
    const ownerBlockedCaller = makeWorld({
      edges: [{ userId: OWNER, friendId: CALLER }],
      locations: [loc(OWNER)],
      prefsById: {
        [OWNER]: prefsWith({ whoCanSeeLocation: 'friends' }, [{ id: CALLER }]),
      },
    });
    await expect(
      ownerBlockedCaller.service.getFriendsOnMap(CALLER),
    ).resolves.toEqual([]);

    const callerBlockedOwner = makeWorld({
      edges: [{ userId: OWNER, friendId: CALLER }],
      locations: [loc(OWNER)],
      prefsById: {
        [CALLER]: prefsWith({ whoCanSeeLocation: 'friends' }, [{ id: OWNER }]),
      },
    });
    await expect(
      callerBlockedOwner.service.getFriendsOnMap(CALLER),
    ).resolves.toEqual([]);
  });

  it('T11 (control): a stale (9h) row of an authorized owner is still hidden', async () => {
    const { service } = makeWorld({
      edges: [{ userId: OWNER, friendId: CALLER }],
      locations: [loc(OWNER, { updatedAt: NINE_HOURS_AGO })],
    });

    await expect(service.getFriendsOnMap(CALLER)).resolves.toEqual([]);
  });

  it('T12 (fixed-behaviour pin): query count is bounded — no per-owner loop', async () => {
    const { service, calls } = makeWorld({
      edges: [
        { userId: OWNER, friendId: CALLER },
        { userId: FRIEND2, friendId: CALLER },
        { userId: CALLER, friendId: STRANGER },
      ],
      members: [
        { conversationId: 'conv-direct', userId: CALLER, leftAt: null },
        { conversationId: 'conv-direct', userId: DIRECT_PAL, leftAt: null },
        { conversationId: 'conv-group', userId: CALLER, leftAt: null },
        { conversationId: 'conv-group', userId: GROUP_PAL, leftAt: null },
      ],
      conversations: [
        { id: 'conv-direct', type: 'DIRECT' },
        { id: 'conv-group', type: 'GROUP' },
      ],
      locations: [loc(OWNER), loc(FRIEND2), loc(DIRECT_PAL), loc(GROUP_PAL), loc(STRANGER)],
    });

    const result = await service.getFriendsOnMap(CALLER);

    expect(result.map((f) => f.userId).sort()).toEqual(
      [DIRECT_PAL, FRIEND2, OWNER].sort(),
    );
    expect(calls.closeFriend.length).toBeLessThanOrEqual(1);
    expect(calls.conversationMember.length).toBeLessThanOrEqual(2);
    expect(calls.conversation.length).toBeLessThanOrEqual(1);
    expect(calls.friendLocation.length).toBe(1);
    expect(calls.user.length).toBeLessThanOrEqual(2);
  });

  it('T13 [NC]: mixed world — the location query asks ONLY for authorized owners', async () => {
    const { service, calls } = makeWorld({
      edges: [
        { userId: OWNER, friendId: CALLER },
        { userId: CALLER, friendId: STRANGER },
      ],
      locations: [loc(OWNER), loc(STRANGER)],
    });

    const result = await service.getFriendsOnMap(CALLER);

    expect(result.map((f) => f.userId)).toEqual([OWNER]);
    const inList = friendLocationInLists(calls);
    expect(inList).toContain(OWNER);
    expect(inList).not.toContain(STRANGER);
  });

  it('T14 [NC]: friendOwnerIdsFor is exactly the batched reverse of isFriendOf (minus self)', async () => {
    const { prisma } = makeWorld({
      edges: [
        { userId: OWNER, friendId: CALLER },
        { userId: CALLER, friendId: STRANGER },
      ],
      members: [
        { conversationId: 'conv-direct', userId: CALLER, leftAt: null },
        { conversationId: 'conv-direct', userId: DIRECT_PAL, leftAt: null },
        { conversationId: 'conv-group', userId: CALLER, leftAt: null },
        { conversationId: 'conv-group', userId: GROUP_PAL, leftAt: null },
      ],
      conversations: [
        { id: 'conv-direct', type: 'DIRECT' },
        { id: 'conv-group', type: 'GROUP' },
      ],
    });
    const svc = new PrivacyService(prisma as never);

    const owners = await svc.friendOwnerIdsFor(CALLER);
    for (const x of [OWNER, DIRECT_PAL, GROUP_PAL, STRANGER, CALLER]) {
      const expected = (await svc.isFriendOf(x, CALLER)) && x !== CALLER;
      expect(owners.has(x), `owner-set membership for ${x}`).toBe(expected);
    }
  });

  it('T15 (fixed-behaviour pin): the caller never gets their own pin', async () => {
    const { service } = makeWorld({
      edges: [{ userId: CALLER, friendId: CALLER }],
      locations: [loc(CALLER)],
    });

    await expect(service.getFriendsOnMap(CALLER)).resolves.toEqual([]);
  });
});
