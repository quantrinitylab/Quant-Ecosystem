// @vitest-environment jsdom
// ============================================================================
// QC-F-397 — /new-chat people-search: sirf sabse taaza search ka jawab hi
// state badlega; deferred promises se out-of-order resolution deterministic
// hai.
// ============================================================================
// runSearch pehle har jawab ko bina sequence jaanch ke seedha state me
// daalta tha — dheere type karne par kai searches hawa me hoti hain aur
// purani query ka der se aaya jawab/error/finally nayi list ko overwrite,
// dhak ya beech me tappable bana sakta tha. Fix: badhta sequence-token
// (har invocation, khaali-query samet), latest-error par contacts saaf,
// unmount par invalidate + debounce clear. apiClient aparivartit hai.
// NC signature (original code par): T397-01/02/03/05/06 FAIL,
// T397-04/07/08 control-PASS.
// Harness: createRoot + stable module-level mocks (qc-f-321 pattern);
// searchUsers deferred kataar par hai taaki test apne chune kram me
// resolve/reject kar sake.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  searchUsers: vi.fn(),
  getMessageRequestsSent: vi.fn(),
  sendMessageRequest: vi.fn(),
}));

const searchHarness = vi.hoisted(() => ({
  calls: [] as Array<{
    query: string;
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
  }>,
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    createConversation: apiMocks.createConversation,
    searchUsers: apiMocks.searchUsers,
    getMessageRequestsSent: apiMocks.getMessageRequestsSent,
    sendMessageRequest: apiMocks.sendMessageRequest,
  },
}));

const routerMocks = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ children, topBar }: { children: React.ReactNode; topBar?: React.ReactNode }) => (
    <div>
      {topBar}
      {children}
    </div>
  ),
  TopBar: ({ title }: { title: string }) => <div>{title}</div>,
  BottomNav: () => null,
  useAuth: () => ({ user: { id: 'user_me', displayName: 'Me', username: 'me' } }),
  LoadingState: ({ text }: { text?: string }) => <div>{text ?? 'loading'}</div>,
  ErrorState: ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
    <div>
      <div role="alert">{message}</div>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
}));

import NewChatPage from '../app/new-chat/page';

const AARON = {
  id: 'user_aaron',
  username: 'aaron',
  displayName: 'Aaron A',
  avatarUrl: null,
  bio: null,
};
const BINA = {
  id: 'user_bina',
  username: 'bina',
  displayName: 'Bina B',
  avatarUrl: null,
  bio: null,
};
const TARA = {
  id: 'user_tara',
  username: 'tara',
  displayName: 'Tara Target',
  avatarUrl: null,
  bio: null,
};
const SELF = {
  id: 'user_me',
  username: 'me',
  displayName: 'Me Myself',
  avatarUrl: null,
  bio: null,
};

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

async function settle(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

describe('QC-F-397 new-chat search race (sequence guard)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    vi.clearAllMocks();
    searchHarness.calls.length = 0;
    apiMocks.searchUsers.mockImplementation(
      (q: string) =>
        new Promise((resolve, reject) => {
          searchHarness.calls.push({ query: q, resolve, reject });
        }),
    );
    apiMocks.getMessageRequestsSent.mockResolvedValue({ success: true, data: [] });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  async function renderPage() {
    await act(async () => {
      root.render(<NewChatPage />);
    });
    await settle(10);
  }

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function searchInput() {
    return container.querySelector<HTMLInputElement>('#new-chat-search')!;
  }

  async function typeAndFire(value: string) {
    const before = searchHarness.calls.length;
    await act(async () => {
      setValue(searchInput(), value);
    });
    await settle(450); // debounce 350ms paar
    expect(
      searchHarness.calls.length,
      `search '${value}' asal me in-flight honi chahiye`,
    ).toBe(before + 1);
    expect(searchHarness.calls[before].query).toBe(value);
  }

  async function resolveCall(i: number, data: unknown[]) {
    await act(async () => {
      searchHarness.calls[i].resolve({ success: true, data });
    });
    await settle(10);
  }

  async function rejectCall(i: number, message: string) {
    await act(async () => {
      searchHarness.calls[i].reject(new Error(message));
    });
    await settle(10);
  }

  it('T397-01. stale success der se aaye to taaza list overwrite NAHI hoti', async () => {
    await renderPage();
    await typeAndFire('a');
    await typeAndFire('ab');
    expect(searchHarness.calls.length).toBe(2);
    await resolveCall(1, [BINA]);
    expect(container.textContent).toContain('Bina B');
    expect(container.textContent).not.toContain('Aaron A');
    await resolveCall(0, [AARON]);
    expect(container.textContent).toContain('Bina B');
    expect(container.textContent).not.toContain('Aaron A');
  });

  it('T397-02. stale error naye safal results ko NAHI dhakta', async () => {
    await renderPage();
    await typeAndFire('a');
    await typeAndFire('ab');
    expect(searchHarness.calls.length).toBe(2);
    await resolveCall(1, [BINA]);
    await rejectCall(0, 'boom-a');
    expect(container.textContent).not.toContain('boom-a');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain('Bina B');
  });

  it('T397-03. stale finally spinner NAHI giraata aur stale success beech me NAHI dikhta', async () => {
    await renderPage();
    await typeAndFire('a');
    await typeAndFire('ab');
    expect(searchHarness.calls.length).toBe(2);
    await resolveCall(0, [AARON]);
    expect(container.textContent).toContain('Searching people…');
    expect(container.textContent).not.toContain('Aaron A');
    await resolveCall(1, [BINA]);
    expect(container.textContent).not.toContain('Searching people…');
    expect(container.textContent).toContain('Bina B');
  });

  it('T397-04. control — latest error imaandaar ErrorState dikhata hai', async () => {
    await renderPage();
    await typeAndFire('zz');
    await rejectCall(0, 'network down');
    expect(container.textContent).toContain('network down');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Searching people…');
  });

  it('T397-05. box khaali karna in-flight search ko invalidate karta hai', async () => {
    await renderPage();
    await typeAndFire('a');
    await act(async () => {
      setValue(searchInput(), '');
    });
    await settle(450);
    expect(searchHarness.calls.length).toBe(1);
    await resolveCall(0, [AARON]);
    expect(container.textContent).not.toContain('Aaron A');
    expect(container.textContent).toContain('Find people to chat with');
  });

  it('T397-06. group-mode me bhi wahi guard — galat list se selection NAHI banta', async () => {
    await renderPage();
    const groupBtn = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('New group'),
    )!;
    expect(groupBtn, 'New group entry button').toBeTruthy();
    await act(async () => {
      groupBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(10);
    await typeAndFire('a');
    await typeAndFire('ab');
    expect(searchHarness.calls.length).toBe(2);
    await resolveCall(1, [BINA]);
    await resolveCall(0, [AARON]);
    expect(container.textContent).toContain('Bina B');
    expect(container.textContent).not.toContain('Aaron A');
    const binaRow = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Bina B'),
    )!;
    expect(binaRow, 'Bina row').toBeTruthy();
    await act(async () => {
      binaRow.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(10);
    expect(container.textContent).toContain('1 member selected');
    const binaRowAfter = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Bina B'),
    )!;
    expect(binaRowAfter.getAttribute('aria-pressed')).toBe('true');
  });

  it('T397-07. control — aam safal raasta + self-filter aparivartit', async () => {
    await renderPage();
    await typeAndFire('ta');
    await resolveCall(0, [SELF, TARA]);
    expect(container.textContent).toContain('Tara Target');
    expect(container.textContent).not.toContain('Me Myself');
    expect(container.textContent).not.toContain('Searching people…');
  });

  it('T397-08. control — Retry ek taaza invocation hai aur guard use NAHI todta', async () => {
    await renderPage();
    await typeAndFire('ta');
    await rejectCall(0, 'search boom');
    expect(container.textContent).toContain('search boom');
    const retryBtn = [...container.querySelectorAll('button')].find(
      (b) => (b.textContent ?? '').trim() === 'Retry',
    )!;
    expect(retryBtn, 'Retry button').toBeTruthy();
    await act(async () => {
      retryBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await settle(10);
    expect(searchHarness.calls.length).toBe(2);
    expect(searchHarness.calls[1].query).toBe('ta');
    await resolveCall(1, [TARA]);
    expect(container.textContent).toContain('Tara Target');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
