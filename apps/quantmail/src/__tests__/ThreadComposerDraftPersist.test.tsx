// ThreadComposer per-person reply-draft persistence tests.
//
// QM fix qm-threadcomposer-draft-persist: the composer used to wipe a typed
// reply on person switch (useEffect on personKey -> setBody('')). Drafts now
// persist per person in localStorage, restore on return, and clear on send.
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
  isThreadDraftEmpty,
  loadThreadDraft,
  parseThreadDraft,
  saveThreadDraft,
  switchThreadDraft,
  threadDraftKey,
  type ThreadDraftStorage,
  type ThreadReplyDraft,
} from '../lib/threadReplyDrafts';
import { ThreadComposer } from '../components/ThreadComposer';

vi.mock('../services/api-client', () => ({
  apiClient: { composeEmail: vi.fn(), sendEmail: vi.fn() },
}));
vi.mock('../components/InboxToast', () => ({ showToast: vi.fn() }));

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

describe('threadDraftKey', () => {
  it('namespaces per person so drafts never collide', () => {
    expect(threadDraftKey('a@x.in')).not.toBe(threadDraftKey('b@x.in'));
    expect(threadDraftKey('a@x.in')).toContain('a@x.in');
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

describe('save/load/clear', () => {
  it('round-trips a draft for a person', () => {
    const store = mapStore();
    const draft: ThreadReplyDraft = { body: 'draft text', newTopic: false, customSubject: '', updatedAt: 7 };
    expect(saveThreadDraft(store, 'a@x.in', draft)).toBe(true);
    expect(loadThreadDraft(store, 'a@x.in')).toEqual(draft);
    // A different person sees nothing.
    expect(loadThreadDraft(store, 'b@x.in')).toBeNull();
  });

  it('returns null for a null store or empty personKey — never throws', () => {
    expect(loadThreadDraft(null, 'a@x.in')).toBeNull();
    expect(loadThreadDraft(mapStore(), '')).toBeNull();
    expect(saveThreadDraft(null, 'a@x.in', { body: 'x', newTopic: false, customSubject: '', updatedAt: 0 })).toBe(
      false,
    );
    expect(() => clearThreadDraft(null, 'a@x.in')).not.toThrow();
  });

  it('reports false when the write throws (private-mode quota, disabled storage)', () => {
    // The honest "Couldn't save" indicator path: the component must know the
    // draft did NOT land instead of claiming it did.
    const store = throwingStore();
    expect(saveThreadDraft(store, 'a@x.in', { body: 'x', newTopic: false, customSubject: '', updatedAt: 0 })).toBe(
      false,
    );
    expect(loadThreadDraft(store, 'a@x.in')).toBeNull();
    expect(() => clearThreadDraft(store, 'a@x.in')).not.toThrow();
  });

  it('clear removes the draft so sent text never resurfaces', () => {
    const store = mapStore();
    saveThreadDraft(store, 'a@x.in', { body: 'x', newTopic: false, customSubject: '', updatedAt: 0 });
    clearThreadDraft(store, 'a@x.in');
    expect(loadThreadDraft(store, 'a@x.in')).toBeNull();
  });
});

describe('switchThreadDraft', () => {
  const NOW = 1_700_000_000_000;

  it('flushes the outgoing person text, then restores the incoming person draft', () => {
    const store = mapStore();
    saveThreadDraft(
      store,
      'b@x.in',
      { body: 'saved for B', newTopic: true, customSubject: 'B topic', updatedAt: 1 },
    );
    const restored = switchThreadDraft({
      store,
      prevPersonKey: 'a@x.in',
      nextPersonKey: 'b@x.in',
      latest: { body: 'typing to A', newTopic: false, customSubject: '' },
      now: NOW,
    });
    // Outgoing flushed…
    expect(loadThreadDraft(store, 'a@x.in')).toEqual({
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
      latest: { body: '   ', newTopic: false, customSubject: '' },
      now: NOW,
    });
    expect(store.backing.has(threadDraftKey('a@x.in'))).toBe(false);
    expect(restored).toEqual({ body: '', newTopic: false, customSubject: '', hadSavedDraft: false });
  });

  it('degrades to an empty box when the incoming payload is corrupt', () => {
    const store = mapStore();
    store.backing.set(threadDraftKey('b@x.in'), '{corrupt');
    const restored = switchThreadDraft({
      store,
      prevPersonKey: 'a@x.in',
      nextPersonKey: 'b@x.in',
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
      latest: { body: 'to A', newTopic: false, customSubject: '' },
      now: NOW,
    });
    const backToA = switchThreadDraft({
      store,
      prevPersonKey: 'b@x.in',
      nextPersonKey: 'a@x.in',
      latest: { body: 'to B', newTopic: false, customSubject: '' },
      now: NOW + 1,
    });
    expect(backToA.body).toBe('to A');
    expect(backToA.hadSavedDraft).toBe(true);
    // B's text was flushed on the way back too.
    expect(loadThreadDraft(store, 'b@x.in')?.body).toBe('to B');
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
    saveThreadDraft(store, 'ada@quantmail.in', {
      body: 'half-typed reply to Ada',
      newTopic: false,
      customSubject: '',
      updatedAt: 1,
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
    saveThreadDraft(store, 'ada@quantmail.in', {
      body: 'body under a new topic',
      newTopic: true,
      customSubject: 'Weekend plans',
      updatedAt: 1,
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
    saveThreadDraft(store, 'ada@quantmail.in', {
      body: 'stored draft',
      newTopic: false,
      customSubject: '',
      updatedAt: 1,
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
});
