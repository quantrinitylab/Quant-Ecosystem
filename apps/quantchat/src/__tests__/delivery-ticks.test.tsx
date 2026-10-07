// @vitest-environment jsdom
//
// Task 21.2 (W4) — delivery-tick rendering for the QuantChat chat view.
//
// Asserts the chat view renders sent / delivered / read indicators driven by
// REAL `message:delivered` / `message:read` socket events (never an index-based
// mock), and that the status rank is monotonic: read > delivered > sent, with
// NO downgrade when events arrive out of order.
//
// Requirements: 12.5
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Capture the inbound socket-event handler the chat page registers via
// useChatSocket(handleDeliveryEvent) so the test can dispatch real events.
const socket = vi.hoisted(() => ({
  handler: null as ((event: unknown) => void) | null,
}));

vi.mock('../hooks/useChatSocket', () => ({
  useChatSocket: (onEvent?: (event: unknown) => void) => {
    if (onEvent) socket.handler = onEvent;
    return { subscribe: vi.fn(), send: vi.fn(), connectionState: 'open' };
  },
}));

vi.mock('../hooks/useMessages', () => ({
  useMessages: () => ({
    data: [
      { id: 'm1', message: 'first', sender: 'self', timestamp: '10:00', type: 'text' },
      { id: 'm2', message: 'second', sender: 'self', timestamp: '10:01', type: 'text' },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
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
  useConversations: () => ({ conversations: [], isLoading: false, error: null }),
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
  const motion = new Proxy(
    {},
    { get: (_t, tag: string) => make(typeof tag === 'string' ? tag : 'div') },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
  };
});

// ChatBubble surfaces the delivery status via a data attribute keyed by message
// content so the test can read the rendered tick for each message.
vi.mock('@quant/shared-ui', () => ({
  ChatBubble: ({ message, sender, status }: { message: string; sender: string; status?: string }) =>
    React.createElement('div', {
      'data-testid': 'bubble',
      'data-message': message,
      'data-sender': sender,
      'data-status': status,
    }),
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

// Imported after mocks are registered.
import ChatPage from '../app/chat/[id]/page';

function statusOf(container: HTMLElement, message: string): string | null {
  const bubble = container.querySelector(`[data-testid="bubble"][data-message="${message}"]`);
  return bubble?.getAttribute('data-status') ?? null;
}

async function dispatch(event: unknown) {
  await act(async () => {
    socket.handler?.(event);
  });
}

describe('Chat view delivery ticks from real socket events (Requirement 12.5)', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(async () => {
    socket.handler = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          Suspense,
          { fallback: null },
          React.createElement(ChatPage, { params: Promise.resolve({ id: 'c1' }) }),
        ),
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
  });

  it('registers an inbound socket handler and renders messages as `sent` before any receipt', () => {
    expect(typeof socket.handler).toBe('function');
    expect(statusOf(container, 'first')).toBe('sent');
    expect(statusOf(container, 'second')).toBe('sent');
  });

  it('advances sent -> delivered -> read from real message:delivered / message:read events', async () => {
    await dispatch({ type: 'message:delivered', data: { messageId: 'm1' } });
    expect(statusOf(container, 'first')).toBe('delivered');

    await dispatch({ type: 'message:read', data: { messageId: 'm1' } });
    expect(statusOf(container, 'first')).toBe('read');
  });

  it('does not downgrade `read` when a stale `message:delivered` arrives out of order', async () => {
    await dispatch({ type: 'message:read', data: { messageId: 'm1' } });
    expect(statusOf(container, 'first')).toBe('read');

    // Out-of-order, stale delivered receipt must NOT downgrade the tick.
    await dispatch({ type: 'message:delivered', data: { messageId: 'm1' } });
    expect(statusOf(container, 'first')).toBe('read');
  });

  it('does not downgrade `delivered` when a duplicate is replayed, and leaves other messages untouched', async () => {
    await dispatch({ type: 'message:delivered', data: { messageId: 'm2' } });
    expect(statusOf(container, 'second')).toBe('delivered');

    await dispatch({ type: 'message:delivered', data: { messageId: 'm2' } });
    expect(statusOf(container, 'second')).toBe('delivered');

    // m1 received no receipts and remains `sent`.
    expect(statusOf(container, 'first')).toBe('sent');
  });

  it('supports the payload-wrapped event envelope as well as the flat `data` envelope', async () => {
    await dispatch({ type: 'message:delivered', payload: { messageId: 'm1' } });
    expect(statusOf(container, 'first')).toBe('delivered');

    await dispatch({ payload: { type: 'message:read', messageId: 'm1' } });
    expect(statusOf(container, 'first')).toBe('read');
  });
});
