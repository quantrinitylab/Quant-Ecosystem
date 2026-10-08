// @vitest-environment jsdom
//
// QM-CHAT-001 — P0 regression test: /chat/[id] crashed universally with
// "Cannot read properties of undefined (reading 'find')" because the backend
// conversations endpoints returned raw Prisma records with NO `participants`
// array while the page called `conversation.participants.find(...)` unguarded.
//
// The page must render (with a neutral "Chat" fallback title) even when the
// conversation object carries no participants at all.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The conversation under test: shaped exactly like the raw backend response
// BEFORE the QM-CHAT-001 backend fix — no `participants` key at all.
const conversationState = vi.hoisted(() => ({
  conversation: null as unknown,
}));

vi.mock('../hooks/useChatSocket', () => ({
  useChatSocket: () => ({ subscribe: vi.fn(), send: vi.fn(), connectionState: 'open' }),
}));

vi.mock('../hooks/useMessages', () => ({
  useMessages: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('../hooks/useSendMessage', () => ({
  useSendMessage: () => ({ mutate: vi.fn() }),
}));

vi.mock('../hooks/useRealtimeChat', () => ({
  useRealtimeChat: () => ({
    typingUsers: [],
    incomingMessages: [],
    isConnected: true,
    sendRealtimeMessage: vi.fn(),
    setTyping: vi.fn(),
    markRead: vi.fn(),
  }),
}));

vi.mock('../hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: conversationState.conversation ? [conversationState.conversation] : [],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../hooks/useMe', () => ({
  useMe: () => ({ me: { id: 'self', username: 'self' }, isLoading: false, error: null }),
}));

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
  const motion = new Proxy({}, { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') });
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});

vi.mock('@quant/shared-ui', () => ({
  ChatBubble: () => React.createElement('div', { 'data-testid': 'bubble' }),
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
vi.mock('../components/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }));
vi.mock('../components/chat/AIAgentPanel', () => ({ AIAgentPanel: () => null }));
vi.mock('../components/chat/ReplySuggestions', () => ({ ReplySuggestions: () => null }));
vi.mock('../components/games/GameLauncher', () => ({ GameLauncher: () => null }));
vi.mock('../components/chat/DisappearingMessage', () => ({ DisappearingMessage: () => null }));
vi.mock('../components/chat/DisappearingTimerPicker', () => ({ DisappearingTimerPicker: () => null }));
vi.mock('../components/DisappearingTimer', () => ({ default: () => null }));

// Imported after mocks are registered.
import ChatPage from '../app/chat/[id]/page';

async function renderPage(container: HTMLElement, root: Root, id: string) {
  await act(async () => {
    root.render(
      React.createElement(
        Suspense,
        { fallback: null },
        React.createElement(ChatPage, { params: Promise.resolve({ id }) }),
      ),
    );
  });
}

describe('QM-CHAT-001: /chat/[id] never crashes on missing participants', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    conversationState.conversation = null;
  });

  it('renders with a "Chat" fallback when participants is undefined (raw backend shape)', async () => {
    conversationState.conversation = { id: 'c1', name: null };
    await renderPage(container, root, 'c1');
    const topBar = container.querySelector('[data-testid="top-bar"]');
    expect(topBar).not.toBeNull();
    expect(topBar?.textContent).toBe('Chat');
  });

  it('renders with a "Chat" fallback when participants is null', async () => {
    conversationState.conversation = { id: 'c1', name: null, participants: null };
    await renderPage(container, root, 'c1');
    const topBar = container.querySelector('[data-testid="top-bar"]');
    expect(topBar).not.toBeNull();
    expect(topBar?.textContent).toBe('Chat');
  });

  it('resolves the other participant name when participants are present', async () => {
    conversationState.conversation = {
      id: 'c1',
      name: null,
      participants: [
        { userId: 'self', username: 'self', displayName: 'Self' },
        { userId: 'u2', username: 'museqatest', displayName: 'Muse QA', nickname: 'Tester' },
      ],
    };
    await renderPage(container, root, 'c1');
    const topBar = container.querySelector('[data-testid="top-bar"]');
    expect(topBar).not.toBeNull();
    expect(topBar?.textContent).toBe('Tester');
  });

  it('prefers the group name when set', async () => {
    conversationState.conversation = { id: 'c1', name: '  Team Chat  ' };
    await renderPage(container, root, 'c1');
    const topBar = container.querySelector('[data-testid="top-bar"]');
    expect(topBar?.textContent).toBe('Team Chat');
  });
});
