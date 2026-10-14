// @vitest-environment jsdom
//
// QC-F-309 (Slice 1) — thread-level link honesty.
//
// The thread used to fabricate link metadata: `detectLink` invented a title
// ("Link from <hostname>") and a description ("Shared content from
// <hostname>") out of the URL alone and LinkPreviewCard rendered them as if
// they were the page's real title/description. No fetch ever happened.
// Slice 1: the extractor returns only the real URL, and the REAL
// LinkPreviewCard (deliberately NOT mocked in this file — every sibling
// suite mocks it) renders only hostname + full URL.
//
// Both message paths are pinned: history (useMessages mapping) and realtime
// (useRealtimeChat incomingMessages mapping) — fixing one call-site and
// forgetting the other would leave half the fabrication live.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Module-level stable fixture state (hoisted, mutated per test before
// render). Fresh-identity mocks are avoided on purpose — stable identities
// keep the page's effects from looping.
const historyState = vi.hoisted(() => ({ data: [] as Record<string, unknown>[] }));
const realtimeState = vi.hoisted(() => ({ incoming: [] as Record<string, unknown>[] }));

vi.mock('../hooks/useChatSocket', () => ({
  useChatSocket: () => ({ subscribe: vi.fn(), send: vi.fn(), connectionState: 'open' }),
}));

vi.mock('../hooks/useMessages', () => ({
  useMessages: () => ({ data: historyState.data, isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('../hooks/useSendMessage', () => ({
  useSendMessage: () => ({ mutate: vi.fn() }),
}));

vi.mock('../hooks/useRealtimeChat', () => ({
  useRealtimeChat: () => ({
    typingUsers: [],
    incomingMessages: realtimeState.incoming,
    isConnected: true,
    sendRealtimeMessage: vi.fn(),
    setTyping: vi.fn(),
    markRead: vi.fn(),
  }),
}));

vi.mock('../hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [{ id: 'c1', name: null, participants: [] }],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../hooks/useMe', () => ({
  useMe: () => ({ me: { id: 'self', username: 'self' }, isLoading: false, error: null }),
}));

vi.mock('@quant/brand', () => ({ spring: { gentle: {}, snappy: {}, stiff: {} } }));

vi.mock('framer-motion', () => {
  const SAFE = /^(className|id|children|role|onClick|style|href|target|rel)$|^(aria-|data-)/;
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
      const out: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (SAFE.test(key)) out[key] = props[key];
      }
      return React.createElement(tag, out, props.children as React.ReactNode);
    });
  const motion = new Proxy({}, { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') });
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});

// ChatBubble surfaces message/timestamp/status as data attributes so H7 can
// pin that the link card never eats the rest of the message rendering.
vi.mock('@quant/shared-ui', () => ({
  ChatBubble: ({
    message,
    sender,
    timestamp,
    status,
  }: {
    message: string;
    sender: string;
    timestamp?: string;
    status?: string;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'bubble',
        'data-message': message,
        'data-sender': sender,
        'data-timestamp': timestamp,
        'data-status': status,
      },
      message,
    ),
  ChatInput: () => React.createElement('div', { 'data-testid': 'chat-input' }),
  TypingIndicator: () => React.createElement('div', { 'data-testid': 'typing' }),
  TopBar: ({ title }: { title?: string }) =>
    React.createElement('div', { 'data-testid': 'top-bar' }, title),
  LoadingState: () => React.createElement('div', { 'data-testid': 'loading' }),
  ErrorState: () => React.createElement('div', { 'data-testid': 'error' }),
  EmptyState: () => React.createElement('div', { 'data-testid': 'empty' }),
}));

vi.mock('../components/ReactionPicker', () => ({ ReactionPicker: () => null }));
vi.mock('../components/VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
// NOTE: ../components/LinkPreviewCard is intentionally NOT mocked — the real
// card is the subject of this file (buildprep §6.1).
vi.mock('../components/chat/AIAgentPanel', () => ({ AIAgentPanel: () => null }));
vi.mock('../components/chat/ReplySuggestions', () => ({ ReplySuggestions: () => null }));
vi.mock('../components/games/GameLauncher', () => ({ GameLauncher: () => null }));
vi.mock('../components/chat/DisappearingMessage', () => ({
  DisappearingMessage: ({ children }: { children?: React.ReactNode }) => children,
}));
vi.mock('../components/chat/DisappearingTimerPicker', () => ({ DisappearingTimerPicker: () => null }));
vi.mock('../components/DisappearingTimer', () => ({ default: () => null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Imported after mocks are registered.
import ChatPage from '../app/chat/[id]/page';

const LINK_URL = 'https://example.com/asal-page?x=1';
const LINK_CONTENT = `Dekho ${LINK_URL} abhi`;

describe('QC-F-309: thread link cards never fabricate metadata', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    historyState.data = [];
    realtimeState.incoming = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  async function renderPage() {
    await act(async () => {
      root.render(
        React.createElement(
          Suspense,
          { fallback: null },
          React.createElement(ChatPage, { params: Promise.resolve({ id: 'c1' }) }),
        ),
      );
    });
  }

  function linkAnchors(): HTMLAnchorElement[] {
    return Array.from(container.querySelectorAll('a')).filter((a) =>
      (a.getAttribute('href') ?? '').startsWith('http'),
    );
  }

  it('H1: history message renders an honest card (hostname + full URL) and no fabricated text anywhere', async () => {
    historyState.data = [
      { id: 'm1', message: LINK_CONTENT, senderId: 'u2', timestamp: '10:00', type: 'text' },
    ];
    await renderPage();
    const anchors = linkAnchors();
    expect(anchors.length).toBe(1);
    expect(anchors[0].textContent).toContain('example.com');
    expect(anchors[0].textContent).toContain(LINK_URL);
    expect(container.textContent).not.toContain('Link from');
    expect(container.textContent).not.toContain('Shared content from');
  });

  it('H2: realtime incoming message renders the same honest card, no fabricated text', async () => {
    realtimeState.incoming = [
      { id: 'r1', content: LINK_CONTENT, senderId: 'u2', timestamp: '10:05', type: 'text' },
    ];
    await renderPage();
    const anchors = linkAnchors();
    expect(anchors.length).toBe(1);
    expect(anchors[0].textContent).toContain('example.com');
    expect(anchors[0].textContent).toContain(LINK_URL);
    expect(container.textContent).not.toContain('Link from');
    expect(container.textContent).not.toContain('Shared content from');
  });

  it('H3: a plain text message renders no link card at all', async () => {
    historyState.data = [
      { id: 'm1', message: 'koi link nahi hai isme', senderId: 'u2', timestamp: '10:00', type: 'text' },
    ];
    await renderPage();
    expect(linkAnchors().length).toBe(0);
    expect(container.querySelector('[data-testid="bubble"]')).not.toBeNull();
  });

  it('H4: the card anchor href is exactly the URL shown on the card', async () => {
    historyState.data = [
      { id: 'm1', message: LINK_CONTENT, senderId: 'u2', timestamp: '10:00', type: 'text' },
    ];
    await renderPage();
    const anchors = linkAnchors();
    expect(anchors.length).toBe(1);
    expect(anchors[0].getAttribute('href')).toBe(LINK_URL);
    expect(anchors[0].textContent).toContain(LINK_URL);
  });

  it('H5: with two URLs in one message, the card is for the first URL only', async () => {
    const first = 'https://first.example.com/ek';
    const second = 'https://second.example.com/do';
    historyState.data = [
      { id: 'm1', message: `pehla ${first} dusra ${second}`, senderId: 'u2', timestamp: '10:00', type: 'text' },
    ];
    await renderPage();
    const anchors = linkAnchors();
    expect(anchors.length).toBe(1);
    expect(anchors[0].getAttribute('href')).toBe(first);
    expect(anchors[0].textContent).toContain('first.example.com');
    expect(anchors[0].textContent).not.toContain('second.example.com');
  });

  it('H6: a malformed URL fragment does not crash the page render', async () => {
    historyState.data = [
      { id: 'm1', message: 'ye dekho https://[bina-band wala link', senderId: 'u2', timestamp: '10:00', type: 'text' },
    ];
    await renderPage();
    // Page rendered (bubble present); any card present must not carry
    // fabricated metadata either.
    expect(container.querySelector('[data-testid="bubble"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Link from');
    expect(container.textContent).not.toContain('Shared content from');
  });

  it('H7: the rest of the message rendering (text, timestamp, status) is unchanged alongside the card', async () => {
    historyState.data = [
      { id: 'm1', message: LINK_CONTENT, senderId: 'self', createdAt: '2026-10-14T04:00:00.000Z', type: 'text', status: 'sent' },
    ];
    await renderPage();
    const bubble = container.querySelector('[data-testid="bubble"]');
    expect(bubble).not.toBeNull();
    expect(bubble?.getAttribute('data-message')).toBe(LINK_CONTENT);
    expect(bubble?.getAttribute('data-timestamp')).toBeTruthy();
    expect(bubble?.getAttribute('data-status')).toBe('sent');
    expect(linkAnchors().length).toBe(1);
  });
});
