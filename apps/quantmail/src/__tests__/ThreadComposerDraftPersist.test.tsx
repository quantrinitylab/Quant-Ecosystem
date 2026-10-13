// ThreadComposer per-person reply-draft persistence tests.
//
// QM fix qm-threadcomposer-draft-persist: the composer used to wipe a typed
// reply on person switch (useEffect on personKey -> setBody('')). Drafts now
// persist per person in localStorage, restore on return, and clear on send.
//
// P0 qm-draft-privacy-isolation (CODEX-REVIEW on PR #1123): the original
// namespace keyed drafts by personKey alone, and logout only cleared the
// in-memory access token — account B on the same browser could restore
// account A's unsent text. Drafts are now namespaced by the authenticated
// account (qm.threadReplyDraft.v2.<account>.<personKey>); the
// two-account regression tests below prove B can never read A's draft,
// and legacy v1 keys are purged rather than migrated.
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
  ensureThreadDraftNamespaceV2,
  isThreadDraftEmpty,
  isThreadDraftExpired,
  LEGACY_THREAD_DRAFT_STORAGE_PREFIX,
  loadThreadDraft,
  parseThreadDraft,
  purgeLegacyThreadDraftKeys,
  saveThreadDraft,
  switchThreadDraft,
  THREAD_DRAFT_MAX_AGE_MS,
  THREAD_DRAFT_STORAGE_PREFIX,
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
const ACCOUNT_A = threadDraftAccountKey('a@quantmail.in');
const ACCOUNT_B = threadDraftAccountKey('b@quantmail.in');

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

describe('threadDraftAccountKey', () => {
  it('normalizes the account identity (trim + lowercase) — one identity, one namespace', () => {
    expect(threadDraftAccountKey('  A@QuantMail.IN ')).toBe('a@quantmail.in');
  });

  it('is empty when no account is known — the fail-closed path', () => {
    expect(threadDraftAccountKey(null)).toBe('');
    expect(threadDraftAccountKey(undefined)).toBe('');
    expect(threadDraftAccountKey('   ')).toBe('');
  });
});

describe('threadDraftKey', () => {
  it('namespaces per (account, person) so drafts never collide', () => {
    expect(threadDraftKey('a@x.in', 'me@q.in')).not.toBe(threadDraftKey('b@x.in', 'me@q.in'));
    // Same person, different accounts — the P0 regression shape.
    expect(threadDraftKey('a@x.in', 'a1@q.in')).not.toBe(threadDraftKey('a@x.in', 'a2@q.in'));
    expect(threadDraftKey('a@x.in', 'me@q.in')).toContain('a@x.in');
    expect(threadDraftKey('a@x.in', 'me@q.in')).toContain(THREAD_DRAFT_STORAGE_PREFIX);
    // v2 namespace is disjoint from the legacy v1 namespace.
    expect(threadDraftKey('a@x.in', 'me@q.in')).not.toContain(LEGACY_THREAD_DRAFT_STORAGE_PREFIX);
  });

  it('returns null when either identity is missing — never a shared fallback key', () => {
    expect(threadDraftKey('', 'me@q.in')).toBeNull();
    expect(threadDraftKey('a@x.in', '')).toBeNull();
    expect(threadDraftKey('', '')).toBeNull();
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

  it('account identity normalizes: the same account in different casing shares one draft', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('A@QuantMail.in'), {
      body: 'x',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
    });
    expect(loadThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('  a@quantmail.in  '), NOW)?.body).toBe('x');
  });
});

describe('legacy v1 purge (logout/account-switch isolation)', () => {
  it('purges unscoped v1 keys but never touches account-scoped v2 keys', () => {
    const store = mapStore();
    const v1Key = `${LEGACY_THREAD_DRAFT_STORAGE_PREFIX}ada@quantmail.in`;
    store.backing.set(v1Key, JSON.stringify({ body: 'A\u2019s legacy draft', newTopic: false, customSubject: '', updatedAt: 1 }));
    const v2Key = threadDraftKey('ada@quantmail.in', ACCOUNT_A)!;
    store.backing.set(v2Key, JSON.stringify({ body: 'A\u2019s v2 draft', newTopic: false, customSubject: '', updatedAt: NOW }));
    const removed = purgeLegacyThreadDraftKeys(store);
    expect(removed).toBe(1);
    expect(store.backing.has(v1Key)).toBe(false);
    // The account-scoped draft survives for the account's own next sign-in.
    expect(store.backing.has(v2Key)).toBe(true);
    // Re-running is idempotent.
    expect(purgeLegacyThreadDraftKeys(store)).toBe(0);
  });

  it('a legacy v1 key is unreadable through the v2 API — no migration, no leak', () => {
    const store = mapStore();
    store.backing.set(
      `${LEGACY_THREAD_DRAFT_STORAGE_PREFIX}ada@quantmail.in`,
      JSON.stringify({ body: 'legacy plaintext', newTopic: false, customSubject: '', updatedAt: 1 }),
    );
    // Neither account can read it via the namespaced API…
    expect(loadThreadDraft(store, 'ada@quantmail.in', ACCOUNT_A, NOW)).toBeNull();
    expect(loadThreadDraft(store, 'ada@quantmail.in', ACCOUNT_B, NOW)).toBeNull();
    // …and the mount-time one-shot purge removes it (the logout path in
    // browser-auth-session calls the same purge).
    ensureThreadDraftNamespaceV2(store);
    expect(store.backing.size).toBe(0);
  });

  it('degrades to no-op when the store cannot enumerate keys', () => {
    expect(purgeLegacyThreadDraftKeys(null)).toBe(0);
    expect(purgeLegacyThreadDraftKeys({ getItem: () => null, setItem: () => {}, removeItem: () => {} })).toBe(0);
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
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('me@quantmail.in'), {
      body: 'half-typed reply to Ada',
      newTopic: false,
      customSubject: '',
      updatedAt: Date.now(),
    });
    stubWindow(store);
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserEmail="me@quantmail.in" />,
    );
    expect(html).toContain('half-typed reply to Ada');
    // Restored draft is real saved state — the honest indicator shows it.
    expect(html).toContain('Saved');
  });

  it('restores new-topic subject state with the draft', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('me@quantmail.in'), {
      body: 'body under a new topic',
      newTopic: true,
      customSubject: 'Weekend plans',
      updatedAt: Date.now(),
    });
    stubWindow(store);
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserEmail="me@quantmail.in" />,
    );
    expect(html).toContain('aria-label="New topic subject"');
    expect(html).toContain('Weekend plans');
    expect(html).toContain('body under a new topic');
  });

  it('renders an empty quiet box when the person has no draft (pristine shows nothing)', () => {
    stubWindow(mapStore());
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('bob@quantmail.in') as any} currentUserEmail="me@quantmail.in" />,
    );
    // Pristine: the indicator is null, so the chat-style bar stays quiet.
    expect(html).not.toContain('Saved');
    expect(html).not.toContain('Unsaved changes');
    expect(html).toContain('Message Ada…');
  });

  it('an explicit smart-reply chip still wins over a stored draft', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('me@quantmail.in'), {
      body: 'stored draft',
      newTopic: false,
      customSubject: '',
      updatedAt: Date.now(),
    });
    stubWindow(store);
    const html = renderToStaticMarkup(
      <ThreadComposer
        conversation={makeConversation('ada@quantmail.in') as any}
        currentUserEmail="me@quantmail.in"
        suggestedReply={{ text: 'Sounds great!', nonce: 1 }}
      />,
    );
    expect(html).toContain('Sounds great!');
    expect(html).not.toContain('stored draft');
  });

  it('P0: the same browser, a different signed-in account, never sees another account\u2019s draft', () => {
    const store = mapStore();
    // Account A typed an unsent reply to Ada on this browser.
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('a@quantmail.in'), {
      body: 'A\u2019s unsent private reply',
      newTopic: false,
      customSubject: '',
      updatedAt: Date.now(),
    });
    // Account B signs in on the same browser and opens the same thread.
    stubWindow(store);
    const htmlForB = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserEmail="b@quantmail.in" />,
    );
    expect(htmlForB).not.toContain('A\u2019s unsent private reply');
    expect(htmlForB).not.toContain('Saved');
    // Account A, back on its own session, still gets its own draft.
    const htmlForA = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserEmail="a@quantmail.in" />,
    );
    expect(htmlForA).toContain('A\u2019s unsent private reply');
  });

  it('renders an empty box with no restore attempt when the account identity is missing', () => {
    const store = mapStore();
    saveThreadDraft(store, 'ada@quantmail.in', threadDraftAccountKey('a@quantmail.in'), {
      body: 'someone\u2019s draft',
      newTopic: false,
      customSubject: '',
      updatedAt: Date.now(),
    });
    stubWindow(store);
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation('ada@quantmail.in') as any} currentUserEmail="" />,
    );
    expect(html).not.toContain('someone\u2019s draft');
    expect(html).not.toContain('Saved');
  });
});
