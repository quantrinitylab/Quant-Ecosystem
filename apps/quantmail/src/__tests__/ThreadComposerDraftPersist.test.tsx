// ThreadComposer per-person reply-draft persistence tests.
//
// QM fix qm-threadcomposer-draft-persist: the composer used to wipe a typed
// reply on person switch (useEffect on personKey -> setBody('')). Drafts now
// persist per person in localStorage, restore on return, and clear on send.
//
// P0 qm-draft-privacy-isolation (CODEX-REVIEW on PR #1123, rework
// CODEX-REVIEW 6157628718 on PR #1133): the original namespace keyed drafts
// by personKey alone, and logout only cleared the in-memory access token —
// account B on the same browser could restore account A's unsent text. The
// v3 namespace keys drafts by (tenant, IMMUTABLE AuthUser.id, personKey)
// with length-prefixed (unambiguous) tuple encoding — never by the mutable
// email. The regression suites below prove: email reuse across user ids is
// isolated, an email change keeps the account's drafts, delimiter-collision
// tuple pairs get disjoint keys, and tenants are isolated. Legacy v1
// (unscoped) and v2 (email-scoped) keys are purged rather than migrated.
//
// The persistence logic lives in the framework-free `threadReplyDrafts`
// module and is asserted directly (no DOM needed). The component-level half
// uses renderToStaticMarkup — the repo's established pattern for component
// tests (no @testing-library/react in this app).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  clearThreadDraft,
  decodeDraftKeySegment,
  encodeDraftKeySegment,
  ensureThreadDraftNamespaceV3,
  isThreadDraftEmpty,
  isThreadDraftExpired,
  LEGACY_THREAD_DRAFT_STORAGE_PREFIX,
  LEGACY_V2_THREAD_DRAFT_STORAGE_PREFIX,
  loadThreadDraft,
  parseThreadDraft,
  purgeAllLegacyThreadDraftKeys,
  purgeLegacyThreadDraftKeys,
  purgeLegacyV2ThreadDraftKeys,
  saveThreadDraft,
  switchThreadDraft,
  THREAD_DRAFT_MAX_AGE_MS,
  THREAD_DRAFT_STORAGE_PREFIX,
  THREAD_DRAFT_TENANT_SCOPE,
  threadDraftAccountKey,
  threadDraftKey,
  type ThreadDraftStorage,
  type ThreadReplyDraft,
} from '../lib/threadReplyDrafts';
import { ThreadComposer } from '../components/ThreadComposer';

vi.mock('../services/api-client', () => ({
  apiClient: { composeEmail: vi.fn(), sendEmail: vi.fn() },
}));
vi.mock('../components/InboxToast', () => ({ showToast: vi.fn() }));

const NOW = 1_700_000_000_000;
// Opaque backend-verified user ids (AuthUser.id — the access-token sub).
const UID_A = '01JABCDEF0000000000000001';
const UID_B = '01JABCDEF0000000000000002';
const ACCOUNT_A = threadDraftAccountKey(UID_A);
const ACCOUNT_B = threadDraftAccountKey(UID_B);

function mapStore(backing = new Map<string, string>()): ThreadDraftStorage & { backing: Map<string, string> } {
  return {
    backing,
    getItem: (k) => (backing.has(k) ? backing.get(k)! : null),
    setItem: (k, v) => {
      backing.set(k, v);
    },
    removeItem: (k) => {
      backing.delete(k);
    },
    keys: (prefix) => {
      const out: string[] = [];
      for (const k of backing.keys()) {
        if (!prefix || k.startsWith(prefix)) out.push(k);
      }
      return out;
    },
  };
}

function throwingStore(): ThreadDraftStorage {
  const boom = () => {
    throw new Error('storage unavailable');
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

function makeConversation(personKey = 'ada@quantmail.in') {
  return {
    personKey,
    email: personKey,
    name: 'Ada',
    lastMessage: { id: 'm-1', subject: 'Hi there' },
  };
}

/** Test-local decoder: proves the length-prefix encoding round-trips. */
function decodeThreadDraftKey(key: string): [string, string, string] | null {
  if (!key.startsWith(THREAD_DRAFT_STORAGE_PREFIX)) return null;
  const rest = key.slice(THREAD_DRAFT_STORAGE_PREFIX.length);
  const segs: string[] = [];
  let off = 0;
  for (let i = 0; i < 3; i += 1) {
    const d = decodeDraftKeySegment(rest, off);
    if (!d) return null;
    segs.push(d.segment);
    off = d.nextOffset;
    if (i < 2) {
      if (rest[off] !== '.') return null;
      off += 1;
    }
  }
  if (off !== rest.length) return null;
  return [segs[0], segs[1], segs[2]];
}

describe('encodeDraftKeySegment / decodeDraftKeySegment', () => {
  it('round-trips segments containing dots, colons, digits, and unicode', () => {
    for (const s of ['', 'a', 'john.doe@corp.com', '5:12', '0:0', 'u.1.x', 'ñø✓', 'a'.repeat(200)]) {
      const enc = encodeDraftKeySegment(s);
      const dec = decodeDraftKeySegment(enc, 0);
      expect(dec).not.toBeNull();
      expect(dec!.segment).toBe(s);
      expect(dec!.nextOffset).toBe(enc.length);
    }
  });

  it('rejects malformed input instead of mis-splitting', () => {
    expect(decodeDraftKeySegment('abc', 0)).toBeNull(); // no colon
    expect(decodeDraftKeySegment('x:ab', 0)).toBeNull(); // non-numeric length
    expect(decodeDraftKeySegment('5:ab', 0)).toBeNull(); // length overruns
    expect(decodeDraftKeySegment('-1:ab', 0)).toBeNull(); // negative length
  });
});

describe('threadDraftAccountKey (immutable id, not email)', () => {
  it('derives the namespace from the immutable user id only — email is not an input', () => {
    // Same id => same namespace, no matter what the email does.
    expect(threadDraftAccountKey(UID_A)).toBe(ACCOUNT_A);
    expect(threadDraftAccountKey(UID_A)).toBe(threadDraftAccountKey(UID_A));
  });

  it('treats the id as opaque: no case folding, no email-style normalization', () => {
    // Folding an opaque identifier could merge two distinct accounts — the
    // v1 email normalization (trim + lowercase) must NOT apply to ids.
    expect(threadDraftAccountKey('AbC-9')).not.toBe(threadDraftAccountKey('abc-9'));
    expect(threadDraftAccountKey('  uid-x  ')).toBe(threadDraftAccountKey('uid-x'));
  });

  it('is empty when no id is known — the fail-closed path', () => {
    expect(threadDraftAccountKey(null)).toBe('');
    expect(threadDraftAccountKey(undefined)).toBe('');
    expect(threadDraftAccountKey('')).toBe('');
    expect(threadDraftAccountKey('   ')).toBe('');
  });

  it('pins the published single-tenant scope by default', () => {
    expect(threadDraftAccountKey(UID_A)).toBe(threadDraftAccountKey(UID_A, THREAD_DRAFT_TENANT_SCOPE));
    expect(THREAD_DRAFT_TENANT_SCOPE).toBe('quantmail');
  });
});

describe('threadDraftKey (v3, unambiguous)', () => {
  it('namespaces per (tenant, account, person) so drafts never collide', () => {
    expect(threadDraftKey('a@x.in', ACCOUNT_A)).not.toBe(threadDraftKey('b@x.in', ACCOUNT_A));
    // Same person, different accounts — the P0 regression shape.
    expect(threadDraftKey('a@x.in', ACCOUNT_A)).not.toBe(threadDraftKey('a@x.in', ACCOUNT_B));
    const key = threadDraftKey('a@x.in', ACCOUNT_A)!;
    expect(key.startsWith(THREAD_DRAFT_STORAGE_PREFIX)).toBe(true);
    // v3 namespace is disjoint from both retired namespaces.
    expect(key.startsWith(LEGACY_THREAD_DRAFT_STORAGE_PREFIX)).toBe(false);
    expect(key.startsWith(LEGACY_V2_THREAD_DRAFT_STORAGE_PREFIX)).toBe(false);
  });

  it('returns null when either identity is missing — never a shared fallback key', () => {
    expect(threadDraftKey('', ACCOUNT_A)).toBeNull();
    expect(threadDraftKey('a@x.in', '')).toBeNull();
    expect(threadDraftKey('', '')).toBeNull();
  });

  it('decodes back to exactly the (tenant, userId, personKey) tuple', () => {
    const key = threadDraftKey('john.doe@corp.com', threadDraftAccountKey('u.1.x'))!;
    expect(decodeThreadDraftKey(key)).toEqual([THREAD_DRAFT_TENANT_SCOPE, 'u.1.x', 'john.doe@corp.com']);
  });
});

describe('CODEX regressions (6157628718)', () => {
  it('(1) same email, different user ids: a reassigned address cannot inherit the previous holder\u2019s draft', () => {
    const store = mapStore();
    // A holds a@quantmail.in (immutable id UID_A) and types an unsent reply.
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey(UID_A), {
      body: 'A\u2019s unsent private reply',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
    });
    // The address is later reassigned to B (immutable id UID_B). The email
    // string is identical, but the namespace must be disjoint — email is
    // not part of the key at all.
    expect(threadDraftAccountKey(UID_B)).not.toBe(threadDraftAccountKey(UID_A));
    expect(loadThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey(UID_B), NOW)).toBeNull();
    // The stored key contains no trace of the email address: the account
    // namespace is the opaque id alone.
    expect(threadDraftAccountKey('uid-A')).not.toContain('@');
    expect(threadDraftAccountKey('uid-B')).not.toContain('@');
  });

  it('(2) same user id after an email change keeps the account\u2019s drafts', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey(UID_A), {
      body: 'typed before the address change',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
    });
    // A changes address from old@quantmail.in to new@quantmail.in. The
    // immutable id is unchanged, so the namespace — and the draft — is
    // unchanged. (Email is not an input to the key function at all.)
    expect(threadDraftAccountKey(UID_A)).toBe(ACCOUNT_A);
    expect(loadThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey(UID_A), NOW)?.body).toBe(
      'typed before the address change',
    );
  });

  it('(3) delimiter-collision tuple pairs get disjoint keys', () => {
    // Under the retired naive `a + "." + p` concatenation these pairs
    // collided (CODEX's example shape: dots inside both segments). The
    // length-prefix encoding keeps them apart — and each key still decodes
    // to exactly its own tuple.
    const pairs: Array<[[string, string], [string, string]]> = [
      // (userId, personKey) pairs whose naive concatenation is identical.
      [['u.a', 'b'], ['u', 'a.b']],
      [['u1.x', 'y.z'], ['u1', 'x.y.z']],
      // Segments engineered to look like length tags / separators.
      [['5:ab', 'c.d'], ['5', 'ab.c.d']],
    ];
    for (const [[u1, p1], [u2, p2]] of pairs) {
      const k1 = threadDraftKey(p1, threadDraftAccountKey(u1))!;
      const k2 = threadDraftKey(p2, threadDraftAccountKey(u2))!;
      expect(k1).not.toBe(k2);
      expect(decodeThreadDraftKey(k1)).toEqual([THREAD_DRAFT_TENANT_SCOPE, u1, p1]);
      expect(decodeThreadDraftKey(k2)).toEqual([THREAD_DRAFT_TENANT_SCOPE, u2, p2]);
    }
    // Empty segments are rejected by threadDraftKey at the API boundary…
    expect(threadDraftKey('', threadDraftAccountKey('x'))).toBeNull();
    expect(threadDraftKey('x', '')).toBeNull();
  });

  it('(4) the same user id in different tenants gets disjoint namespaces', () => {
    const store = mapStore();
    const tenantA = threadDraftAccountKey(UID_A, 'tenant-a');
    const tenantB = threadDraftAccountKey(UID_A, 'tenant-b');
    expect(tenantA).not.toBe(tenantB);
    saveThreadDraft(store, 'ada@quantmail.in', tenantA, {
      body: 'tenant A\u2019s draft',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
    });
    expect(loadThreadDraft(store, 'ada@quantmail.in', tenantB, NOW)).toBeNull();
    expect(loadThreadDraft(store, 'ada@quantmail.in', tenantA, NOW)?.body).toBe('tenant A\u2019s draft');
    // QuantMail itself is single-tenant: omitting the parameter pins the
    // published scope constant.
    expect(threadDraftKey('ada@quantmail.in', tenantA)).not.toBe(threadDraftKey('ada@quantmail.in', ACCOUNT_A));
  });
});

describe('parseThreadDraft', () => {
  it('round-trips a valid payload', () => {
    const draft: ThreadReplyDraft = {
      body: 'hello there',
      newTopic: true,
      customSubject: 'New plans',
      updatedAt: 123,
    };
    expect(parseThreadDraft(JSON.stringify(draft))).toEqual(draft);
  });

  it('degrades corrupt JSON to null instead of throwing or surfacing garbage', () => {
    expect(parseThreadDraft('{nope')).toBeNull();
    expect(parseThreadDraft(null)).toBeNull();
    expect(parseThreadDraft('')).toBeNull();
    expect(parseThreadDraft(JSON.stringify({ body: 42 }))).toBeNull();
    expect(parseThreadDraft(JSON.stringify(['array']))).toBeNull();
  });

  it('fills missing fields with honest defaults', () => {
    expect(parseThreadDraft(JSON.stringify({ body: 'x' }))).toEqual({
      body: 'x',
      newTopic: false,
      customSubject: '',
      updatedAt: 0,
    });
  });
});

describe('isThreadDraftExpired', () => {
  it('expires drafts older than the retention window', () => {
    expect(
      isThreadDraftExpired({ body: 'x', newTopic: false, customSubject: '', updatedAt: NOW }, NOW + THREAD_DRAFT_MAX_AGE_MS + 1),
    ).toBe(true);
  });

  it('keeps fresh drafts and never expires on clock skew into the future', () => {
    const fresh = { body: 'x', newTopic: false, customSubject: '', updatedAt: NOW };
    expect(isThreadDraftExpired(fresh, NOW)).toBe(false);
    expect(isThreadDraftExpired(fresh, NOW - 1000)).toBe(false);
    // No timestamp (updatedAt <= 0) is treated as fresh, not rotten.
    expect(
      isThreadDraftExpired({ body: 'x', newTopic: false, customSubject: '', updatedAt: 0 }, NOW + THREAD_DRAFT_MAX_AGE_MS * 10),
    ).toBe(false);
  });
});

describe('isThreadDraftEmpty', () => {
  it('treats whitespace-only boxes as empty', () => {
    expect(isThreadDraftEmpty({ body: '   ', customSubject: '' })).toBe(true);
    expect(isThreadDraftEmpty({ body: '', customSubject: '  ' })).toBe(true);
  });

  it('keeps subject-only drafts (new-topic mode with no body yet)', () => {
    expect(isThreadDraftEmpty({ body: '', customSubject: 'Topic' })).toBe(false);
    expect(isThreadDraftEmpty({ body: 'hi', customSubject: '' })).toBe(false);
  });
});

describe('save/load/clear (account-scoped)', () => {
  it('round-trips a draft for an (account, person) pair', () => {
    const store = mapStore();
    const draft: ThreadReplyDraft = { body: 'draft text', newTopic: false, customSubject: '', updatedAt: NOW };
    expect(saveThreadDraft(store, 'a@x.in', ACCOUNT_A, draft)).toBe(true);
    expect(loadThreadDraft(store, 'a@x.in', ACCOUNT_A, NOW)).toEqual(draft);
    // A different person under the same account sees nothing.
    expect(loadThreadDraft(store, 'b@x.in', ACCOUNT_A, NOW)).toBeNull();
  });

  it('never persists or reads when the account is unknown — fail closed', () => {
    const store = mapStore();
    expect(saveThreadDraft(store, 'a@x.in', '', { body: 'x', newTopic: false, customSubject: '', updatedAt: 0 })).toBe(false);
    expect(store.backing.size).toBe(0);
    expect(loadThreadDraft(store, 'a@x.in', '', NOW)).toBeNull();
    expect(() => clearThreadDraft(store, 'a@x.in', '')).not.toThrow();
    expect(loadThreadDraft(null, 'a@x.in', ACCOUNT_A, NOW)).toBeNull();
    expect(loadThreadDraft(mapStore(), '', ACCOUNT_A, NOW)).toBeNull();
    expect(saveThreadDraft(null, 'a@x.in', ACCOUNT_A, { body: 'x', newTopic: false, customSubject: '', updatedAt: 0 })).toBe(false);
    expect(() => clearThreadDraft(null, 'a@x.in', ACCOUNT_A)).not.toThrow();
  });

  it('reports false when the write throws (private-mode quota, disabled storage)', () => {
    // The honest "Couldn't save" indicator path: the component must know the
    // draft did NOT land instead of claiming it did.
    const store = throwingStore();
    expect(
      saveThreadDraft(store, 'a@x.in', ACCOUNT_A, { body: 'x', newTopic: false, customSubject: '', updatedAt: 0 }),
    ).toBe(false);
    expect(loadThreadDraft(store, 'a@x.in', ACCOUNT_A, NOW)).toBeNull();
    expect(() => clearThreadDraft(store, 'a@x.in', ACCOUNT_A)).not.toThrow();
  });

  it('clear removes the draft so sent text never resurfaces', () => {
    const store = mapStore();
    saveThreadDraft(store, 'a@x.in', ACCOUNT_A, { body: 'x', newTopic: false, customSubject: '', updatedAt: NOW });
    clearThreadDraft(store, 'a@x.in', ACCOUNT_A);
    expect(loadThreadDraft(store, 'a@x.in', ACCOUNT_A, NOW)).toBeNull();
  });

  it('drops expired drafts on load (and best-effort removes them)', () => {
    const store = mapStore();
    const key = threadDraftKey('a@x.in', ACCOUNT_A)!;
    store.backing.set(
      key,
      JSON.stringify({ body: 'old', newTopic: false, customSubject: '', updatedAt: NOW - THREAD_DRAFT_MAX_AGE_MS - 1000 }),
    );
    expect(loadThreadDraft(store, 'a@x.in', ACCOUNT_A, NOW)).toBeNull();
    expect(store.backing.has(key)).toBe(false);
  });
});

describe('two-account isolation regression (P0 qm-draft-privacy-isolation)', () => {
  it('account B can never restore account A\u2019s draft for the same personKey', () => {
    const store = mapStore();
    // Account A types an unsent private reply to person P.
    saveThreadDraft(store, 'ada@quantmail.in', ACCOUNT_A, {
      body: 'A\u2019s unsent private reply',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
    });
    // Account B signs in on the same browser and opens P's thread.
    expect(loadThreadDraft(store, 'ada@quantmail.in', ACCOUNT_B, NOW)).toBeNull();
    // The keys prove the namespaces are disjoint on disk.
    expect(threadDraftKey('ada@quantmail.in', ACCOUNT_A)).not.toBe(threadDraftKey('ada@quantmail.in', ACCOUNT_B));
  });

  it('account B\u2019s own draft does not clobber account A\u2019s, and A gets hers back', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', ACCOUNT_A, {
      body: 'A\u2019s text',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
    });
    // B writes to the same person — must land under B's key only.
    saveThreadDraft(store, 'ada@quantmail.in', ACCOUNT_B, {
      body: 'B\u2019s text',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
    });
    expect(loadThreadDraft(store, 'ada@quantmail.in', ACCOUNT_A, NOW)?.body).toBe('A\u2019s text');
    expect(loadThreadDraft(store, 'ada@quantmail.in', ACCOUNT_B, NOW)?.body).toBe('B\u2019s text');
    // A logs out; B's composer clearing ITS draft cannot touch A's.
    clearThreadDraft(store, 'ada@quantmail.in', ACCOUNT_B);
    expect(loadThreadDraft(store, 'ada@quantmail.in', ACCOUNT_A, NOW)?.body).toBe('A\u2019s text');
    expect(loadThreadDraft(store, 'ada@quantmail.in', ACCOUNT_B, NOW)).toBeNull();
  });
});

describe('legacy namespace purge (logout/account-switch isolation)', () => {
  it('purges unscoped v1 keys but never touches v3 keys', () => {
    const store = mapStore();
    const v1Key = `${LEGACY_THREAD_DRAFT_STORAGE_PREFIX}ada@quantmail.in`;
    store.backing.set(v1Key, JSON.stringify({ body: 'A\u2019s legacy draft', newTopic: false, customSubject: '', updatedAt: 1 }));
    const v3Key = threadDraftKey('ada@quantmail.in', ACCOUNT_A)!;
    store.backing.set(v3Key, JSON.stringify({ body: 'A\u2019s v3 draft', newTopic: false, customSubject: '', updatedAt: NOW }));
    const removed = purgeLegacyThreadDraftKeys(store);
    expect(removed).toBe(1);
    expect(store.backing.has(v1Key)).toBe(false);
    // The account-scoped draft survives for the account's own next sign-in.
    expect(store.backing.has(v3Key)).toBe(true);
    // Re-running is idempotent.
    expect(purgeLegacyThreadDraftKeys(store)).toBe(0);
  });

  it('purges retired v2 (email-scoped) keys — they are never migrated', () => {
    const store = mapStore();
    // A v2 key from the first rework attempt: attributable to an email, but
    // the email is reassignable, so the whole namespace is retired.
    const v2Key = `${LEGACY_V2_THREAD_DRAFT_STORAGE_PREFIX}a@quantmail.in.ada@quantmail.in`;
    store.backing.set(v2Key, JSON.stringify({ body: 'A\u2019s v2 draft', newTopic: false, customSubject: '', updatedAt: NOW }));
    const v3Key = threadDraftKey('ada@quantmail.in', ACCOUNT_A)!;
    store.backing.set(v3Key, JSON.stringify({ body: 'A\u2019s v3 draft', newTopic: false, customSubject: '', updatedAt: NOW }));
    expect(purgeLegacyV2ThreadDraftKeys(store)).toBe(1);
    expect(store.backing.has(v2Key)).toBe(false);
    expect(store.backing.has(v3Key)).toBe(true);
  });

  it('purgeAllLegacyThreadDraftKeys drops v1+v2 together and keeps v3', () => {
    const store = mapStore();
    store.backing.set(`${LEGACY_THREAD_DRAFT_STORAGE_PREFIX}p1`, '{}');
    store.backing.set(`${LEGACY_V2_THREAD_DRAFT_STORAGE_PREFIX}a@x.in.p1`, '{}');
    const v3Key = threadDraftKey('p1', ACCOUNT_A)!;
    store.backing.set(v3Key, '{}');
    expect(purgeAllLegacyThreadDraftKeys(store)).toBe(2);
    expect(store.backing.size).toBe(1);
    expect(store.backing.has(v3Key)).toBe(true);
  });

  it('a legacy v1/v2 key is unreadable through the v3 API — no migration, no leak', () => {
    const store = mapStore();
    store.backing.set(
      `${LEGACY_THREAD_DRAFT_STORAGE_PREFIX}ada@quantmail.in`,
      JSON.stringify({ body: 'legacy plaintext', newTopic: false, customSubject: '', updatedAt: 1 }),
    );
    store.backing.set(
      `${LEGACY_V2_THREAD_DRAFT_STORAGE_PREFIX}a@quantmail.in.ada@quantmail.in`,
      JSON.stringify({ body: 'v2 plaintext', newTopic: false, customSubject: '', updatedAt: 1 }),
    );
    // Neither account can read them via the namespaced API…
    expect(loadThreadDraft(store, 'ada@quantmail.in', ACCOUNT_A, NOW)).toBeNull();
    expect(loadThreadDraft(store, 'ada@quantmail.in', ACCOUNT_B, NOW)).toBeNull();
    // …and the mount-time one-shot purge removes both (the logout path in
    // browser-auth-session calls the same purge).
    ensureThreadDraftNamespaceV3(store);
    expect(store.backing.size).toBe(0);
  });

  it('degrades to no-op when the store cannot enumerate keys', () => {
    expect(purgeLegacyThreadDraftKeys(null)).toBe(0);
    expect(purgeLegacyV2ThreadDraftKeys(null)).toBe(0);
    expect(purgeAllLegacyThreadDraftKeys(null)).toBe(0);
    const noEnum = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    expect(purgeLegacyThreadDraftKeys(noEnum)).toBe(0);
    expect(purgeLegacyV2ThreadDraftKeys(noEnum)).toBe(0);
    expect(purgeAllLegacyThreadDraftKeys(noEnum)).toBe(0);
  });
});

describe('switchThreadDraft', () => {
  it('flushes the outgoing person text, then restores the incoming person draft', () => {
    const store = mapStore();
    saveThreadDraft(store, 'b@x.in', ACCOUNT_A, {
      body: 'saved for B',
      newTopic: true,
      customSubject: 'B topic',
      updatedAt: NOW,
    });
    const restored = switchThreadDraft({
      store,
      prevPersonKey: 'a@x.in',
      nextPersonKey: 'b@x.in',
      accountKey: ACCOUNT_A,
      latest: { body: 'typing to A', newTopic: false, customSubject: '' },
      now: NOW,
    });
    // Outgoing flushed…
    expect(loadThreadDraft(store, 'a@x.in', ACCOUNT_A, NOW)).toEqual({
      body: 'typing to A',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
    });
    // …incoming restored with its subject state.
    expect(restored).toEqual({
      body: 'saved for B',
      newTopic: true,
      customSubject: 'B topic',
      hadSavedDraft: true,
    });
  });

  it('does not write a junk key when the outgoing box is empty', () => {
    const store = mapStore();
    const restored = switchThreadDraft({
      store,
      prevPersonKey: 'a@x.in',
      nextPersonKey: 'b@x.in',
      accountKey: ACCOUNT_A,
      latest: { body: '   ', newTopic: false, customSubject: '' },
      now: NOW,
    });
    expect(store.backing.has(threadDraftKey('a@x.in', ACCOUNT_A)!)).toBe(false);
    expect(restored).toEqual({ body: '', newTopic: false, customSubject: '', hadSavedDraft: false });
  });

  it('degrades to an empty box when the incoming payload is corrupt', () => {
    const store = mapStore();
    store.backing.set(threadDraftKey('b@x.in', ACCOUNT_A)!, '{corrupt');
    const restored = switchThreadDraft({
      store,
      prevPersonKey: 'a@x.in',
      nextPersonKey: 'b@x.in',
      accountKey: ACCOUNT_A,
      latest: { body: '', newTopic: false, customSubject: '' },
      now: NOW,
    });
    expect(restored.body).toBe('');
    expect(restored.hadSavedDraft).toBe(false);
  });

  it('round-trips A -> B -> A without losing either draft', () => {
    const store = mapStore();
    switchThreadDraft({
      store,
      prevPersonKey: 'a@x.in',
      nextPersonKey: 'b@x.in',
      accountKey: ACCOUNT_A,
      latest: { body: 'to A', newTopic: false, customSubject: '' },
      now: NOW,
    });
    const backToA = switchThreadDraft({
      store,
      prevPersonKey: 'b@x.in',
      nextPersonKey: 'a@x.in',
      accountKey: ACCOUNT_A,
      latest: { body: 'to B', newTopic: false, customSubject: '' },
      now: NOW + 1,
    });
    expect(backToA.body).toBe('to A');
    expect(backToA.hadSavedDraft).toBe(true);
    // B's text was flushed on the way back too.
    expect(loadThreadDraft(store, 'b@x.in', ACCOUNT_A, NOW + 1)?.body).toBe('to B');
  });

  it('writes nothing and restores nothing when the account is unknown', () => {
    const store = mapStore();
    const restored = switchThreadDraft({
      store,
      prevPersonKey: 'a@x.in',
      nextPersonKey: 'b@x.in',
      accountKey: '',
      latest: { body: 'unsent words', newTopic: false, customSubject: '' },
      now: NOW,
    });
    expect(restored).toEqual({ body: '', newTopic: false, customSubject: '', hadSavedDraft: false });
    expect(store.backing.size).toBe(0);
  });
});

describe('ThreadComposer draft restore (static render)', () => {
  const realWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  afterEach(() => {
    if (realWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = realWindow;
    }
  });

  function stubWindow(store: ThreadDraftStorage) {
    (globalThis as { window?: unknown }).window = { localStorage: store };
  }

  it('restores the saved draft into the box on mount (survives navigation + reload)', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('uid-me'), {
      body: 'half-typed reply to Ada',
      newTopic: false,
      customSubject: '',
      updatedAt: Date.now(),
    });
    stubWindow(store);
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserId="uid-me" />,
    );
    expect(html).toContain('half-typed reply to Ada');
    // Restored draft is real saved state — the honest indicator shows it.
    expect(html).toContain('Saved');
  });

  it('restores new-topic subject state with the draft', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('uid-me'), {
      body: 'body under a new topic',
      newTopic: true,
      customSubject: 'Weekend plans',
      updatedAt: Date.now(),
    });
    stubWindow(store);
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserId="uid-me" />,
    );
    expect(html).toContain('aria-label="New topic subject"');
    expect(html).toContain('Weekend plans');
    expect(html).toContain('body under a new topic');
  });

  it('renders an empty quiet box when the person has no draft (pristine shows nothing)', () => {
    stubWindow(mapStore());
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('bob@quantmail.in') as any} currentUserId="uid-me" />,
    );
    // Pristine: the indicator is null, so the chat-style bar stays quiet.
    expect(html).not.toContain('Saved');
    expect(html).not.toContain('Unsaved changes');
    expect(html).toContain('Message Ada…');
  });

  it('an explicit smart-reply chip still wins over a stored draft', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('uid-me'), {
      body: 'stored draft',
      newTopic: false,
      customSubject: '',
      updatedAt: Date.now(),
    });
    stubWindow(store);
    const html = renderToStaticMarkup(
      <ThreadComposer
        conversation={makeConversation('ada@quantmail.in') as any}
        currentUserId="uid-me"
        suggestedReply={{ text: 'Sounds great!', nonce: 1 }}
      />,
    );
    expect(html).toContain('Sounds great!');
    expect(html).not.toContain('stored draft');
  });

  it('P0: the same browser, a different signed-in account, never sees another account\u2019s draft', () => {
    const store = mapStore();
    // Account A (immutable id uid-A) typed an unsent reply to Ada on this browser.
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('uid-A'), {
      body: 'A\u2019s unsent private reply',
      newTopic: false,
      customSubject: '',
      updatedAt: Date.now(),
    });
    // Account B signs in on the same browser and opens the same thread.
    stubWindow(store);
    const htmlForB = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserId="uid-B" />,
    );
    expect(htmlForB).not.toContain('A\u2019s unsent private reply');
    expect(htmlForB).not.toContain('Saved');
    // Account A, back on its own session, still gets its own draft.
    const htmlForA = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserId="uid-A" />,
    );
    expect(htmlForA).toContain('A\u2019s unsent private reply');
  });

  it('P0: email reuse — B holding A\u2019s old address still cannot read A\u2019s draft', () => {
    const store = mapStore();
    // A (uid-A) used old@quantmail.in and typed an unsent reply.
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('uid-A'), {
      body: 'A\u2019s unsent private reply',
      newTopic: false,
      customSubject: '',
      updatedAt: Date.now(),
    });
    // The address is reassigned to B (uid-B). The composer only ever sees
    // the immutable id, so B's box stays empty even though a v1-style
    // email-keyed lookup would have matched.
    stubWindow(store);
    const htmlForB = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserId="uid-B" />,
    );
    expect(htmlForB).not.toContain('A\u2019s unsent private reply');
  });

  it('renders an empty box with no restore attempt when the account identity is missing', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('uid-A'), {
      body: 'someone\u2019s draft',
      newTopic: false,
      customSubject: '',
      updatedAt: Date.now(),
    });
    stubWindow(store);
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserId="" />,
    );
    expect(html).not.toContain('someone\u2019s draft');
    expect(html).not.toContain('Saved');
  });
});
