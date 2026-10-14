/**
 * Per-person reply-draft persistence for ThreadComposer.
 *
 * Finding qm-threadcomposer-draft-persist: the DESIGN-LOCKED default
 * person-thread reply surface used to wipe a typed reply on person switch
 * (a useEffect on conversation.personKey did setBody('') with zero
 * persistence). Drafts now survive navigation WhatsApp-style: each person's
 * unsent reply — body plus the new-topic subject state — is kept under a
 * per-person localStorage key, restored when the user returns, and cleared
 * when the reply actually sends.
 *
 * P0 qm-draft-privacy-isolation (CODEX-REVIEW on PR #1123, rework
 * CODEX-REVIEW 6157628718 on PR #1133): the original namespace keyed drafts
 * by `personKey` alone, and logout only cleared the in-memory access token —
 * so account B on the same browser could restore account A's unsent
 * body/subject for the same person. The v1 rework scoped by normalized
 * email; CODEX rejected it because email is mutable/reassignable (address
 * change + reassignment hands A's retained plaintext to B) and because the
 * raw `account + "." + personKey` concatenation is not injective (both
 * segments may contain dots). The v3 namespace below fixes both:
 *
 * - The account segment is the backend-verified IMMUTABLE user id
 *   (`AuthUser.id`, the access-token `sub` / DB primary key), never email.
 *   An address change keeps the account's drafts; a reassigned address
 *   cannot inherit them.
 * - The tenant slot is the product's fixed single-tenant scope. QuantMail
 *   has no workspace/tenant dimension — enforced contract, published here
 *   instead of silently omitted (per CODEX):
 *     * GET /oauth/userinfo (apps/quantmail/backend/routes/oauth.ts) returns
 *       { id, email, username, displayName, role, phoneNumber, phoneVerified }
 *       — no tenant field;
 *     * the access token carries `sub` = immutable user id with no tenant
 *       claim (packages/auth/src/services/token-service.ts);
 *     * middleware/workspace-tenant.ts belongs to the ERPGo company/agent
 *       modules, not QuantMail auth, and the DAV "tenant boundary isolation"
 *       is a CalDAV/CardDAV Basic-Auth realm boundary (sync protocol), not
 *       a product workspace model.
 *   The slot stays in the key so a future workspace model slots in without
 *   inventing a new collision class; the regression suite proves two
 *   tenants with the same user id get disjoint namespaces.
 * - Every tuple segment is length-prefixed (`<len>:<segment>`), which is
 *   provably injective: the key decodes back to exactly one
 *   (tenant, userId, personKey) tuple, so delimiter collisions are
 *   impossible by construction.
 *
 * Threat/retention policy, stated honestly:
 * - This is same-device plaintext persistence (localStorage). The app can
 *   never read across accounts: every read/write is namespaced by
 *   (tenant, immutable user id), and an unknown/empty account means NO
 *   persistence at all (fail closed), never a shared fallback key. A party
 *   with full browser access (DevTools on the same profile) can still read
 *   raw localStorage — that is outside the app's isolation boundary,
 *   exactly like every other same-device cache. The stronger end state is
 *   an authorized server draft; this module invents no backend endpoint
 *   and touches nothing on the server.
 * - Legacy v1 keys (`qm.threadReplyDraft.v1.<personKey>`, unscoped) and v2
 *   keys (`qm.threadReplyDraft.v2.<email>.<personKey>`, email-scoped) are
 *   NOT attributable to a stable account identity, so they are never
 *   migrated into v3 (that would move A's plaintext into B's session — the
 *   leak itself). They are purged: on logout and once per page load when
 *   the composer first mounts under an authenticated session. Upgrading
 *   users lose their pre-upgrade drafts; that is the honest price of
 *   fixing the leak, and the send path still creates its own per-send
 *   draft (#771).
 * - Drafts expire after 30 days (updatedAt), so abandoned text rots away
 *   instead of accumulating forever.
 *
 * Everything in this module is framework-free and unit-testable without a
 * DOM, mirroring the DraftAutosaveController precedent: the component owns
 * the React wiring, this module owns the persistence logic.
 */

export interface ThreadReplyDraft {
  /** Unsent reply text. */
  body: string;
  /** Whether the "New topic" subject field was open. */
  newTopic: boolean;
  /** The typed new-topic subject, if any. */
  customSubject: string;
  /** Epoch ms of the last write — lets housekeeping prune stale drafts. */
  updatedAt: number;
}

/**
 * Legacy namespace — written by pre-fix builds, keyed by personKey only.
 * Never written anymore; purge-only (see purgeLegacyThreadDraftKeys).
 */
export const LEGACY_THREAD_DRAFT_STORAGE_PREFIX = 'qm.threadReplyDraft.v1.';

/**
 * Legacy v2 namespace — written by the first rework attempt, keyed by
 * NORMALIZED EMAIL (`qm.threadReplyDraft.v2.<email>.<personKey>`).
 * CODEX-REVIEW 6157628718 rejected it: email is mutable/reassignable, so a
 * reassigned address hands the previous holder's retained plaintext to the
 * new holder. Retired as of v3; purge-only, never migrated, never read.
 */
export const LEGACY_V2_THREAD_DRAFT_STORAGE_PREFIX = 'qm.threadReplyDraft.v2.';

/**
 * Account+tenant-scoped namespace. One key per (tenant, user, person) tuple:
 * `qm.threadReplyDraft.v3.<len>:<tenant>.<len>:<userId>.<len>:<personKey>`.
 * Length-prefixing makes the encoding injective — the key decodes back to
 * exactly one tuple, so delimiter collisions are impossible by
 * construction (see encodeDraftKeySegment).
 */
export const THREAD_DRAFT_STORAGE_PREFIX = 'qm.threadReplyDraft.v3.';

/**
 * The tenant slot of the v3 namespace. QuantMail's account model is
 * single-tenant — one immutable user id is one account, and no
 * workspace/tenant dimension exists anywhere in the enforced identity
 * contract (see the module header for the published sources). The slot is
 * kept (rather than collapsed) so a future workspace model extends the key
 * instead of inventing a new collision class; today it is always this
 * constant. Overrideable only as a function parameter for tests and a
 * future multi-tenant product — never from user-controlled input.
 */
export const THREAD_DRAFT_TENANT_SCOPE = 'quantmail';

/** Stale drafts degrade to null instead of resurfacing months later. */
export const THREAD_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Unambiguous tuple-segment encoding. `<len>:<segment>` is injective AND
 * decodable: scanning `<len>`, then taking exactly `<len>` characters,
 * recovers each segment regardless of dots, colons, or digits inside it.
 * Two different (tenant, userId, personKey) tuples can never produce the
 * same storage key — the delimiter-collision class CODEX flagged in v1
 * cannot exist here. Length is measured in UTF-16 code units (string
 * length), matching how the decoder below consumes the key.
 */
export function encodeDraftKeySegment(segment: string): string {
  return `${segment.length}:${segment}`;
}

/**
 * Decode one length-prefixed segment starting at `offset`. Returns the
 * segment and the offset just past it, or null when the key is malformed.
 * Exported so tests can prove the encoding round-trips (injectivity).
 */
export function decodeDraftKeySegment(
  key: string,
  offset: number,
): { segment: string; nextOffset: number } | null {
  const colon = key.indexOf(':', offset);
  if (colon < 0) return null;
  const len = Number(key.slice(offset, colon));
  if (!Number.isInteger(len) || len < 0) return null;
  const start = colon + 1;
  const end = start + len;
  if (end > key.length) return null;
  return { segment: key.slice(start, end), nextOffset: end };
}

/**
 * The stable authenticated account identity used as the namespace segment:
 * the backend-verified IMMUTABLE user id (`AuthUser.id` — the access-token
 * `sub`, the users-table primary key), never the mutable email. The id is
 * opaque: no case folding or normalization is applied (folding an opaque
 * identifier could merge two distinct accounts). Returns '' when no id is
 * known; an empty account key means "no persistence available" (fail
 * closed — the module never falls back to an unscoped shared key).
 *
 * The optional `tenant` parameter exists for the cross-tenant regression
 * proof and a future multi-tenant product; callers always omit it today,
 * which pins the published single-tenant scope.
 */
export function threadDraftAccountKey(
  userId: string | null | undefined,
  tenant: string = THREAD_DRAFT_TENANT_SCOPE,
): string {
  const id = (userId ?? '').trim();
  if (!id) return '';
  const scope = (tenant ?? '').trim() || THREAD_DRAFT_TENANT_SCOPE;
  return `${encodeDraftKeySegment(scope)}.${encodeDraftKeySegment(id)}`;
}

/**
 * The storage key for one (tenant, account, person) tuple. Returns null
 * when either identity is missing — callers treat null as "no persistence
 * available". The accountKey already carries the encoded (tenant, userId)
 * pair (see threadDraftAccountKey); the personKey segment is encoded here,
 * so the full key is `v3.<len>:<tenant>.<len>:<userId>.<len>:<personKey>`.
 */
export function threadDraftKey(personKey: string, accountKey: string): string | null {
  if (!personKey || !accountKey) return null;
  return `${THREAD_DRAFT_STORAGE_PREFIX}${accountKey}.${encodeDraftKeySegment(personKey)}`;
}

/**
 * The minimal storage surface the logic needs. In the app this is a
 * window.localStorage adapter (see windowThreadDraftStorage); in tests a
 * Map-backed stub. Passing the store in keeps the logic honest about
 * environments where storage is unavailable (SSR prerender, locked-down
 * browsers) — those degrade to "no draft persistence" instead of throwing.
 */
export interface ThreadDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /**
   * Optional key enumeration, used by the legacy-namespace purge. Stubs
   * that omit it simply cannot purge — nothing else depends on it.
   */
  keys?(prefix?: string): string[];
}

export function windowThreadDraftStorage(): ThreadDraftStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    const ls = window.localStorage as unknown as Storage & {
      keys?: (prefix?: string) => string[];
    };
    const enumKeys = (): string[] => {
      // Test stubs pass themselves in as window.localStorage — prefer their
      // own enumeration so the purge path is exercised the same way.
      if (typeof ls.keys === 'function') return ls.keys();
      const out: string[] = [];
      for (let i = 0; i < ls.length; i += 1) {
        const k = ls.key(i);
        if (k) out.push(k);
      }
      return out;
    };
    return {
      getItem: (k) => ls.getItem(k),
      setItem: (k, v) => ls.setItem(k, v),
      removeItem: (k) => ls.removeItem(k),
      keys: (prefix) => enumKeys().filter((k) => !prefix || k.startsWith(prefix)),
    };
  } catch {
    return null;
  }
}

/**
 * True when the draft is older than the retention window. A draft with no
 * timestamp (updatedAt <= 0) is treated as fresh — only positively-old
 * drafts rot away, and clock skew into the future never expires anything.
 */
export function isThreadDraftExpired(
  draft: ThreadReplyDraft,
  now: number,
  maxAgeMs: number = THREAD_DRAFT_MAX_AGE_MS,
): boolean {
  if (draft.updatedAt <= 0 || now <= draft.updatedAt) return false;
  return now - draft.updatedAt > maxAgeMs;
}

/**
 * Parse a stored payload defensively. Corrupt or foreign entries degrade to
 * null — a poisoned key must never break the composer or surface garbage
 * text in the box.
 */
export function parseThreadDraft(raw: string | null | undefined): ThreadReplyDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ThreadReplyDraft> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.body !== 'string') {
      return null;
    }
    return {
      body: parsed.body,
      newTopic: parsed.newTopic === true,
      customSubject: typeof parsed.customSubject === 'string' ? parsed.customSubject : '',
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Load one account's draft for one person. Null store, empty personKey, or
 * empty accountKey means "no persistence available" — never throws, never
 * reads across accounts. Expired drafts degrade to null and are
 * best-effort removed so they stop rotting in place.
 */
export function loadThreadDraft(
  store: ThreadDraftStorage | null,
  personKey: string,
  accountKey: string,
  now: number = Date.now(),
): ThreadReplyDraft | null {
  const key = store ? threadDraftKey(personKey, accountKey) : null;
  if (!store || !key) return null;
  try {
    const draft = parseThreadDraft(store.getItem(key));
    if (draft && isThreadDraftExpired(draft, now)) {
      try {
        store.removeItem(key);
      } catch {
        // Best effort: the load still degrades to null.
      }
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

/** True when there is nothing worth keeping — an empty box with no subject. */
export function isThreadDraftEmpty(draft: { body: string; customSubject: string }): boolean {
  return draft.body.trim().length === 0 && draft.customSubject.trim().length === 0;
}

/**
 * Persist a draft under the account-scoped key. Returns true when the write
 * landed; false when storage is unavailable, either identity is missing, or
 * the write threw (private-mode quota, disabled cookies, …). The component
 * turns false into the honest "Couldn't save" indicator — the UI never
 * claims a draft is saved when it isn't.
 */
export function saveThreadDraft(
  store: ThreadDraftStorage | null,
  personKey: string,
  accountKey: string,
  draft: ThreadReplyDraft,
): boolean {
  const key = store ? threadDraftKey(personKey, accountKey) : null;
  if (!store || !key) return false;
  try {
    store.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** Best-effort delete — used when a reply sends, so sent text never resurfaces. */
export function clearThreadDraft(
  store: ThreadDraftStorage | null,
  personKey: string,
  accountKey: string,
): void {
  const key = store ? threadDraftKey(personKey, accountKey) : null;
  if (!store || !key) return;
  try {
    store.removeItem(key);
  } catch {
    // Best effort: a stale draft is annoying, never fatal.
  }
}

/**
 * Remove every legacy v1 (unscoped) draft key. Legacy keys cannot be
 * attributed to an account, so on logout — and once per page load under a
 * live session — they are purged rather than migrated. Returns the number
 * of keys removed.
 */
export function purgeLegacyThreadDraftKeys(store: ThreadDraftStorage | null): number {
  return purgeThreadDraftKeysWithPrefix(store, LEGACY_THREAD_DRAFT_STORAGE_PREFIX);
}

/**
 * Remove every legacy v2 (email-scoped) draft key. v2 keys ARE attributable
 * to an email address, but the address is mutable/reassignable — migrating
 * them into v3 would hand the previous holder's retained plaintext to
 * whoever holds the address now (the exact leak class CODEX-REVIEW
 * 6157628718 killed). Purged on logout and once per page load, never
 * migrated, never read. Returns the number of keys removed.
 */
export function purgeLegacyV2ThreadDraftKeys(store: ThreadDraftStorage | null): number {
  return purgeThreadDraftKeysWithPrefix(store, LEGACY_V2_THREAD_DRAFT_STORAGE_PREFIX);
}

/**
 * Remove every legacy draft key from BOTH retired namespaces (v1 unscoped,
 * v2 email-scoped). v3 (tenant + immutable-id-scoped) keys are never
 * touched — they partition safely and survive logout for the account's own
 * next sign-in. Returns the total number of keys removed.
 */
export function purgeAllLegacyThreadDraftKeys(store: ThreadDraftStorage | null): number {
  return (
    purgeLegacyThreadDraftKeys(store) + purgeLegacyV2ThreadDraftKeys(store)
  );
}

function purgeThreadDraftKeysWithPrefix(
  store: ThreadDraftStorage | null,
  prefix: string,
): number {
  if (!store || typeof store.keys !== 'function') return 0;
  let removed = 0;
  try {
    for (const key of store.keys(prefix)) {
      try {
        store.removeItem(key);
        removed += 1;
      } catch {
        // One wedged key must not protect the rest.
      }
    }
  } catch {
    // Best effort: enumeration failed, nothing removed.
  }
  return removed;
}

/** One-time per page load: drop the retired v1+v2 keys now that v3 is authoritative. */
let legacyPurgeDone = false;
export function ensureThreadDraftNamespaceV3(store: ThreadDraftStorage | null): void {
  if (legacyPurgeDone) return;
  legacyPurgeDone = true;
  purgeAllLegacyThreadDraftKeys(store);
}

/**
 * The person-switch transition. Two steps, in order:
 *  1. Flush the outgoing person's latest text first — a keystroke can race
 *     the tap that changes personKey, so the freshest in-memory values are
 *     persisted synchronously before anything is reset.
 *  2. Load the incoming person's saved draft.
 *
 * All persistence is under the SAME account's namespace: this function is
 * for same-account person switches only. An account change is handled by
 * the component (flush under the OLD account key, load under the NEW one)
 * so a switch can never write account A's words into account B's draft.
 * An empty accountKey means no persistence — the transition degrades to an
 * empty box instead of touching any shared key.
 *
 * Pure and unit-testable: the component's useEffect on personKey is a thin
 * wrapper that applies the returned fields to state.
 */
export function switchThreadDraft(args: {
  store: ThreadDraftStorage | null;
  prevPersonKey: string;
  nextPersonKey: string;
  /** The account whose namespace both people belong to. */
  accountKey: string;
  latest: { body: string; newTopic: boolean; customSubject: string };
  /** Epoch ms — injected so tests don't depend on the clock. */
  now: number;
}): { body: string; newTopic: boolean; customSubject: string; hadSavedDraft: boolean } {
  const { store, prevPersonKey, nextPersonKey, accountKey, latest, now } = args;
  const empty = { body: '', newTopic: false, customSubject: '', hadSavedDraft: false };
  if (!accountKey) return empty;
  if (prevPersonKey !== nextPersonKey && !isThreadDraftEmpty(latest)) {
    saveThreadDraft(store, prevPersonKey, accountKey, { ...latest, updatedAt: now });
  }
  const incoming = loadThreadDraft(store, nextPersonKey, accountKey, now);
  return {
    body: incoming?.body ?? '',
    newTopic: incoming?.newTopic ?? false,
    customSubject: incoming?.customSubject ?? '',
    hadSavedDraft: incoming !== null,
  };
}
