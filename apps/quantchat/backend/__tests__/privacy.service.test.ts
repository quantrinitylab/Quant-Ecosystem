// ============================================================================
// QC-F-042 — PrivacyService unit tests
//
// The 8 privacy settings were write-only: PUT /settings persisted them but
// nothing in the backend ever read them. PrivacyService is the single
// resolver the new enforcement gates share. These tests pin:
//   - stored prefs merge over DEFAULT_PRIVACY (what GET /settings shows is
//     what enforcement applies);
//   - missing prefs -> defaults ('default'), missing user -> 'missing';
//   - malformed prefs / read errors -> MOST_RESTRICTIVE ('error'), never
//     cached, never wider than the defaults;
//   - the 30s cache + invalidate() contract (PUT /settings relies on it);
//   - isFriendOf v1: owner-direction close-friend edge OR an active DIRECT
//     conversation; a GROUP conversation never counts; failures fail closed;
//   - checkCanMessage verdicts incl. the defaults pin: a user who never
//     stored prefs has whoCanMessage 'friends', so a stranger is DENIED —
//     "no prefs" must never silently mean "everyone".
//
// Negative control: PrivacyService does not exist in the pre-fix code, so
// this suite cannot even load there; the enforcement suite
// (qc-f-042-privacy-enforcement.test.ts) carries the per-gate controls.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import {
  PrivacyService,
  extractPrivacyPrefs,
  extractBlockedUserIds,
  DEFAULT_PRIVACY,
  MOST_RESTRICTIVE_PRIVACY,
  type PrivacyPrismaLike,
} from '../services/privacy.service';

// Stable identities (module-level).
const OWNER = 'user_owner';
const STRANGER = 'user_stranger';
const CLOSE_FRIEND = 'user_close_friend';
const CHAT_PARTNER = 'user_chat_partner';
const GROUP_ONLY = 'user_group_only';

function prefs(privacy: Record<string, unknown>) {
  return { chatSettings: { privacy } };
}

interface FakeOptions {
  users?: Map<string, { preferences: unknown } | null>;
  closeFriendEdges?: Array<{ userId: string; friendId: string }>;
  conversations?: Array<{ id: string; type: string }>;
  members?: Array<{ conversationId: string; userId: string; leftAt: Date | null }>;
  throwOnUserRead?: boolean;
}

function makeFakePrisma(opts: FakeOptions = {}) {
  const users = opts.users ?? new Map<string, { preferences: unknown } | null>();
  const edges = opts.closeFriendEdges ?? [];
  const conversations = opts.conversations ?? [];
  const members = opts.members ?? [];

  const prisma: PrivacyPrismaLike & {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
  } = {
    user: {
      findUnique: vi.fn(async (args: unknown) => {
        if (opts.throwOnUserRead) throw new Error('db down');
        const id = (args as { where: { id: string } }).where.id;
        return users.has(id) ? users.get(id) ?? null : null;
      }),
      findMany: vi.fn(async (args: unknown) => {
        if (opts.throwOnUserRead) throw new Error('db down');
        const ids = (args as { where: { id: { in: string[] } } }).where.id.in;
        return ids
          .filter((id) => users.get(id))
          .map((id) => ({ id, preferences: users.get(id)!.preferences }));
      }),
    },
    closeFriend: {
      findMany: vi.fn(async (args: unknown) => {
        const where = (args as { where: { userId: string; friendId: string } }).where;
        return edges
          .filter((e) => e.userId === where.userId && e.friendId === where.friendId)
          .map((e) => ({ userId: e.userId }));
      }),
    },
    conversationMember: {
      findMany: vi.fn(async (args: unknown) => {
        const where = (
          args as {
            where: {
              userId: string;
              conversationId?: { in: string[] };
            };
          }
        ).where;
        return members
          .filter((m) => m.leftAt === null)
          .filter((m) => m.userId === where.userId)
          .filter(
            (m) =>
              !where.conversationId || where.conversationId.in.includes(m.conversationId),
          )
          .map((m) => ({ conversationId: m.conversationId, userId: m.userId }));
      }),
    },
    conversation: {
      findMany: vi.fn(async (args: unknown) => {
        const where = (
          args as { where: { id: { in: string[] }; type: string } }
        ).where;
        return conversations
          .filter((c) => where.id.in.includes(c.id) && c.type === where.type)
          .map((c) => ({ id: c.id }));
      }),
    },
  };
  return prisma;
}

describe('PrivacyService.resolve', () => {
  it('merges stored prefs over the defaults', async () => {
    const prisma = makeFakePrisma({
      users: new Map([
        [OWNER, { preferences: prefs({ showOnlineStatus: false, hideFromSearch: true }) }],
      ]),
    });
    const svc = new PrivacyService(prisma);
    const { prefs: p, source } = await svc.resolve(OWNER);
    expect(source).toBe('stored');
    expect(p.showOnlineStatus).toBe(false);
    expect(p.hideFromSearch).toBe(true);
    // Untouched fields take the declared defaults.
    expect(p.whoCanMessage).toBe('friends');
    expect(p.showReadReceipts).toBe(true);
  });

  it('applies DEFAULT_PRIVACY when the user never stored prefs', async () => {
    const prisma = makeFakePrisma({
      users: new Map([[OWNER, { preferences: null }]]),
    });
    const svc = new PrivacyService(prisma);
    const { prefs: p, source } = await svc.resolve(OWNER);
    expect(source).toBe('default');
    expect(p).toEqual(DEFAULT_PRIVACY);
  });

  it('reports a missing user row as missing (defaults, no gate invention)', async () => {
    const svc = new PrivacyService(makeFakePrisma());
    const { prefs: p, source } = await svc.resolve('user_ghost');
    expect(source).toBe('missing');
    expect(p).toEqual(DEFAULT_PRIVACY);
  });

  it('resolves most-restrictive on malformed stored prefs', async () => {
    const prisma = makeFakePrisma({
      users: new Map([[OWNER, { preferences: { chatSettings: { privacy: 'yes' } } }]]),
    });
    const svc = new PrivacyService(prisma);
    const { prefs: p, source } = await svc.resolve(OWNER);
    expect(source).toBe('error');
    expect(p).toEqual(MOST_RESTRICTIVE_PRIVACY);
    expect(p.showOnlineStatus).toBe(false);
    expect(p.hideFromSearch).toBe(true);
    expect(p.whoCanSeeLocation).toBe('nobody');
    // The protective direction for screenshots is false (notify the author).
    expect(p.allowScreenshots).toBe(false);
    // Never wider than defaults on error.
    expect(p.whoCanSeeStory).toBe('friends');
  });

  it('resolves most-restrictive when the read throws, and does not cache the error', async () => {
    const prisma = makeFakePrisma({ throwOnUserRead: true });
    const svc = new PrivacyService(prisma);
    const first = await svc.resolve(OWNER);
    expect(first.source).toBe('error');
    expect(first.prefs).toEqual(MOST_RESTRICTIVE_PRIVACY);
    await svc.resolve(OWNER);
    // Error was not cached: the store was consulted again.
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it('caches within the TTL and invalidate() forces a fresh read', async () => {
    let now = 1_000_000;
    const prisma = makeFakePrisma({
      users: new Map([[OWNER, { preferences: prefs({ showOnlineStatus: false }) }]]),
    });
    const svc = new PrivacyService(prisma, 30_000, () => now);

    await svc.resolve(OWNER);
    await svc.resolve(OWNER);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    // Still inside the TTL: the honest ≤30s staleness window.
    now += 29_000;
    await svc.resolve(OWNER);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);

    // Past the TTL the new value is read.
    now += 2_000;
    await svc.resolve(OWNER);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);

    // invalidate() (what PUT /settings calls) applies immediately.
    svc.invalidate(OWNER);
    await svc.resolve(OWNER);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(3);
  });
});

describe('extractPrivacyPrefs', () => {
  it('resolves an individually malformed field fail-closed, absent fields keep defaults (amend gap 4)', () => {
    // PR #956 review gap 4: the previous per-field fallback to
    // DEFAULT_PRIVACY failed open — `showOnlineStatus: 'yes'` (a string)
    // resolved to `true` and exposed presence. A PRESENT-but-malformed
    // field now takes its most-restrictive value; the block's source stays
    // 'stored' (the block itself is well-formed).
    const { prefs: p, source } = extractPrivacyPrefs(
      prefs({ whoCanMessage: 'aliens', showOnlineStatus: 'yes' }),
    );
    expect(source).toBe('stored');
    expect(p.whoCanMessage).toBe('friends');
    expect(p.showOnlineStatus).toBe(false);
    // Genuinely ABSENT fields still merge over the declared defaults —
    // setting one toggle must not silently flip the other seven.
    expect(p.whoCanSeeLocation).toBe('friends');
    expect(p.showReadReceipts).toBe(true);
    expect(p.hideFromSearch).toBe(false);
  });

  it('resolves every malformed field to its most-restrictive value (amend gap 4)', () => {
    const { prefs: p, source } = extractPrivacyPrefs(
      prefs({
        whoCanSeeLocation: 'everyone',
        showReadReceipts: 'false',
        showTypingIndicator: 1,
        hideFromSearch: 'true',
      }),
    );
    expect(source).toBe('stored');
    expect(p.whoCanSeeLocation).toBe('nobody');
    expect(p.showReadReceipts).toBe(false);
    expect(p.showTypingIndicator).toBe(false);
    expect(p.hideFromSearch).toBe(true);
  });

  it('treats a non-object preferences blob as an error, null as default', () => {
    expect(extractPrivacyPrefs('garbage').source).toBe('error');
    expect(extractPrivacyPrefs(null).source).toBe('default');
    expect(extractPrivacyPrefs(undefined).source).toBe('default');
  });
});

describe('PrivacyService.resolveMany', () => {
  it('batch-resolves stored, default, and missing users', async () => {
    const prisma = makeFakePrisma({
      users: new Map<string, { preferences: unknown } | null>([
        [OWNER, { preferences: prefs({ hideFromSearch: true }) }],
        [STRANGER, { preferences: null }],
      ]),
    });
    const svc = new PrivacyService(prisma);
    const map = await svc.resolveMany([OWNER, STRANGER, 'user_ghost']);
    expect(map.get(OWNER)?.prefs.hideFromSearch).toBe(true);
    expect(map.get(STRANGER)?.source).toBe('default');
    expect(map.get('user_ghost')?.source).toBe('missing');
  });

  it('fails closed per user when the batch read throws', async () => {
    const svc = new PrivacyService(makeFakePrisma({ throwOnUserRead: true }));
    const map = await svc.resolveMany([OWNER]);
    expect(map.get(OWNER)?.source).toBe('error');
    expect(map.get(OWNER)?.prefs.showOnlineStatus).toBe(false);
  });
});

describe('PrivacyService.isFriendOf (v1 definition)', () => {
  const base = {
    users: new Map<string, { preferences: unknown } | null>(),
    closeFriendEdges: [{ userId: OWNER, friendId: CLOSE_FRIEND }],
    conversations: [
      { id: 'conv-dm', type: 'DIRECT' },
      { id: 'conv-group', type: 'GROUP' },
    ],
    members: [
      { conversationId: 'conv-dm', userId: OWNER, leftAt: null },
      { conversationId: 'conv-dm', userId: CHAT_PARTNER, leftAt: null },
      { conversationId: 'conv-group', userId: OWNER, leftAt: null },
      { conversationId: 'conv-group', userId: GROUP_ONLY, leftAt: null },
    ],
  };

  it('is true for an owner-direction close-friend edge', async () => {
    const svc = new PrivacyService(makeFakePrisma(base));
    await expect(svc.isFriendOf(OWNER, CLOSE_FRIEND)).resolves.toBe(true);
  });

  it('is true when owner and viewer share an active DIRECT conversation', async () => {
    const svc = new PrivacyService(makeFakePrisma(base));
    await expect(svc.isFriendOf(OWNER, CHAT_PARTNER)).resolves.toBe(true);
  });

  it('is false for a GROUP-only relationship and for strangers', async () => {
    const svc = new PrivacyService(makeFakePrisma(base));
    await expect(svc.isFriendOf(OWNER, GROUP_ONLY)).resolves.toBe(false);
    await expect(svc.isFriendOf(OWNER, STRANGER)).resolves.toBe(false);
  });

  it('is directional: the viewer listing the owner is not enough', async () => {
    const svc = new PrivacyService(
      makeFakePrisma({
        closeFriendEdges: [{ userId: STRANGER, friendId: OWNER }],
      }),
    );
    await expect(svc.isFriendOf(OWNER, STRANGER)).resolves.toBe(false);
  });
});

describe('PrivacyService.checkCanMessage', () => {
  function svcFor(targetPrefs: unknown, extra: FakeOptions = {}) {
    return new PrivacyService(
      makeFakePrisma({
        users: new Map([[OWNER, { preferences: targetPrefs }]]),
        ...extra,
      }),
    );
  }

  it("allows a stranger when the target chose 'everyone'", async () => {
    await expect(
      svcFor(prefs({ whoCanMessage: 'everyone' })).checkCanMessage(STRANGER, OWNER),
    ).resolves.toBe('allowed');
  });

  it("denies everyone when the target chose 'nobody' — even close friends", async () => {
    const svc = svcFor(prefs({ whoCanMessage: 'nobody' }), {
      closeFriendEdges: [{ userId: OWNER, friendId: CLOSE_FRIEND }],
    });
    await expect(svc.checkCanMessage(CLOSE_FRIEND, OWNER)).resolves.toBe('denied');
    await expect(svc.checkCanMessage(STRANGER, OWNER)).resolves.toBe('denied');
  });

  it("with 'friends', allows close friends and chat partners, denies strangers", async () => {
    const svc = svcFor(prefs({ whoCanMessage: 'friends' }), {
      closeFriendEdges: [{ userId: OWNER, friendId: CLOSE_FRIEND }],
      conversations: [{ id: 'conv-dm', type: 'DIRECT' }],
      members: [
        { conversationId: 'conv-dm', userId: OWNER, leftAt: null },
        { conversationId: 'conv-dm', userId: CHAT_PARTNER, leftAt: null },
      ],
    });
    await expect(svc.checkCanMessage(CLOSE_FRIEND, OWNER)).resolves.toBe('allowed');
    await expect(svc.checkCanMessage(CHAT_PARTNER, OWNER)).resolves.toBe('allowed');
    await expect(svc.checkCanMessage(STRANGER, OWNER)).resolves.toBe('denied');
  });

  it('pins the defaults: never-stored prefs mean friends — a stranger is denied', async () => {
    // This is the load-bearing default: whoCanMessage defaults to 'friends',
    // so "the user never opened settings" must NOT behave as 'everyone'.
    await expect(svcFor(null).checkCanMessage(STRANGER, OWNER)).resolves.toBe('denied');
  });

  it('answers unavailable (not a fabricated denial) on a prefs read error', async () => {
    const svc = new PrivacyService(makeFakePrisma({ throwOnUserRead: true }));
    await expect(svc.checkCanMessage(STRANGER, OWNER)).resolves.toBe('unavailable');
  });

  it('answers missing-target for a nonexistent user (gate does not invent a refusal)', async () => {
    const svc = new PrivacyService(makeFakePrisma());
    await expect(svc.checkCanMessage(STRANGER, 'user_ghost')).resolves.toBe(
      'missing-target',
    );
  });
});

describe('extractBlockedUserIds (QC-F-218)', () => {
  it('returns [] when nothing was ever stored', () => {
    expect(extractBlockedUserIds(null)).toEqual([]);
    expect(extractBlockedUserIds(undefined)).toEqual([]);
    expect(extractBlockedUserIds({})).toEqual([]);
    expect(extractBlockedUserIds({ chatSettings: {} })).toEqual([]);
    expect(extractBlockedUserIds({ chatSettings: { blockedUsers: [] } })).toEqual([]);
  });

  it('reads the canonical object-form entries ({id, ...})', () => {
    const preferences = {
      chatSettings: {
        blockedUsers: [
          { id: 'user_a', name: 'A', username: 'a', blockedAt: '2026-10-01T00:00:00.000Z' },
          { id: 'user_b' },
        ],
      },
    };
    expect(extractBlockedUserIds(preferences)).toEqual(['user_a', 'user_b']);
  });

  it('accepts bare string entries defensively and ignores unmatchable shapes', () => {
    const preferences = {
      chatSettings: { blockedUsers: ['user_a', { id: 'user_b' }, { name: 'no-id' }, 42, null] },
    };
    expect(extractBlockedUserIds(preferences)).toEqual(['user_a', 'user_b']);
  });

  it('returns null (malformed) instead of a lying empty list', () => {
    expect(extractBlockedUserIds('not-an-object')).toBeNull();
    expect(extractBlockedUserIds({ chatSettings: 'nope' })).toBeNull();
    expect(extractBlockedUserIds({ chatSettings: { blockedUsers: 'user_a' } })).toBeNull();
  });
});

describe('checkBlockedBy (QC-F-218)', () => {
  const blockedPrefs = {
    chatSettings: { blockedUsers: [{ id: STRANGER }] },
  };

  it('answers blocked when the owner blocked the candidate', async () => {
    const svc = new PrivacyService(
      makeFakePrisma({ users: new Map([[OWNER, { preferences: blockedPrefs }]]) }),
    );
    await expect(svc.checkBlockedBy(OWNER, STRANGER)).resolves.toBe('blocked');
  });

  it('answers clear when the candidate is not on the list', async () => {
    const svc = new PrivacyService(
      makeFakePrisma({ users: new Map([[OWNER, { preferences: blockedPrefs }]]) }),
    );
    await expect(svc.checkBlockedBy(OWNER, CHAT_PARTNER)).resolves.toBe('clear');
  });

  it('answers clear for a missing owner row (the list lives on that row)', async () => {
    const svc = new PrivacyService(makeFakePrisma());
    await expect(svc.checkBlockedBy('user_ghost', STRANGER)).resolves.toBe('clear');
  });

  it('answers clear for a self-check', async () => {
    const svc = new PrivacyService(
      makeFakePrisma({ users: new Map([[OWNER, { preferences: blockedPrefs }]]) }),
    );
    await expect(svc.checkBlockedBy(OWNER, OWNER)).resolves.toBe('clear');
  });

  it('answers unavailable on a prefs read error (action gates fail closed)', async () => {
    const svc = new PrivacyService(makeFakePrisma({ throwOnUserRead: true }));
    await expect(svc.checkBlockedBy(OWNER, STRANGER)).resolves.toBe('unavailable');
  });

  it('answers unavailable when no user delegate is wired', async () => {
    const svc = new PrivacyService({});
    await expect(svc.checkBlockedBy(OWNER, STRANGER)).resolves.toBe('unavailable');
  });

  it('answers unavailable when stored prefs are malformed', async () => {
    const svc = new PrivacyService(
      makeFakePrisma({ users: new Map([[OWNER, { preferences: 'garbage' }]]) }),
    );
    await expect(svc.checkBlockedBy(OWNER, STRANGER)).resolves.toBe('unavailable');
  });
});
