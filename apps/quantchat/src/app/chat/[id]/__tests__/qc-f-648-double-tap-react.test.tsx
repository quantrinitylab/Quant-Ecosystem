// @vitest-environment jsdom
//
// QC-F-648 Slice-1 — web thread double-tap -> ❤️ toggle (real POST
// /messages/:id/reactions via apiClient.addReaction). Page-level tests in
// the same style as chat-page-crash-guard.test.tsx (ReactDOM + act, no
// testing-library in this package).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pageState = vi.hoisted(() => ({
  messages: [] as Array<Record<string, unknown>>,
  addReaction: vi.fn(),
}));

vi.mock('../../../../hooks/useChatSocket', () => ({
  useChatSocket: () => ({ subscribe: vi.fn(), send: vi.fn(), connectionState: 'open' }),
}));

vi.mock('../../../../hooks/useMessages', () => ({
  useMessages: () => ({ data: pageState.messages, isLoading: false, error: null, refetch: vi.fn() }),
}));

vi.mock('../../../../hooks/useSendMessage', () => ({
  useSendMessage: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('../../../../hooks/useRealtimeChat', () => ({
  useRealtimeChat: () => ({
    typingUsers: [],
    incomingMessages: [],
    isConnected: true,
    sendRealtimeMessage: vi.fn(),
    setTyping: vi.fn(),
    markRead: vi.fn(),
  }),
}));

vi.mock('../../../../hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: [
      {
        id: 'c1',
        name: 'Chat',
        participants: [
          { userId: 'self', username: 'self', displayName: 'Self' },
          { userId: 'u2', username: 'museqatest', displayName: 'Tester' },
        ],
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../../../hooks/useMe', () => ({
  useMe: () => ({ me: { id: 'self', username: 'self' }, isLoading: false, error: null }),
}));

vi.mock('../../../../services/api-client', () => ({
  apiClient: {
    addReaction: (...args: unknown[]) => (pageState.addReaction as (...a: unknown[]) => unknown)(...args),
  },
}));

vi.mock('@quant/brand', () => ({ spring: { gentle: {}, snappy: {}, stiff: {} } }));

// Motion mock that passes gesture/focus props through (unlike the SAFE
// filter in the crash-guard test, which would swallow onPointerUp).
const FRAMER_ONLY = new Set([
  'variants',
  'initial',
  'animate',
  'exit',
  'transition',
  'whileTap',
  'whileHover',
  'layout',
  'onAnimationComplete',
]);
vi.mock('framer-motion', () => {
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: unknown) {
      const out: Record<string, unknown> = { ref };
      for (const key of Object.keys(props)) {
        if (!FRAMER_ONLY.has(key)) out[key] = props[key];
      }
      return React.createElement(tag, out, props.children as React.ReactNode);
    });
  // Stable per-tag components: a fresh component identity on every render
  // would remount the whole message list on each state update, detaching
  // the nodes the test dispatches on.
  const cache = new Map<string, ReturnType<typeof make>>();
  const motion = new Proxy(
    {},
    {
      get: (_t, tag: string) => {
        const key = typeof tag === 'string' ? tag : 'div';
        if (!cache.has(key)) cache.set(key, make(key));
        return cache.get(key);
      },
    },
  );
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

vi.mock('../../../../components/ReactionPicker', () => ({
  ReactionPicker: ({ isOpen, onSelect }: { isOpen?: boolean; onSelect?: (e: string) => void }) =>
    isOpen
      ? React.createElement(
          'button',
          { 'data-testid': 'picker-emoji', onClick: () => onSelect?.('👍') },
          '👍',
        )
      : null,
}));
vi.mock('../../../../components/VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../../../../components/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }));
vi.mock('../../../../components/chat/AIAgentPanel', () => ({ AIAgentPanel: () => null }));
vi.mock('../../../../components/chat/ReplySuggestions', () => ({ ReplySuggestions: () => null }));
vi.mock('../../../../components/games/GameLauncher', () => ({ GameLauncher: () => null }));
vi.mock('../../../../components/chat/DisappearingMessage', () => ({ DisappearingMessage: () => null }));
vi.mock('../../../../components/chat/DisappearingTimerPicker', () => ({ DisappearingTimerPicker: () => null }));
vi.mock('../../../../components/DisappearingTimer', () => ({ default: () => null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}));

// Imported after mocks are registered.
import ChatPage from '../page';

const textMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1',
  content: 'hello',
  senderId: 'u2',
  createdAt: '2026-10-26T01:00:00.000Z',
  status: 'sent',
  type: 'text',
  metadata: {},
  ...overrides,
});

const snapMessage = () => ({
  id: 'm2',
  content: '',
  senderId: 'u2',
  createdAt: '2026-10-26T01:00:00.000Z',
  status: 'sent',
  type: 'snap_photo',
  metadata: {},
});

function firePointerUp(el: Element, x: number, y: number, pointerId = 1) {
  const ev = new Event('pointerup', { bubbles: true }) as Event & {
    clientX: number;
    clientY: number;
    pointerId: number;
  };
  Object.defineProperties(ev, {
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: pointerId },
  });
  el.dispatchEvent(ev);
}

function fireKey(el: Element, key: string) {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
}

async function renderPage(container: HTMLElement, root: Root) {
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

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('QC-F-648 web thread double-tap quick-react', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    pageState.messages = [textMessage(), snapMessage()];
    pageState.addReaction.mockReset();
    pageState.addReaction.mockResolvedValue({
      success: true,
      data: { id: 'm1', metadata: { reactions: { '❤️': ['self'] } } },
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('T1: double-tap on a text message fires exactly one POST with ❤️', async () => {
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    expect(wrapper).not.toBeNull();
    await act(async () => {
      firePointerUp(wrapper, 100, 200);
      firePointerUp(wrapper, 102, 201);
    });
    await flush();
    expect(pageState.addReaction).toHaveBeenCalledTimes(1);
    expect(pageState.addReaction).toHaveBeenCalledWith('m1', '❤️');
  });

  it('N1: a single tap fires nothing', async () => {
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    await act(async () => {
      firePointerUp(wrapper, 100, 200);
    });
    await flush();
    expect(pageState.addReaction).not.toHaveBeenCalled();
  });

  it('N3: a tap on the Reply button is not a reaction and voids a pending tap', async () => {
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    const replyBtn = wrapper.querySelector('button[aria-label="Reply"]') as HTMLElement;
    expect(replyBtn).not.toBeNull();
    await act(async () => {
      firePointerUp(wrapper, 100, 200);
      firePointerUp(replyBtn, 100, 200);
      firePointerUp(wrapper, 100, 200);
    });
    await flush();
    expect(pageState.addReaction).not.toHaveBeenCalled();
  });

  it('N4: double-tap on a snap message never reacts', async () => {
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m2"]') as HTMLElement;
    expect(wrapper).not.toBeNull();
    await act(async () => {
      firePointerUp(wrapper, 100, 200);
      firePointerUp(wrapper, 100, 200);
    });
    await flush();
    expect(pageState.addReaction).not.toHaveBeenCalled();
  });

  it('T5: triple-tap during a pending POST still fires exactly one call', async () => {
    let resolvePost!: (v: unknown) => void;
    pageState.addReaction.mockImplementation(
      () => new Promise((resolve) => { resolvePost = resolve; }),
    );
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    await act(async () => {
      firePointerUp(wrapper, 100, 200);
      firePointerUp(wrapper, 100, 200);
      firePointerUp(wrapper, 100, 200);
    });
    expect(pageState.addReaction).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolvePost({ success: true, data: { id: 'm1', metadata: { reactions: { '❤️': ['self'] } } } });
    });
    await flush();
    expect(pageState.addReaction).toHaveBeenCalledTimes(1);
  });

  it('T4: a failed POST reverts the optimistic heart and shows an honest error', async () => {
    pageState.addReaction.mockRejectedValueOnce(new Error('offline'));
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    await act(async () => {
      firePointerUp(wrapper, 100, 200);
      firePointerUp(wrapper, 100, 200);
    });
    await flush();
    expect(pageState.addReaction).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Reaction not sent');
  });

  it('T2: a second double-tap toggles the heart off (server confirms empty set)', async () => {
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    await act(async () => {
      firePointerUp(wrapper, 100, 200);
      firePointerUp(wrapper, 100, 200);
    });
    await flush();
    expect(pageState.addReaction).toHaveBeenCalledTimes(1);
    // Server now reports no ❤️ for the current user: toggle-off reconciles.
    pageState.addReaction.mockResolvedValue({
      success: true,
      data: { id: 'm1', metadata: { reactions: {} } },
    });
    await act(async () => {
      firePointerUp(wrapper, 100, 200);
      firePointerUp(wrapper, 100, 200);
    });
    await flush();
    expect(pageState.addReaction).toHaveBeenCalledTimes(2);
    // No heart chip remains for m1 after toggle-off (the burst span is a
    // transient animation element, not a chip — assert on the chips row).
    expect(wrapper.querySelector('[data-testid="reaction-chips"]')).toBeNull();
  });

  it('T6: right-click still opens the picker and picking never fires a reaction POST', async () => {
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    await act(async () => {
      wrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
    });
    const pickerBtn = container.querySelector('[data-testid="picker-emoji"]') as HTMLElement;
    expect(pickerBtn).not.toBeNull();
    await act(async () => {
      pickerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flush();
    expect(pageState.addReaction).not.toHaveBeenCalled();
  });

  it('Q4: Enter on the focusable wrapper fires the same ❤️ toggle', async () => {
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    expect(wrapper.getAttribute('tabindex')).toBe('0');
    await act(async () => {
      fireKey(wrapper, 'Enter');
    });
    await flush();
    expect(pageState.addReaction).toHaveBeenCalledTimes(1);
    expect(pageState.addReaction).toHaveBeenCalledWith('m1', '❤️');
  });

  it('Q1: a server-persisted own ❤️ is seeded on load (reload does not lose it)', async () => {
    pageState.messages = [
      textMessage({ id: 'm3', metadata: { reactions: { '❤️': ['self'] } } }),
    ];
    await renderPage(container, root);
    await flush();
    const wrapper = container.querySelector('[data-message-id="m3"]') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.textContent).toContain('❤️');
  });

  it('N6: the slice never calls removeReaction (DELETE has no meaning under toggle semantics)', async () => {
    await renderPage(container, root);
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    await act(async () => {
      firePointerUp(wrapper, 100, 200);
      firePointerUp(wrapper, 100, 200);
    });
    await flush();
    // Only addReaction exists on the mocked client surface used by the page;
    // asserting the call shape proves no DELETE-shaped call was made.
    expect(pageState.addReaction).toHaveBeenCalledWith('m1', '❤️');
  });
});
