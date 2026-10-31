// @vitest-environment jsdom
// ============================================================================
// CODEX corrective for PR #1562 (delta 6390449413): the thread contact card
// lied on lookup failure and reconciled creates across email changes.
//
// These tests drive the real ContactProfileInspector (createRoot + act, the
// same harness as DockedComposer* suites — no @testing-library/react in this
// package) through the exact failure modes:
//
// 1. Lookup 401 / 5xx / throw -> honest UNKNOWN state, never "Add to
//    Contacts" (which asserts "not saved"), with a working retry.
// 2. Email change mid-create -> the stale create's success is discarded;
//    B's card never receives A's savedContactId.
// 3. 409 reconciliation is keyed to the requested email: it lands on Edit
//    only while that email is still the card's email; a stale 409 (email
//    changed mid-flight) is discarded even when its re-search finds A.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const mocks = vi.hoisted(() => ({
  searchContacts: vi.fn(),
  createContact: vi.fn(),
}));

vi.mock('../../services/api-client', () => ({
  apiClient: {
    searchContacts: mocks.searchContacts,
    createContact: mocks.createContact,
  },
}));

import { ContactProfileInspector } from '../GroupInfoModal';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const EMAIL_A = 'ada@example.com';
const EMAIL_B = 'bea@example.com';
const CONTACT_A = 'contact-a-id';

type SearchResult =
  | { success: true; data: Array<{ id: string; email: string }> }
  | { success: false; error: { code: string; message: string; statusCode: number } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function unsaved(): SearchResult {
  return { success: true, data: [] };
}

function savedA(): SearchResult {
  return { success: true, data: [{ id: CONTACT_A, email: EMAIL_A }] };
}

function failed(statusCode: number): SearchResult {
  return {
    success: false,
    error: { code: 'ERR', message: 'lookup failed', statusCode },
  };
}

describe('ContactProfileInspector lookup/create keying', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  // Swappable search behaviour so a test can change what the backend
  // returns between phases (e.g. unsaved at lookup time, saved at 409
  // re-search time) without re-mocking mid-flight.
  let searchImpl: (query: string) => Promise<SearchResult> = () =>
    Promise.resolve(unsaved());

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.clearAllMocks();
    window.localStorage.clear();
    searchImpl = () => Promise.resolve(unsaved());
  });

  function renderCard(email: string) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <ContactProfileInspector
          open
          email={email}
          name={email === EMAIL_A ? 'Ada' : 'Bea'}
          messages={[]}
          onClose={() => {}}
        />,
      );
    });
    return container;
  }

  function rerenderCard(email: string) {
    act(() => {
      root!.render(
        <ContactProfileInspector
          open
          email={email}
          name={email === EMAIL_A ? 'Ada' : 'Bea'}
          messages={[]}
          onClose={() => {}}
        />,
      );
    });
  }

  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  function text() {
    return container?.textContent ?? '';
  }

  function html() {
    return container?.innerHTML ?? '';
  }

  function findButton(label: string) {
    return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      (button.textContent ?? '').includes(label),
    );
  }

  function clickButton(label: string) {
    const button = findButton(label);
    expect(button).toBeDefined();
    act(() => {
      button!.click();
    });
  }

  it('a 401 lookup renders unknown — never Add — and retry recovers to Add', async () => {
    searchImpl = () => Promise.resolve(failed(401));
    mocks.searchContacts.mockImplementation((query: string) => searchImpl(query));
    renderCard(EMAIL_A);
    await flush();

    expect(text()).toContain('already saved');
    expect(text()).not.toContain('Add to Contacts');
    expect(text()).not.toContain('Edit Contact');

    // Retry with a healthy backend: the card may now honestly say Add.
    searchImpl = () => Promise.resolve(unsaved());
    clickButton('Try again');
    await flush();
    expect(text()).toContain('Add to Contacts');
    expect(text()).not.toContain('already saved');
  });

  it('a 500 lookup renders unknown, never Add', async () => {
    mocks.searchContacts.mockImplementation(() => Promise.resolve(failed(500)));
    renderCard(EMAIL_A);
    await flush();

    expect(text()).toContain('already saved');
    expect(text()).not.toContain('Add to Contacts');
    expect(text()).not.toContain('Edit Contact');
  });

  it('a throwing lookup (timeout surfacing as a rejection) renders unknown', async () => {
    mocks.searchContacts.mockImplementation(() =>
      Promise.reject(new Error('timeout')),
    );
    renderCard(EMAIL_A);
    await flush();

    expect(text()).toContain('already saved');
    expect(text()).not.toContain('Add to Contacts');
  });

  it('email change mid-create discards the stale success: B never gets A’s id', async () => {
    mocks.searchContacts.mockImplementation((query: string) => searchImpl(query));
    const createGate = deferred<{
      success: boolean;
      data: { id: string };
    }>();
    mocks.createContact.mockImplementation(() => createGate.promise);

    renderCard(EMAIL_A);
    await flush();
    expect(text()).toContain('Add to Contacts');

    clickButton('Add to Contacts');
    await flush();
    expect(text()).toContain('Adding…');

    // The card moves to B while A's create is still in flight.
    rerenderCard(EMAIL_B);
    await flush();
    expect(text()).toContain('Add to Contacts');
    expect(text()).not.toContain('Adding…');

    // A's create now succeeds — it must not touch B's card.
    createGate.resolve({ success: true, data: { id: CONTACT_A } });
    await flush();
    expect(html()).not.toContain(CONTACT_A);
    expect(text()).not.toContain('Saved to Contacts');
    expect(text()).not.toContain('Edit Contact');
    expect(text()).toContain('Add to Contacts');
    expect(mocks.createContact).toHaveBeenCalledWith(
      expect.objectContaining({ email: EMAIL_A }),
    );
  });

  it('a 409 for the current email reconciles to Edit Contact', async () => {
    mocks.searchContacts.mockImplementation((query: string) => searchImpl(query));
    mocks.createContact.mockImplementation(() =>
      Promise.resolve({
        success: false,
        error: { code: 'CONFLICT', message: 'already exists', statusCode: 409 },
      }),
    );

    renderCard(EMAIL_A);
    await flush();
    expect(text()).toContain('Add to Contacts');

    // Between the click and the 409 re-search, the contact appears (added
    // from another card) — the re-search must find it for THIS email.
    searchImpl = () => Promise.resolve(savedA());
    clickButton('Add to Contacts');
    await flush();

    expect(text()).toContain('Saved to Contacts');
    expect(text()).toContain('Edit Contact');
    expect(html()).toContain(`/contacts?contact=${CONTACT_A}`);
  });

  it('a stale 409 is discarded when the email changed mid-flight', async () => {
    mocks.searchContacts.mockImplementation((query: string) => searchImpl(query));
    const createGate = deferred<{
      success: boolean;
      error: { code: string; message: string; statusCode: number };
    }>();
    mocks.createContact.mockImplementation(() => createGate.promise);

    renderCard(EMAIL_A);
    await flush();
    clickButton('Add to Contacts');
    await flush();

    // Card moves to B; the 409 re-search for A will find A's contact, but
    // the card is B's now, so that reconciliation must not apply.
    rerenderCard(EMAIL_B);
    await flush();
    searchImpl = (query: string) =>
      Promise.resolve(query === EMAIL_A ? savedA() : unsaved());
    createGate.resolve({
      success: false,
      error: { code: 'CONFLICT', message: 'already exists', statusCode: 409 },
    });
    await flush();

    expect(html()).not.toContain(CONTACT_A);
    expect(text()).not.toContain('Saved to Contacts');
    expect(text()).toContain('Add to Contacts');
  });
});
