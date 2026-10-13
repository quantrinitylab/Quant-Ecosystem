// ============================================================================
// QuantChat — PrivacyService (QC-F-042)
//
// The 8 privacy settings (whoCanMessage, whoCanSeeStory, whoCanSeeLocation,
// showOnlineStatus, showReadReceipts, showTypingIndicator, allowScreenshots,
// hideFromSearch) used to be WRITE-ONLY: PUT /settings persisted them into
// `User.preferences.chatSettings.privacy`, but no backend code ever read them
// back, so every toggle was a promise the product did not keep. This service
// is the single resolver every enforcement gate now goes through:
//
//   resolve(userId)      -> the user's effective prefs (stored merged over
//                           DEFAULT_PRIVACY), with a `source` telling the
//                           caller HOW the answer was derived.
//   resolveMany(ids)     -> batch form for list surfaces (search, presence).
//   isFriendOf(a, b)     -> the v1 "friend" definition (see below).
//   checkCanMessage()    -> the whoCanMessage verdict for a NEW direct chat.
//
// "Friend" (v1 — a product definition, kept in exactly one place so a real
// friendship system can replace it later): `isFriendOf(ownerId, viewerId)`
// is true when the OWNER listed the viewer as a close friend (CloseFriend
// edge userId=owner, friendId=viewer) OR owner and viewer already share an
// active DIRECT conversation (both members, leftAt null). The existing-
// conversation half is load-bearing: the defaults for whoCanMessage /
// whoCanSeeStory are 'friends', so without it, turning enforcement on would
// instantly cut off every pair who simply chat and never touched settings.
//
// Missing vs error (QC-F-042 §4 — the two are NOT the same):
//   - prefs never stored / user row without a privacy block -> 'default':
//     DEFAULT_PRIVACY applies. That is the product's declared behaviour (it
//     is exactly what GET /settings shows), not a fail-open.
//   - the privacy block is present but malformed -> 'error' with
//     MOST_RESTRICTIVE_PRIVACY (never wider than the defaults): a leak
//     (presence, location, receipts, search visibility) fails closed, and
//     the one ACTION surface (starting a conversation) answers 503 via
//     checkCanMessage's 'unavailable' instead of a lying 403 or a silent
//     allow.
//   - user row does not exist (or no user delegate is wired, e.g. a minimal
//     test harness) -> 'missing': prefs = DEFAULT_PRIVACY, and action gates
//     treat the target as outside this fix's scope (the pre-existing
//     behaviour for nonexistent targets is unchanged).
//
// Cache: resolved prefs are cached in-process for 30s. Presence/typing are
// hot paths — a DB read per frame is not viable — and a pref change taking
// effect within ≤30s is the honest claim (never "instantly"). PUT /settings
// invalidates its own user's entry immediately on the shared instance (see
// getPrivacyService), so the common single-process case IS instant; other
// processes converge within the TTL. Errors are never cached.
// ============================================================================

/** The 8 privacy fields, exactly as stored under preferences.chatSettings.privacy. */
export interface PrivacyPrefs {
  whoCanMessage: 'everyone' | 'friends' | 'nobody';
  whoCanSeeStory: 'everyone' | 'friends' | 'custom';
  whoCanSeeLocation: 'friends' | 'nobody' | 'ghost';
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
  showTypingIndicator: boolean;
  allowScreenshots: boolean;
  hideFromSearch: boolean;
}

/**
 * Declared defaults — the single definition. routes/settings.ts imports
 * this (it previously defined it locally) so the values the settings UI
 * shows and the values enforcement applies can never drift apart.
 */
export const DEFAULT_PRIVACY: PrivacyPrefs = {
  whoCanMessage: 'friends',
  whoCanSeeStory: 'friends',
  whoCanSeeLocation: 'friends',
  showOnlineStatus: true,
  showReadReceipts: true,
  showTypingIndicator: true,
  allowScreenshots: false,
  hideFromSearch: false,
};

/**
 * Most-restrictive form, applied when stored prefs cannot be trusted
 * (malformed block or a failed read). Per QC-F-042 §4: every leak surface
 * closes; allowScreenshots stays false because for that field false is the
 * protective value (it means "notify the author about screenshots");
 * whoCanSeeStory stays 'friends' (never 'everyone'); whoCanMessage's value
 * here is never used to allow — checkCanMessage maps source 'error' to
 * 'unavailable' (503) before looking at the value.
 */
export const MOST_RESTRICTIVE_PRIVACY: PrivacyPrefs = {
  whoCanMessage: 'friends',
  whoCanSeeStory: 'friends',
  whoCanSeeLocation: 'nobody',
  showOnlineStatus: false,
  showReadReceipts: false,
  showTypingIndicator: false,
  allowScreenshots: false,
  hideFromSearch: true,
};

export type PrivacySource = 'stored' | 'default' | 'missing' | 'error';

export interface ResolvedPrivacy {
  prefs: PrivacyPrefs;
  source: PrivacySource;
}

/** Minimal structural Prisma surface this service needs (fake-prisma testable). */
export interface PrivacyPrismaLike {
  user?: {
    findUnique?: (args: unknown) => Promise<{ preferences: unknown } | null>;
    findMany?: (
      args: unknown,
    ) => Promise<Array<{ id: string; preferences: unknown }>>;
  };
  closeFriend?: {
    findMany: (args: unknown) => Promise<Array<{ userId: string }>>;
  };
  conversationMember?: {
    findMany: (
      args: unknown,
    ) => Promise<Array<{ conversationId: string; userId?: string }>>;
  };
  conversation?: {
    findMany: (args: unknown) => Promise<Array<{ id: string }>>;
  };
}

const WHO_CAN_MESSAGE = ['everyone', 'friends', 'nobody'] as const;
const WHO_CAN_SEE_STORY = ['everyone', 'friends', 'custom'] as const;
const WHO_CAN_SEE_LOCATION = ['friends', 'nobody', 'ghost'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Per-field pickers for a PRESENT privacy block (QC-F-042 amend, PR #956
 * review gap 4). A field that is ABSENT (`undefined`) keeps the declared
 * default — stored prefs are merged over DEFAULT_PRIVACY, so a user who
 * only ever set one toggle must not have the other seven silently flipped.
 * A field that is PRESENT but malformed (wrong type / unknown enum) is a
 * different signal: the stored value cannot be trusted, so it resolves to
 * the MOST_RESTRICTIVE value for that field — never the permissive
 * default. The earlier behaviour (malformed → default) failed OPEN:
 * `showOnlineStatus: "false"` (a string) resolved to `true` and exposed
 * the user's presence.
 */
function pickEnumStored<T extends string>(
  value: unknown,
  allowed: readonly T[],
  defaultValue: T,
  restrictiveValue: T,
): T {
  if (value === undefined) return defaultValue;
  return pickEnum(value, allowed, restrictiveValue);
}

function pickBoolStored(
  value: unknown,
  defaultValue: boolean,
  restrictiveValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  return pickBool(value, restrictiveValue);
}

/**
 * Extract effective privacy prefs from a raw `User.preferences` value.
 * Pure and exported so read paths that already hold the user row (e.g.
 * LocationService.getFriendsOnMap) can apply the same semantics without an
 * extra query. A present-but-malformed privacy block is an 'error'
 * (most-restrictive); an absent block is 'default'. Within a well-formed
 * block, an individually malformed FIELD resolves to that field's
 * most-restrictive value while the source stays 'stored' (amend gap 4);
 * only a genuinely absent field falls back to the declared default.
 */
export function extractPrivacyPrefs(preferences: unknown): ResolvedPrivacy {
  if (!isPlainObject(preferences)) {
    return preferences == null
      ? { prefs: { ...DEFAULT_PRIVACY }, source: 'default' }
      : { prefs: { ...MOST_RESTRICTIVE_PRIVACY }, source: 'error' };
  }
  const chat = preferences['chatSettings'];
  if (chat == null) return { prefs: { ...DEFAULT_PRIVACY }, source: 'default' };
  if (!isPlainObject(chat)) {
    return { prefs: { ...MOST_RESTRICTIVE_PRIVACY }, source: 'error' };
  }
  const privacy = chat['privacy'];
  if (privacy == null) return { prefs: { ...DEFAULT_PRIVACY }, source: 'default' };
  if (!isPlainObject(privacy)) {
    return { prefs: { ...MOST_RESTRICTIVE_PRIVACY }, source: 'error' };
  }
  return {
    source: 'stored',
    prefs: {
      whoCanMessage: pickEnumStored(privacy['whoCanMessage'], WHO_CAN_MESSAGE, DEFAULT_PRIVACY.whoCanMessage, MOST_RESTRICTIVE_PRIVACY.whoCanMessage),
      whoCanSeeStory: pickEnumStored(privacy['whoCanSeeStory'], WHO_CAN_SEE_STORY, DEFAULT_PRIVACY.whoCanSeeStory, MOST_RESTRICTIVE_PRIVACY.whoCanSeeStory),
      whoCanSeeLocation: pickEnumStored(privacy['whoCanSeeLocation'], WHO_CAN_SEE_LOCATION, DEFAULT_PRIVACY.whoCanSeeLocation, MOST_RESTRICTIVE_PRIVACY.whoCanSeeLocation),
      showOnlineStatus: pickBoolStored(privacy['showOnlineStatus'], DEFAULT_PRIVACY.showOnlineStatus, MOST_RESTRICTIVE_PRIVACY.showOnlineStatus),
      showReadReceipts: pickBoolStored(privacy['showReadReceipts'], DEFAULT_PRIVACY.showReadReceipts, MOST_RESTRICTIVE_PRIVACY.showReadReceipts),
      showTypingIndicator: pickBoolStored(privacy['showTypingIndicator'], DEFAULT_PRIVACY.showTypingIndicator, MOST_RESTRICTIVE_PRIVACY.showTypingIndicator),
      allowScreenshots: pickBoolStored(privacy['allowScreenshots'], DEFAULT_PRIVACY.allowScreenshots, MOST_RESTRICTIVE_PRIVACY.allowScreenshots),
      hideFromSearch: pickBoolStored(privacy['hideFromSearch'], DEFAULT_PRIVACY.hideFromSearch, MOST_RESTRICTIVE_PRIVACY.hideFromSearch),
    },
  };
}

/**
 * Extract the blocked-user ids from a raw `User.preferences` value
 * (QC-F-218). The block list lives at `chatSettings.blockedUsers`, SIBLING
 * of the `privacy` block above — it is a per-person list, not one of the 8
 * category prefs. Canonical entries are objects (`{id, name, username,
 * blockedAt}` — the settings UI's BlockedUser shape, and the shape the
 * DELETE /settings/blocked/:userId filter matches on); bare string entries
 * are accepted defensively because the column is free-form JSON written by
 * more than one client generation.
 *
 * Returns `null` when the stored value is MALFORMED (present but not the
 * shape above): a block list that cannot be read must not silently read as
 * "nobody blocked" on an action surface. An absent list (no prefs stored,
 * no chatSettings, no blockedUsers key) is a readable empty list — that is
 * the 'default' analogue, not an error.
 */
export function extractBlockedUserIds(preferences: unknown): string[] | null {
  if (preferences == null) return [];
  if (!isPlainObject(preferences)) return null;
  const chat = preferences['chatSettings'];
  if (chat == null) return [];
  if (!isPlainObject(chat)) return null;
  const blocked = chat['blockedUsers'];
  if (blocked == null) return [];
  if (!Array.isArray(blocked)) return null;
  const ids: string[] = [];
  for (const entry of blocked) {
    if (typeof entry === 'string' && entry) {
      ids.push(entry);
    } else if (isPlainObject(entry) && typeof entry['id'] === 'string' && entry['id']) {
      ids.push(entry['id']);
    }
    // Any other entry shape can never equal a userId (the DELETE filter
    // treats entries the same way), so it is ignored rather than fatal.
  }
  return ids;
}

export type BlockedVerdict = 'blocked' | 'clear' | 'unavailable';

export type CanMessageVerdict = 'allowed' | 'denied' | 'unavailable' | 'missing-target';

const CACHE_TTL_MS = 30_000;

export class PrivacyService {
  private readonly cache = new Map<
    string,
    { resolved: ResolvedPrivacy; at: number }
  >();

  constructor(
    private readonly prisma: PrivacyPrismaLike,
    private readonly cacheTtlMs: number = CACHE_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Drop one user's cached prefs (PUT /settings calls this after a save). */
  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  private cached(userId: string): ResolvedPrivacy | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;
    if (this.now() - entry.at > this.cacheTtlMs) {
      this.cache.delete(userId);
      return null;
    }
    return entry.resolved;
  }

  private store(userId: string, resolved: ResolvedPrivacy): ResolvedPrivacy {
    // Errors are never cached: a transient DB failure must not pin the
    // most-restrictive form (or anything else) for the whole TTL.
    if (resolved.source !== 'error') {
      this.cache.set(userId, { resolved, at: this.now() });
    }
    return resolved;
  }

  /** Resolve one user's effective privacy prefs. Never throws. */
  async resolve(userId: string): Promise<ResolvedPrivacy> {
    const hit = this.cached(userId);
    if (hit) return hit;

    const findUnique = this.prisma.user?.findUnique;
    if (typeof findUnique !== 'function') {
      // No prefs store wired (minimal harness): nothing to enforce against.
      return this.store(userId, {
        prefs: { ...DEFAULT_PRIVACY },
        source: 'missing',
      });
    }

    try {
      const row = await findUnique.call(this.prisma.user, {
        where: { id: userId },
        select: { preferences: true },
      });
      if (!row) {
        return this.store(userId, {
          prefs: { ...DEFAULT_PRIVACY },
          source: 'missing',
        });
      }
      return this.store(userId, extractPrivacyPrefs(row.preferences));
    } catch {
      return { prefs: { ...MOST_RESTRICTIVE_PRIVACY }, source: 'error' };
    }
  }

  /** Batch resolve for list surfaces. Never throws; per-id fail-closed. */
  async resolveMany(userIds: string[]): Promise<Map<string, ResolvedPrivacy>> {
    const result = new Map<string, ResolvedPrivacy>();
    const pending: string[] = [];
    for (const id of [...new Set(userIds)]) {
      const hit = this.cached(id);
      if (hit) result.set(id, hit);
      else pending.push(id);
    }
    if (pending.length === 0) return result;

    const findMany = this.prisma.user?.findMany;
    if (typeof findMany !== 'function') {
      for (const id of pending) {
        result.set(id, await this.resolve(id));
      }
      return result;
    }

    try {
      const rows = await findMany.call(this.prisma.user, {
        where: { id: { in: pending } },
        select: { id: true, preferences: true },
      });
      const byId = new Map(rows.map((r) => [r.id, r.preferences]));
      for (const id of pending) {
        if (!byId.has(id)) {
          result.set(
            id,
            this.store(id, { prefs: { ...DEFAULT_PRIVACY }, source: 'missing' }),
          );
        } else {
          result.set(id, this.store(id, extractPrivacyPrefs(byId.get(id))));
        }
      }
    } catch {
      for (const id of pending) {
        result.set(id, { prefs: { ...MOST_RESTRICTIVE_PRIVACY }, source: 'error' });
      }
    }
    return result;
  }

  /**
   * v1 "friend" test, owner direction: owner listed viewer as a close
   * friend, OR they share an active DIRECT conversation. Fail-closed:
   * any read failure answers false (this only ever narrows access).
   */
  async isFriendOf(ownerId: string, viewerId: string): Promise<boolean> {
    if (ownerId === viewerId) return true;
    try {
      const edges = (await this.prisma.closeFriend?.findMany({
        where: { userId: ownerId, friendId: viewerId },
        select: { userId: true },
      })) ?? [];
      if (edges.length > 0) return true;
    } catch {
      return false;
    }

    try {
      const viewerMemberships = (await this.prisma.conversationMember?.findMany({
        where: { userId: viewerId, leftAt: null },
        select: { conversationId: true },
      })) ?? [];
      const conversationIds = viewerMemberships.map((m) => m.conversationId);
      if (conversationIds.length === 0) return false;
      const ownerMemberships = (await this.prisma.conversationMember?.findMany({
        where: {
          conversationId: { in: conversationIds },
          userId: ownerId,
          leftAt: null,
        },
        select: { conversationId: true, userId: true },
      })) ?? [];
      if (ownerMemberships.length === 0) return false;
      const direct = (await this.prisma.conversation?.findMany({
        where: {
          id: { in: [...new Set(ownerMemberships.map((m) => m.conversationId))] },
          type: 'DIRECT',
        },
        select: { id: true },
      })) ?? [];
      return direct.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Block verdict (QC-F-218): has `ownerId` blocked `candidateId`?
   * Deliberately NOT cached (unlike resolve()): call initiation is not a
   * hot path, and a block must take effect on the next call attempt, not
   * within a TTL window. Never throws. Fail-closed on an action surface,
   * mirroring checkCanMessage's §4 semantics:
   *   - owner row missing -> 'clear': the block list lives ON that row, so
   *     a missing row means no list exists anywhere (the 'missing'
   *     analogue) — there is nothing that could contain candidateId.
   *   - no user delegate wired, malformed stored prefs, or a failed read
   *     -> 'unavailable': the caller (an action gate) must answer 503
   *     rather than silently allow a possibly-blocked action.
   */
  async checkBlockedBy(ownerId: string, candidateId: string): Promise<BlockedVerdict> {
    if (ownerId === candidateId) return 'clear';
    const findUnique = this.prisma.user?.findUnique;
    if (typeof findUnique !== 'function') return 'unavailable';
    try {
      const row = await findUnique.call(this.prisma.user, {
        where: { id: ownerId },
        select: { preferences: true },
      });
      if (!row) return 'clear';
      const ids = extractBlockedUserIds(row.preferences);
      if (ids === null) return 'unavailable';
      return ids.includes(candidateId) ? 'blocked' : 'clear';
    } catch {
      return 'unavailable';
    }
  }

  /**
   * whoCanMessage verdict for starting a NEW direct conversation with
   * `targetId`. Existing conversations are never gated by this (the toggle
   * guards initiation only — membership remains the authority inside a
   * conversation that already exists).
   */
  async checkCanMessage(
    creatorId: string,
    targetId: string,
  ): Promise<CanMessageVerdict> {
    const { prefs, source } = await this.resolve(targetId);
    if (source === 'missing') return 'missing-target';
    if (source === 'error') return 'unavailable';
    switch (prefs.whoCanMessage) {
      case 'everyone':
        return 'allowed';
      case 'nobody':
        return 'denied';
      case 'friends':
        return (await this.isFriendOf(targetId, creatorId)) ? 'allowed' : 'denied';
    }
  }
}

/**
 * One PrivacyService per Prisma client, process-wide (WeakMap-keyed), so
 * every gate in the process shares ONE cache and PUT /settings invalidation
 * actually reaches the gates. Tests that need isolation construct
 * `new PrivacyService(fake)` directly.
 */
const sharedInstances = new WeakMap<object, PrivacyService>();

export function getPrivacyService(prisma: unknown): PrivacyService {
  const key = (prisma ?? {}) as object;
  let instance = sharedInstances.get(key);
  if (!instance) {
    instance = new PrivacyService(prisma as PrivacyPrismaLike);
    sharedInstances.set(key, instance);
  }
  return instance;
}
