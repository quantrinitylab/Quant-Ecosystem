// ============================================================================
// QC-F-447 — block enforcement stops at message-send (stories / reels /
// Snap Map location are NOT gated)
// ============================================================================
//
// Defect (P1, loop-audit security 2026-10-16): QC-F-359 made block stop
// message SEND in an existing DIRECT conversation, but block was never
// applied to the other surfaces where the blocked person meets the
// blocker:
//   (a) Stories — `canViewStory` had no blocked-pair check at all: a
//       blocked viewer with an old DIRECT chat passed the default
//       'friends' pref gate, watched the blocker's stories, recorded a
//       StoryView, and left their name in the owner's viewers list.
//       The reverse direction (viewer blocked the author) was unfiltered
//       too.
//   (b) Snap Map — `LocationService.getFriendsOnMap` never consulted the
//       block list and NOTHING ever deleted CloseFriend edges, so a
//       blocked user who had added the blocker as a close friend kept
//       seeing the blocker's precise live location.
//   (c) Reels / Spotlight / Discover — reel.service had zero block or
//       privacy checks: like/comment/share only required the reel to
//       exist, the feed/spotlight/discover lists were unfiltered in both
//       block directions, and shareReel did not even receive the actor.
//
// Fix pinned here (specialist-qc-f-447-buildprep.md, Slice-1):
//   - PrivacyService.checkBlockedPair (both directions, 'blocked' >
//     'unavailable' > 'clear', QC-F-359 semantics) +
//     blockedExclusionsFor (ONE findMany; excluded ∪ uncertain, list
//     surfaces hide both — fail-closed).
//   - Stories: Gate 0 in canViewStory (ahead of audience + pref gates);
//     feed/view/reply all inherit it (invisible = the existing 404, no
//     view recorded); the owner viewers list filters currently-blocked
//     viewers at read time (rows are history, never deleted).
//   - Location: getFriendsOnMap omits blocked pairs in both directions
//     (and on an unreadable block list), on top of the QC-F-042 pref gate
//     and the QC-F-437 freshness window, which are unchanged.
//   - Settings: a successful POST /settings/blocked severs CloseFriend
//     edges both ways (best-effort defense-in-depth; the read gates are
//     the authority). Unblock does NOT restore edges.
//   - Reels: like/comment/share run the pair gate BEFORE any row/counter
//     write — blocked = the reel's own 404 REEL_NOT_FOUND (the feed
//     already hides it from this actor), unreadable = 503
//     UPSTREAM_UNAVAILABLE. shareReel(reelId, userId) takes the actor
//     the route used to throw away. Feed/Spotlight/Discover cut
//     blocked-pair creators silently; feed totalAvailable is the
//     filtered count.
//
// Harnesses: REAL PrivacyService / ReelService / LocationService /
// DiscoverService against stateful in-memory fakes (stable identities),
// REAL stories + settings + spotlight route plugins on Fastify with a
// fake prisma (the qc-f-021 / qc-f-317 patterns).
//
// Negative control (verified 2026-10-16, build-qc-f-447-negcontrol.log):
// on the pre-fix code 22 cases FAIL and 6 PASS. The [NC] cases all FAIL —
//   H1, H2 (helpers do not exist), S1, S2, S3, S4, S5, S6, S7,
//   L1, L2, L3, B1 (no sever exists), R1, R2, R3, R4, R5, R6, R7, R8 —
// and the pure controls PASS on both versions: S8, L4, L5, B2, R9, R10.
// B3 also FAILS pre-fix, by construction: its setup asserts the NEW sever
// emptied the edges before it pins that unblock does not restore them.
// ============================================================================

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { errorHandlerPlugin } from '@quant/server-core';
import { PrivacyService, type PrivacyPrismaLike } from '../services/privacy.service';
import { LocationService } from '../services/location.service';
import { ReelService } from '../services/reel.service';
import { DiscoverService } from '../services/discover.service';
import storiesRoutes from '../routes/stories';
import settingsRoutes from '../routes/settings';
import spotlightRoutes from '../routes/spotlight';

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

const prefsBlocking = (ids: string[]) => ({
  chatSettings: { blockedUsers: ids.map((id) => ({ id })) },
});
const MALFORMED_PREFS = { chatSettings: { blockedUsers: 'not-an-array' } };

const AUTHOR = 'user-author';
const VIEWER = 'user-viewer';
const THIRD = 'user-third';

// ===========================================================================
// H series — PrivacyService pair helpers
// ===========================================================================

function makePrivacy(prefs: Map<string, unknown>, throwOnFindMany = false) {
  const like: PrivacyPrismaLike = {
    user: {
      async findUnique(args: unknown) {
        const id = (args as { where: { id: string } }).where.id;
        return prefs.has(id) ? { preferences: prefs.get(id) } : null;
      },
      async findMany(args: unknown) {
        if (throwOnFindMany) throw new Error('db down');
        const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
        return ids
          .filter((id) => prefs.has(id))
          .map((id) => ({ id, preferences: prefs.get(id) }));
      },
    },
  };
  return new PrivacyService(like);
}

describe('QC-F-447 H: PrivacyService pair helpers', () => {
  it('H1 [NC] checkBlockedPair: blocked beats unavailable, self is clear', async () => {
    const prefs = new Map<string, unknown>([
      ['a', prefsBlocking(['b'])],
      ['b', MALFORMED_PREFS],
      ['c', { chatSettings: { blockedUsers: [] } }],
      ['d', MALFORMED_PREFS],
    ]);
    const svc = makePrivacy(prefs);
    await expect(svc.checkBlockedPair('a', 'b')).resolves.toBe('blocked');
    await expect(svc.checkBlockedPair('b', 'a')).resolves.toBe('blocked');
    await expect(svc.checkBlockedPair('c', 'd')).resolves.toBe('unavailable');
    await expect(svc.checkBlockedPair('a', 'c')).resolves.toBe('clear');
    await expect(svc.checkBlockedPair('a', 'a')).resolves.toBe('clear');
    // Missing row = no list exists = clear (checkBlockedBy's rule).
    await expect(svc.checkBlockedPair('a', 'ghost')).resolves.toBe('clear');
  });

  it('H2 [NC] blockedExclusionsFor: both directions, malformed = uncertain, read failure = all uncertain', async () => {
    const prefs = new Map<string, unknown>([
      // viewer blocked cand-b; cand-a blocked the viewer; cand-c malformed.
      [VIEWER, prefsBlocking(['cand-b'])],
      ['cand-a', prefsBlocking([VIEWER])],
      ['cand-b', { chatSettings: { blockedUsers: [] } }],
      ['cand-c', MALFORMED_PREFS],
      ['cand-d', { chatSettings: { blockedUsers: [] } }],
    ]);
    const svc = makePrivacy(prefs);
    const { excluded, uncertain } = await svc.blockedExclusionsFor(VIEWER, [
      'cand-a',
      'cand-b',
      'cand-c',
      'cand-d',
      VIEWER, // self is never a candidate
    ]);
    expect([...excluded].sort()).toEqual(['cand-a', 'cand-b']);
    expect([...uncertain]).toEqual(['cand-c']);

    const failing = makePrivacy(prefs, true);
    const failed = await failing.blockedExclusionsFor(VIEWER, ['cand-a', 'cand-d']);
    expect(failed.excluded.size).toBe(0);
    expect([...failed.uncertain].sort()).toEqual(['cand-a', 'cand-d']);
  });
});

// ===========================================================================
// S series — stories routes (real plugin, stateful fake)
// ===========================================================================

interface StoryWorld {
  prefs: Map<string, unknown>;
  views: Array<{ storyId: string; viewerId: string; viewedAt: Date }>;
  story: { viewCount: number };
  buildApp: (userId: string) => Promise<FastifyInstance>;
}

function makeStoryWorld(opts: {
  authorPrefs: unknown;
  viewerPrefs?: unknown;
  thirdPrefs?: unknown;
  directChat?: boolean;
}): StoryWorld {
  const NOW = new Date();
  const FUTURE = new Date(Date.now() + 3_600_000);
  const prefs = new Map<string, unknown>([
    [AUTHOR, opts.authorPrefs],
    [VIEWER, opts.viewerPrefs ?? null],
    [THIRD, opts.thirdPrefs ?? null],
  ]);
  const displayNames: Record<string, string> = {
    [AUTHOR]: 'Ann Author',
    [VIEWER]: 'Vic Viewer',
    [THIRD]: 'Tess Third',
  };
  const storyRow = {
    id: 'story-1',
    userId: AUTHOR,
    type: 'TEXT' as const,
    mediaUrl: null,
    textContent: 'hello',
    duration: 15,
    viewCount: 0,
    audience: 'ALL',
    createdAt: NOW,
    expiresAt: FUTURE,
  };
  const views: StoryWorld['views'] = [];
  const members = opts.directChat
    ? [
        { conversationId: 'conv-1', userId: AUTHOR, leftAt: null },
        { conversationId: 'conv-1', userId: VIEWER, leftAt: null },
      ]
    : [];

  const prisma = {
    story: {
      async findMany() {
        return [
          {
            ...storyRow,
            user: { id: AUTHOR, displayName: displayNames[AUTHOR], avatarUrl: null },
          },
        ];
      },
      async findUnique() {
        return { ...storyRow };
      },
      async update({ data }: { data: { viewCount?: { increment: number } } }) {
        if (data.viewCount?.increment) storyRow.viewCount += data.viewCount.increment;
        return { ...storyRow };
      },
    },
    storyView: {
      async findMany({ where }: { where: { viewerId?: string; storyId?: string } }) {
        if (where.viewerId) {
          return views.filter((v) => v.viewerId === where.viewerId).map((v) => ({ storyId: v.storyId }));
        }
        return views
          .filter((v) => v.storyId === where.storyId)
          .map((v) => ({ storyId: v.storyId, viewerId: v.viewerId, viewedAt: v.viewedAt }));
      },
      async findUnique({ where }: { where: { storyId_viewerId: { storyId: string; viewerId: string } } }) {
        const key = where.storyId_viewerId;
        return views.find((v) => v.storyId === key.storyId && v.viewerId === key.viewerId) ?? null;
      },
      async create({ data }: { data: { storyId: string; viewerId: string } }) {
        views.push({ storyId: data.storyId, viewerId: data.viewerId, viewedAt: new Date() });
        return data;
      },
      async deleteMany() {
        return { count: 0 };
      },
    },
    closeFriend: {
      async findMany() {
        return [];
      },
    },
    user: {
      async findMany({ where }: { where: { id: { in: string[] } } }) {
        return where.id.in
          .filter((id) => prefs.has(id))
          .map((id) => ({
            id,
            preferences: prefs.get(id),
            displayName: displayNames[id] ?? id,
            avatarUrl: null,
          }));
      },
      async findUnique({ where }: { where: { id: string } }) {
        return prefs.has(where.id) ? { preferences: prefs.get(where.id) } : null;
      },
    },
    conversationMember: {
      async findMany({ where }: { where: Record<string, unknown> }) {
        return members.filter((m) => {
          if (typeof where.userId === 'string' && m.userId !== where.userId) return false;
          const inIds = (where.userId as { in?: string[] } | undefined)?.in;
          if (inIds && !inIds.includes(m.userId)) return false;
          const convIn = (where.conversationId as { in?: string[] } | undefined)?.in;
          if (convIn && !convIn.includes(m.conversationId)) return false;
          if ('leftAt' in where && m.leftAt !== where.leftAt) return false;
          return true;
        });
      },
    },
    conversation: {
      async findMany({ where }: { where: { id: { in: string[] }; type?: string } }) {
        return where.id.in.includes('conv-1') && (where.type === undefined || where.type === 'DIRECT')
          ? [{ id: 'conv-1' }]
          : [];
      },
    },
    message: {
      async create({ data }: { data: Record<string, unknown> }) {
        return { id: 'msg-never', ...data };
      },
    },
  };

  async function buildApp(userId: string): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
      done();
    });
    await app.register(storiesRoutes, { prefix: '/stories' });
    await app.ready();
    return app;
  }

  return { prefs, views, story: storyRow, buildApp };
}

async function feedGroupIds(app: FastifyInstance): Promise<string[]> {
  const res = await app.inject({ method: 'GET', url: '/stories/feed' });
  expect(res.statusCode).toBe(200);
  return (res.json() as { groups: Array<{ userId: string }> }).groups.map((g) => g.userId);
}

describe('QC-F-447 S: stories blocked-pair Gate 0', () => {
  it('S1 [NC] author blocked viewer + old DIRECT chat + default pref → feed hides author', async () => {
    const world = makeStoryWorld({
      authorPrefs: prefsBlocking([VIEWER]),
      directChat: true,
    });
    const app = await world.buildApp(VIEWER);
    await expect(feedGroupIds(app)).resolves.not.toContain(AUTHOR);
    await app.close();
  });

  it('S2 [NC] author blocked viewer + whoCanSeeStory everyone → feed still hides author', async () => {
    const world = makeStoryWorld({
      authorPrefs: {
        chatSettings: {
          privacy: { whoCanSeeStory: 'everyone' },
          blockedUsers: [{ id: VIEWER }],
        },
      },
    });
    const app = await world.buildApp(VIEWER);
    await expect(feedGroupIds(app)).resolves.not.toContain(AUTHOR);
    await app.close();
  });

  it('S3 [NC] viewer blocked author → author hidden from viewer feed', async () => {
    const world = makeStoryWorld({
      authorPrefs: { chatSettings: { privacy: { whoCanSeeStory: 'everyone' } } },
      viewerPrefs: prefsBlocking([AUTHOR]),
    });
    const app = await world.buildApp(VIEWER);
    await expect(feedGroupIds(app)).resolves.not.toContain(AUTHOR);
    await app.close();
  });

  it('S4 [NC] blocked viewer view → 404, no StoryView row, no viewCount bump', async () => {
    const world = makeStoryWorld({
      authorPrefs: {
        chatSettings: {
          privacy: { whoCanSeeStory: 'everyone' },
          blockedUsers: [{ id: VIEWER }],
        },
      },
    });
    const app = await world.buildApp(VIEWER);
    const res = await app.inject({ method: 'POST', url: '/stories/story-1/view' });
    expect(res.statusCode).toBe(404);
    expect(world.views).toHaveLength(0);
    expect(world.story.viewCount).toBe(0);
    await app.close();
  });

  it('S5 [NC] blocked viewer reply → 404 before any delivery machinery', async () => {
    const world = makeStoryWorld({
      authorPrefs: {
        chatSettings: {
          privacy: { whoCanSeeStory: 'everyone' },
          blockedUsers: [{ id: VIEWER }],
        },
      },
    });
    const app = await world.buildApp(VIEWER);
    const res = await app.inject({
      method: 'POST',
      url: '/stories/story-1/reply',
      payload: { message: 'hi' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('S6 [NC] viewers list hides a viewer blocked AFTER viewing; the row stays', async () => {
    const world = makeStoryWorld({
      authorPrefs: { chatSettings: { privacy: { whoCanSeeStory: 'everyone' } } },
    });
    const thirdApp = await world.buildApp(THIRD);
    const viewRes = await thirdApp.inject({ method: 'POST', url: '/stories/story-1/view' });
    expect(viewRes.statusCode).toBe(200);
    expect(world.views).toHaveLength(1);
    await thirdApp.close();

    // The author blocks the viewer after the fact.
    world.prefs.set(AUTHOR, {
      chatSettings: {
        privacy: { whoCanSeeStory: 'everyone' },
        blockedUsers: [{ id: THIRD }],
      },
    });
    const authorApp = await world.buildApp(AUTHOR);
    const res = await authorApp.inject({ method: 'GET', url: '/stories/story-1/viewers' });
    expect(res.statusCode).toBe(200);
    const viewers = (res.json() as { viewers: Array<{ userId: string }> }).viewers;
    expect(viewers.map((v) => v.userId)).not.toContain(THIRD);
    // History is not rewritten: the StoryView row itself survives.
    expect(world.views).toHaveLength(1);
    await authorApp.close();
  });

  it('S7 [NC] author block list malformed → story hidden + view 404 (uncertain = hidden)', async () => {
    const world = makeStoryWorld({
      authorPrefs: {
        chatSettings: {
          privacy: { whoCanSeeStory: 'everyone' },
          blockedUsers: 'not-an-array',
        },
      },
    });
    const app = await world.buildApp(VIEWER);
    await expect(feedGroupIds(app)).resolves.not.toContain(AUTHOR);
    const res = await app.inject({ method: 'POST', url: '/stories/story-1/view' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('S8 control: no block → feed shows author, view records + counts', async () => {
    const world = makeStoryWorld({
      authorPrefs: { chatSettings: { privacy: { whoCanSeeStory: 'everyone' } } },
    });
    const app = await world.buildApp(VIEWER);
    await expect(feedGroupIds(app)).resolves.toContain(AUTHOR);
    const res = await app.inject({ method: 'POST', url: '/stories/story-1/view' });
    expect(res.statusCode).toBe(200);
    expect(world.views).toHaveLength(1);
    expect(world.story.viewCount).toBe(1);
    await app.close();
  });
});

// ===========================================================================
// L series — LocationService.getFriendsOnMap blocked-pair cut
// ===========================================================================

const OWNER = 'user-owner';
const FRIEND2 = 'user-friend2';

function makeLocationWorld(opts: {
  ownerPrefs: unknown;
  callerPrefs?: unknown;
  friend2Prefs?: unknown;
  ownerFresh?: boolean;
}) {
  const fresh = new Date();
  const stale = new Date(Date.now() - 9 * 3_600_000);
  const users = [
    { id: VIEWER, username: 'vic', displayName: 'Vic', avatarUrl: null, preferences: opts.callerPrefs ?? null },
    {
      id: OWNER,
      username: 'olga',
      displayName: 'Olga',
      avatarUrl: null,
      preferences: opts.ownerPrefs,
    },
    {
      id: FRIEND2,
      username: 'fred',
      displayName: 'Fred',
      avatarUrl: null,
      preferences: opts.friend2Prefs ?? { chatSettings: { privacy: { whoCanSeeLocation: 'friends' } } },
    },
  ];
  const locations = [
    {
      id: 'loc-owner',
      userId: OWNER,
      latitude: 10,
      longitude: 20,
      updatedAt: opts.ownerFresh === false ? stale : fresh,
    },
    { id: 'loc-f2', userId: FRIEND2, latitude: 30, longitude: 40, updatedAt: fresh },
  ];
  const prisma = {
    closeFriend: {
      findMany: vi.fn(async () => [
        { id: 'e1', userId: VIEWER, friendId: OWNER, createdAt: fresh },
        { id: 'e2', userId: VIEWER, friendId: FRIEND2, createdAt: fresh },
      ]),
    },
    friendLocation: {
      findMany: vi.fn(async () => locations),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        users.filter((u) => where.id.in.includes(u.id)),
      ),
    },
  };
  return { service: new LocationService(prisma as never), prisma };
}

const FRIENDS_PREF = { chatSettings: { privacy: { whoCanSeeLocation: 'friends' } } };

describe('QC-F-447 L: Snap Map blocked-pair cut', () => {
  it('L1 [NC] owner blocked the caller → owner omitted despite close-friend edge', async () => {
    const { service } = makeLocationWorld({
      ownerPrefs: {
        chatSettings: {
          privacy: { whoCanSeeLocation: 'friends' },
          blockedUsers: [{ id: VIEWER }],
        },
      },
    });
    const onMap = await service.getFriendsOnMap(VIEWER);
    expect(onMap.map((f) => f.userId)).toEqual([FRIEND2]);
  });

  it('L2 [NC] caller blocked the owner → owner omitted', async () => {
    const { service } = makeLocationWorld({
      ownerPrefs: FRIENDS_PREF,
      callerPrefs: prefsBlocking([OWNER]),
    });
    const onMap = await service.getFriendsOnMap(VIEWER);
    expect(onMap.map((f) => f.userId)).toEqual([FRIEND2]);
  });

  it('L3 [NC] owner block list malformed → owner omitted, other friend unaffected', async () => {
    const { service } = makeLocationWorld({
      ownerPrefs: {
        chatSettings: {
          privacy: { whoCanSeeLocation: 'friends' },
          blockedUsers: 'not-an-array',
        },
      },
    });
    const onMap = await service.getFriendsOnMap(VIEWER);
    expect(onMap.map((f) => f.userId)).toEqual([FRIEND2]);
  });

  it('L4 control: no block anywhere → both fresh friends on map', async () => {
    const { service } = makeLocationWorld({ ownerPrefs: FRIENDS_PREF });
    const onMap = await service.getFriendsOnMap(VIEWER);
    expect(onMap.map((f) => f.userId).sort()).toEqual([FRIEND2, OWNER].sort());
  });

  it('L5 control: stale owner row stays omitted (QC-F-437 window unchanged)', async () => {
    const { service } = makeLocationWorld({ ownerPrefs: FRIENDS_PREF, ownerFresh: false });
    const onMap = await service.getFriendsOnMap(VIEWER);
    expect(onMap.map((f) => f.userId)).toEqual([FRIEND2]);
  });
});

// ===========================================================================
// B series — settings block severs CloseFriend edges (real plugin)
// ===========================================================================

interface BlockWorld {
  prefs: Map<string, unknown>;
  edges: Array<{ userId: string; friendId: string }>;
  deleteManyCalls: Array<{ userId: string; friendId: string }>;
  buildApp: (userId: string) => Promise<FastifyInstance>;
}

function makeBlockWorld(opts: { severThrows?: boolean } = {}): BlockWorld {
  const prefs = new Map<string, unknown>([
    [AUTHOR, null],
    [THIRD, null],
  ]);
  const edges = [
    { userId: AUTHOR, friendId: THIRD },
    { userId: THIRD, friendId: AUTHOR },
  ];
  const deleteManyCalls: BlockWorld['deleteManyCalls'] = [];

  const userDelegate = {
    async findUnique({ where }: { where: { id: string } }) {
      if (!prefs.has(where.id)) return null;
      return {
        id: where.id,
        preferences: prefs.get(where.id),
        displayName: `Name of ${where.id}`,
        username: `name-of-${where.id}`,
        deletedAt: null,
      };
    },
    async update({ where, data }: { where: { id: string }; data: { preferences: unknown } }) {
      prefs.set(where.id, data.preferences);
      return { id: where.id, preferences: data.preferences };
    },
  };
  const closeFriendDelegate = {
    async deleteMany({ where }: { where: { userId: string; friendId: string } }) {
      deleteManyCalls.push({ ...where });
      if (opts.severThrows) throw new Error('sever db down');
      const before = edges.length;
      for (let i = edges.length - 1; i >= 0; i--) {
        if (edges[i].userId === where.userId && edges[i].friendId === where.friendId) {
          edges.splice(i, 1);
        }
      }
      return { count: before - edges.length };
    },
  };
  const prisma = {
    user: userDelegate,
    closeFriend: closeFriendDelegate,
    $transaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({ user: userDelegate }),
  };

  async function buildApp(userId: string): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId };
      done();
    });
    await app.register(settingsRoutes, { prefix: '/settings' });
    await app.ready();
    return app;
  }

  return { prefs, edges, deleteManyCalls, buildApp };
}

function storedBlockedIds(prefs: Map<string, unknown>, userId: string): string[] {
  const raw = prefs.get(userId) as
    | { chatSettings?: { blockedUsers?: Array<{ id: string }> } }
    | null
    | undefined;
  return (raw?.chatSettings?.blockedUsers ?? []).map((e) => e.id);
}

describe('QC-F-447 B: block severs CloseFriend edges', () => {
  it('B1 [NC] successful block removes BOTH edge directions', async () => {
    const world = makeBlockWorld();
    const app = await world.buildApp(AUTHOR);
    const res = await app.inject({ method: 'POST', url: `/settings/blocked/${THIRD}` });
    expect(res.statusCode).toBe(200);
    expect(storedBlockedIds(world.prefs, AUTHOR)).toEqual([THIRD]);
    expect(world.deleteManyCalls).toEqual([
      { userId: AUTHOR, friendId: THIRD },
      { userId: THIRD, friendId: AUTHOR },
    ]);
    expect(world.edges).toHaveLength(0);
    await app.close();
  });

  it('B2: sever failure never un-blocks — 200 + list written', async () => {
    const world = makeBlockWorld({ severThrows: true });
    const app = await world.buildApp(AUTHOR);
    const res = await app.inject({ method: 'POST', url: `/settings/blocked/${THIRD}` });
    expect(res.statusCode).toBe(200);
    expect(storedBlockedIds(world.prefs, AUTHOR)).toEqual([THIRD]);
    await app.close();
  });

  it('B3 control: unblock removes the list entry and does NOT restore edges', async () => {
    const world = makeBlockWorld();
    const app = await world.buildApp(AUTHOR);
    await app.inject({ method: 'POST', url: `/settings/blocked/${THIRD}` });
    expect(world.edges).toHaveLength(0);
    const res = await app.inject({ method: 'DELETE', url: `/settings/blocked/${THIRD}` });
    expect(res.statusCode).toBe(200);
    expect(storedBlockedIds(world.prefs, AUTHOR)).toEqual([]);
    expect(world.edges).toHaveLength(0);
    await app.close();
  });
});

// ===========================================================================
// R series — reels: service gates + feed, spotlight route, discover
// ===========================================================================

const CREATOR = 'user-creator';
const CREATOR2 = 'user-creator2';
const CLEAN = 'user-clean';
const ACTOR = 'user-actor';

interface ReelRow {
  id: string;
  creatorId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  duration: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  watchThroughRate: number;
  isFeatured: boolean;
  createdAt: Date;
  creator: { username: string; avatarUrl: null; displayName: string };
}

function makeReelRow(id: string, creatorId: string, createdAt: Date, likes = 0): ReelRow {
  return {
    id,
    creatorId,
    videoUrl: `https://cdn.example.com/${id}.mp4`,
    thumbnailUrl: `https://cdn.example.com/${id}.jpg`,
    caption: `reel ${id}`,
    duration: 10,
    likeCount: likes,
    commentCount: 0,
    shareCount: 0,
    watchThroughRate: 0.5,
    isFeatured: false,
    createdAt,
    creator: { username: `name-of-${creatorId}`, avatarUrl: null, displayName: `Name of ${creatorId}` },
  };
}

interface ReelWorld {
  service: ReelService;
  prisma: unknown;
  prefs: Map<string, unknown>;
  reels: Map<string, ReelRow>;
  likes: Set<string>;
  comments: Array<{ reelId: string; userId: string; content: string }>;
}

function makeReelWorld(prefsInit: Map<string, unknown>, rows: ReelRow[]): ReelWorld {
  const prefs = new Map(prefsInit);
  const reels = new Map(rows.map((r) => [r.id, r]));
  const likes = new Set<string>();
  const comments: ReelWorld['comments'] = [];

  const userDelegate = {
    async findUnique({ where }: { where: { id: string } }) {
      return prefs.has(where.id) ? { preferences: prefs.get(where.id) } : null;
    },
    async findMany({ where }: { where: { id: { in: string[] } } }) {
      return where.id.in
        .filter((id) => prefs.has(id))
        .map((id) => ({
          id,
          preferences: prefs.get(id),
          username: `name-of-${id}`,
          displayName: `Name of ${id}`,
          avatarUrl: null,
          isVerified: false,
        }));
    },
  };
  const reelDelegate = {
    async findUnique({ where }: { where: { id: string } }) {
      const row = reels.get(where.id);
      return row ? { id: row.id, creatorId: row.creatorId, createdAt: row.createdAt } : null;
    },
    async findMany(args: { where?: { createdAt?: { lt: Date } }; take?: number }) {
      let out = [...reels.values()].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
      );
      if (args.where?.createdAt?.lt) {
        const lt = args.where.createdAt.lt.getTime();
        out = out.filter((r) => r.createdAt.getTime() < lt);
      }
      return args.take ? out.slice(0, args.take) : out;
    },
    async count() {
      return reels.size;
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, { increment?: number; decrement?: number }> }) {
      const row = reels.get(where.id)!;
      for (const [key, delta] of Object.entries(data)) {
        const rec = row as unknown as Record<string, number>;
        if (delta.increment) rec[key] += delta.increment;
        if (delta.decrement) rec[key] -= delta.decrement;
      }
      return { ...row };
    },
  };
  const likeDelegate = {
    async findUnique({ where }: { where: { reelId_userId: { reelId: string; userId: string } } }) {
      const key = `${where.reelId_userId.reelId}:${where.reelId_userId.userId}`;
      return likes.has(key) ? { id: `like-${key}` } : null;
    },
    async findMany({ where }: { where: { userId: string; reelId: { in: string[] } } }) {
      return where.reelId.in
        .filter((id) => likes.has(`${id}:${where.userId}`))
        .map((reelId) => ({ reelId }));
    },
    async create({ data }: { data: { reelId: string; userId: string } }) {
      likes.add(`${data.reelId}:${data.userId}`);
      return data;
    },
    async delete({ where }: { where: { reelId_userId: { reelId: string; userId: string } } }) {
      likes.delete(`${where.reelId_userId.reelId}:${where.reelId_userId.userId}`);
      return {};
    },
  };
  const commentDelegate = {
    async create({ data }: { data: { reelId: string; userId: string; content: string } }) {
      comments.push({ ...data });
      return { id: `comment-${comments.length}`, createdAt: new Date(), ...data };
    },
  };
  const tx = { reelLike: likeDelegate, reelComment: commentDelegate, reel: reelDelegate };
  const prisma = {
    user: userDelegate,
    reel: reelDelegate,
    reelLike: likeDelegate,
    reelComment: commentDelegate,
    $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>): Promise<T> => fn(tx),
  };
  const privacy = new PrivacyService(prisma as unknown as PrivacyPrismaLike);
  return {
    service: new ReelService(prisma as never, privacy),
    prisma,
    prefs,
    reels,
    likes,
    comments,
  };
}

const T = (s: number) => new Date(1_760_000_000_000 + s * 1000);

async function expectAppError(promise: Promise<unknown>, statusCode: number, code: string) {
  try {
    await promise;
  } catch (err) {
    const e = err as { statusCode?: number; code?: string };
    expect(e.statusCode).toBe(statusCode);
    expect(e.code).toBe(code);
    return;
  }
  throw new Error(`expected ${statusCode} ${code}, but the call succeeded`);
}

describe('QC-F-447 R: reel action gates', () => {
  function blockedWorld() {
    return makeReelWorld(
      new Map<string, unknown>([
        [CREATOR, prefsBlocking([ACTOR])],
        [ACTOR, null],
      ]),
      [makeReelRow('reel-1', CREATOR, T(10), 5)],
    );
  }

  it('R1 [NC] blocked actor like → 404 REEL_NOT_FOUND; no row, counter unchanged', async () => {
    const world = blockedWorld();
    await expectAppError(world.service.likeReel('reel-1', ACTOR), 404, 'REEL_NOT_FOUND');
    expect(world.likes.size).toBe(0);
    expect(world.reels.get('reel-1')!.likeCount).toBe(5);
  });

  it('R2 [NC] blocked actor comment → 404; no comment row, counter unchanged', async () => {
    const world = blockedWorld();
    await expectAppError(world.service.commentReel('reel-1', ACTOR, 'nice'), 404, 'REEL_NOT_FOUND');
    expect(world.comments).toHaveLength(0);
    expect(world.reels.get('reel-1')!.commentCount).toBe(0);
  });

  it('R3 [NC] blocked actor share (new actor signature) → 404; counter unchanged', async () => {
    const world = blockedWorld();
    await expectAppError(world.service.shareReel('reel-1', ACTOR), 404, 'REEL_NOT_FOUND');
    expect(world.reels.get('reel-1')!.shareCount).toBe(0);
  });

  it('R4 [NC] reverse direction (actor blocked creator) → like + share 404', async () => {
    const world = makeReelWorld(
      new Map<string, unknown>([
        [CREATOR, null],
        [ACTOR, prefsBlocking([CREATOR])],
      ]),
      [makeReelRow('reel-1', CREATOR, T(10), 5)],
    );
    await expectAppError(world.service.likeReel('reel-1', ACTOR), 404, 'REEL_NOT_FOUND');
    await expectAppError(world.service.shareReel('reel-1', ACTOR), 404, 'REEL_NOT_FOUND');
    expect(world.reels.get('reel-1')!.likeCount).toBe(5);
    expect(world.reels.get('reel-1')!.shareCount).toBe(0);
  });

  it('R5 [NC] creator block list malformed → 503 UPSTREAM_UNAVAILABLE, nothing written', async () => {
    const world = makeReelWorld(
      new Map<string, unknown>([
        [CREATOR, MALFORMED_PREFS],
        [ACTOR, null],
      ]),
      [makeReelRow('reel-1', CREATOR, T(10), 5)],
    );
    await expectAppError(world.service.likeReel('reel-1', ACTOR), 503, 'UPSTREAM_UNAVAILABLE');
    expect(world.likes.size).toBe(0);
    expect(world.reels.get('reel-1')!.likeCount).toBe(5);
  });

  it('R9 control: unblocked actor like/comment/share behave exactly as before', async () => {
    const world = makeReelWorld(
      new Map<string, unknown>([
        [CREATOR, null],
        [ACTOR, null],
      ]),
      [makeReelRow('reel-1', CREATOR, T(10), 5)],
    );
    const like = await world.service.likeReel('reel-1', ACTOR);
    expect(like).toEqual({ id: 'reel-1', likeCount: 6, liked: true });
    const comment = await world.service.commentReel('reel-1', ACTOR, 'nice');
    expect(comment.content).toBe('nice');
    expect(world.reels.get('reel-1')!.commentCount).toBe(1);
    const share = await world.service.shareReel('reel-1', ACTOR);
    expect(share).toEqual({ id: 'reel-1', shareCount: 1 });
  });

  it('R10 control: creator acts on their OWN reel (self-pair is clear)', async () => {
    const world = makeReelWorld(
      new Map<string, unknown>([[CREATOR, prefsBlocking([ACTOR])]]),
      [makeReelRow('reel-1', CREATOR, T(10), 5)],
    );
    const like = await world.service.likeReel('reel-1', CREATOR);
    expect(like.liked).toBe(true);
    const share = await world.service.shareReel('reel-1', CREATOR);
    expect(share.shareCount).toBe(1);
  });
});

describe('QC-F-447 R: reel feed cut + pagination', () => {
  it('R6 [NC] feed hides both block directions; totalAvailable filtered; cursor stays exact', async () => {
    const world = makeReelWorld(
      new Map<string, unknown>([
        [CREATOR, prefsBlocking([VIEWER])], // creator blocked viewer
        [CREATOR2, null],
        [VIEWER, prefsBlocking([CREATOR2])], // viewer blocked creator2
        [CLEAN, null],
      ]),
      [
        makeReelRow('r1', CLEAN, T(50)),
        makeReelRow('r2', CREATOR, T(40)),
        makeReelRow('r3', CLEAN, T(30)),
        makeReelRow('r4', CREATOR2, T(20)),
        makeReelRow('r5', CLEAN, T(10)),
      ],
    );
    const page1 = await world.service.getFeed({ userId: VIEWER, limit: 2 });
    expect(page1.reels.map((r) => r.id)).toEqual(['r1', 'r3']);
    expect(page1.hasMore).toBe(true);
    expect(page1.nextCursor).toBe('r3');
    expect(page1.totalAvailable).toBe(3);

    const page2 = await world.service.getFeed({ userId: VIEWER, limit: 2, cursor: page1.nextCursor! });
    expect(page2.reels.map((r) => r.id)).toEqual(['r5']);
    expect(page2.hasMore).toBe(false);
    expect(page2.nextCursor).toBeNull();
  });
});

describe('QC-F-447 R: spotlight route cut', () => {
  it('R7 [NC] blocked creator is cut from the viewer spotlight; total is filtered', async () => {
    const world = makeReelWorld(
      new Map<string, unknown>([
        [CREATOR, prefsBlocking([VIEWER])],
        [VIEWER, null],
        [CLEAN, null],
      ]),
      [
        makeReelRow('spot-blocked', CREATOR, T(20), 100),
        makeReelRow('spot-clean', CLEAN, T(10), 1),
      ],
    );
    const app = Fastify({ logger: false });
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', world.prisma as never);
    app.addHook('onRequest', (request, _reply, done) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: VIEWER };
      done();
    });
    await app.register(spotlightRoutes, { prefix: '/spotlight' });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/spotlight' });
    expect(res.statusCode).toBe(200);
    const data = (res.json() as { data: { reels: Array<{ id: string }>; total: number } }).data;
    expect(data.reels.map((r) => r.id)).toEqual(['spot-clean']);
    expect(data.total).toBe(1);
    await app.close();
  });
});

describe('QC-F-447 R: discover feed + trending cut', () => {
  it('R8 [NC] blocked creator reels cut from getFeed AND getTrending', async () => {
    const world = makeReelWorld(
      new Map<string, unknown>([
        [CREATOR, prefsBlocking([VIEWER])],
        [VIEWER, null],
        [CLEAN, null],
      ]),
      [
        makeReelRow('disc-blocked', CREATOR, T(20), 100),
        makeReelRow('disc-clean', CLEAN, T(10), 1),
      ],
    );
    const discoverPrisma = {
      conversation: { async findMany() { return []; } },
      conversationMember: {
        async findMany() { return []; },
        async findFirst() { return null; },
        async count() { return 0; },
      },
      message: {
        async findMany() { return []; },
        async count() { return 0; },
      },
      reel: (world.prisma as { reel: unknown }).reel,
      user: (world.prisma as { user: unknown }).user,
    };
    const discover = new DiscoverService(discoverPrisma as never);

    const feed = await discover.getFeed(VIEWER);
    expect(feed.map((i) => i.id)).toEqual(['disc-clean']);

    const trending = await discover.getTrending(VIEWER);
    expect(trending.map((i) => i.id)).toEqual(['disc-clean']);
  });
});
