// @vitest-environment jsdom
//
// Feature: quantchat-launch-readiness, Property 7: No mock leakage
//
// Task 21.2 (W4) — Property 7 verification for the QuantChat frontend.
//
// Two complementary layers of evidence prove "no mock leakage":
//   1. A SOURCE GUARD that reads the shipped page modules and asserts the
//      removed mock symbols (`getPresenceForIndex`, `getStatusForMessage`,
//      the `ChatStreakHeader` fixture) are gone and that the live hooks
//      (`usePresence`, `useConversations`, `useChatSocket`) are wired in.
//   2. A RENDER test that mounts the real `ChatListPage` with a known live
//      backend presence map (from `usePresence`) and asserts the presence
//      indicators rendered equal that live backend presence exactly — and that
//      an unresolved user renders `unknown`, never optimistically `online`.
//
// Validates: Requirements 11.1
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Layer 1 — source guard (greps the shipped component source)
// ---------------------------------------------------------------------------

// Resolve a repo source file regardless of whether the suite runs with the cwd
// at the quantchat app or at the monorepo root.
function readAppSource(relFromApp: string): string {
  const candidates = [
    resolve(process.cwd(), relFromApp),
    resolve(process.cwd(), 'apps/quantchat', relFromApp),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return readFileSync(found, 'utf8');
}

const listPageSource = readAppSource('src/app/page.tsx');
const chatPageSource = readAppSource('src/app/chat/[id]/page.tsx');

describe('Property 7: No mock leakage — source guard', () => {
  it('Feature: quantchat-launch-readiness, Property 7: No mock leakage — getPresenceForIndex is absent from the conversation list page', () => {
    expect(listPageSource).not.toContain('getPresenceForIndex');
  });

  it('Feature: quantchat-launch-readiness, Property 7: No mock leakage — the index-based delivery-status mock (getStatusForMessage) is absent from the chat page', () => {
    expect(chatPageSource).not.toContain('getStatusForMessage');
  });

  it('Feature: quantchat-launch-readiness, Property 7: No mock leakage — the dead ChatStreakHeader fixture is absent', () => {
    expect(listPageSource).not.toContain('ChatStreakHeader');
    expect(chatPageSource).not.toContain('ChatStreakHeader');
  });

  it('Feature: quantchat-launch-readiness, Property 7: No mock leakage — the conversation list renders presence from the live usePresence hook', () => {
    expect(listPageSource).toMatch(
      /import\s*\{[^}]*usePresence[^}]*\}\s*from\s*['"][^'"]*usePresence['"]/,
    );
    expect(listPageSource).toContain('usePresence(memberIds)');
    // The list is bound to the live conversations API + shared chat socket.
    expect(listPageSource).toContain('useConversations()');
    expect(listPageSource).toContain('useChatSocket(');
  });

  it('Feature: quantchat-launch-readiness, Property 7: No mock leakage — the chat page derives delivery ticks from real socket events, not an index', () => {
    expect(chatPageSource).toContain('message:delivered');
    expect(chatPageSource).toContain('message:read');
    expect(chatPageSource).toContain('useChatSocket(');
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — render the real ChatListPage and assert rendered presence equals
// the live backend presence returned by usePresence.
// ---------------------------------------------------------------------------

// A live backend presence snapshot, keyed by user id. Each conversation below
// has exactly one member so its rendered dot maps 1:1 to this map.
const livePresence: Record<string, 'online' | 'away' | 'offline' | 'unknown'> = {
  'user-online': 'online',
  'user-away': 'away',
  'user-offline': 'offline',
  'user-unknown': 'unknown',
};

const conversationsFixtureShape = [
  { id: 'c-online', name: 'Ada', participants: [{ userId: 'user-online' }], unreadCount: 0 },
  { id: 'c-away', name: 'Babbage', participants: [{ userId: 'user-away' }], unreadCount: 0 },
  { id: 'c-offline', name: 'Curie', participants: [{ userId: 'user-offline' }], unreadCount: 0 },
  { id: 'c-unknown', name: 'Dijkstra', participants: [{ userId: 'user-unknown' }], unreadCount: 0 },
];

vi.mock('../hooks/usePresence', () => ({
  // Return the live backend presence snapshot directly — the page must render
  // exactly these statuses and never fabricate one.
  usePresence: () => livePresence,
}));

vi.mock('../hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: conversationsFixtureShape,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../hooks/useChatSocket', () => ({
  useChatSocket: () => ({ subscribe: vi.fn(), send: vi.fn(), connectionState: 'open' }),
}));

vi.mock('../lib/navigation', () => ({ navItems: [], routes: {} }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@quant/brand', () => ({ spring: { gentle: {}, snappy: {}, stiff: {} } }));

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style)$|^(aria-|data-)/;
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
      const out: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (SAFE.test(key)) out[key] = props[key];
      }
      return React.createElement(tag, out, props.children as React.ReactNode);
    });
  const motion = new Proxy(
    {},
    { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    useMotionValue: () => ({ get: () => 0, set: () => {}, on: () => () => {} }),
    useTransform: () => ({ get: () => 0, set: () => {}, on: () => () => {} }),
  };
});

vi.mock('@quant/shared-ui', () => ({
  AppShell: ({ topBar, children }: { topBar?: React.ReactNode; children?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'app-shell' }, topBar, children),
  TopBar: ({ title }: { title?: string }) =>
    React.createElement('div', { 'data-testid': 'top-bar' }, title),
  BottomNav: () => React.createElement('div', { 'data-testid': 'bottom-nav' }),
  ChatList: () => React.createElement('div', { 'data-testid': 'chat-list' }),
  LoadingState: ({ text }: { text?: string }) =>
    React.createElement('div', { 'data-testid': 'loading' }, text),
  ErrorState: ({ message }: { message?: string }) =>
    React.createElement('div', { 'data-testid': 'error' }, message),
  EmptyState: ({ title }: { title?: string }) =>
    React.createElement('div', { 'data-testid': 'empty' }, title),
}));

// Imported after the mocks above are registered.
import ChatListPage from '../app/page';

async function renderPage(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

describe('Property 7: No mock leakage — rendered presence equals live backend presence', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(async () => {
    const mounted = await renderPage(React.createElement(ChatListPage));
    container = mounted.container;
    root = mounted.root;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
  });

  it('Feature: quantchat-launch-readiness, Property 7: No mock leakage — every rendered presence indicator equals the live backend status for that conversation member', () => {
    // Presence dots expose their status via aria-label (see PresenceDot).
    const labels = Array.from(container.querySelectorAll('span[aria-label]')).map((el) =>
      el.getAttribute('aria-label'),
    );

    // One dot per conversation, in conversation order.
    expect(labels).toEqual(['online', 'away', 'offline', 'unknown']);
    // The rendered set equals the live backend presence values exactly.
    expect(new Set(labels)).toEqual(new Set(Object.values(livePresence)));
  });

  it('Feature: quantchat-launch-readiness, Property 7: No mock leakage — an unresolved member renders `unknown`, never optimistically `online`', () => {
    const labels = Array.from(container.querySelectorAll('span[aria-label]')).map((el) =>
      el.getAttribute('aria-label'),
    );
    // Exactly one unknown (the unresolved member); it is not shown as online.
    expect(labels.filter((l) => l === 'unknown')).toHaveLength(1);
    expect(labels.filter((l) => l === 'online')).toHaveLength(1);
  });
});
