// @vitest-environment jsdom
//
// QC-F-317 (case 20) — the web 'Block user' action on the live thread page.
//
// The block system had no writer on any surface; Slice 1 adds exactly one
// web action: a text Block button in the TopBar of a DIRECT thread, a
// confirmation sheet (a click alone never blocks), and an honest success
// banner. These tests pin:
//   (i)   the button renders only for a direct peer — never for a group,
//         and a conversation without participants renders without crashing
//         and without the button (QM-CHAT-001 parampara);
//   (ii)  opening the sheet and cancelling never calls the block API;
//   (iii) confirming POSTs to /api/settings/blocked/<peerId>, then the
//         banner shows and the button disappears;
//   (iv)  a failed POST keeps the sheet open with the backend's error
//         inside it — no banner, no success state.
//
// Harness mirrors chat-page-crash-guard.test.tsx (stable module-level
// mocks; the TopBar mock here additionally renders rightActions so the
// real buttons are clickable).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const conversationState = vi.hoisted(() => ({
  conversation: null as unknown,
}));

const apiState = vi.hoisted(() => ({
  apiFetchRaw: vi.fn(),
}));

vi.mock('@quant/api-client', () => ({ apiFetchRaw: apiState.apiFetchRaw }));

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
  TopBar: ({
    title,
    rightActions,
  }: {
    title?: string;
    rightActions?: React.ReactNode[];
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'top-bar' },
      title,
      ...(rightActions ?? []),
    ),
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

const PEER = { userId: 'user-peer', username: 'peer', displayName: 'Peer Person' };
const SELF = { userId: 'self', username: 'self', displayName: 'Self' };

function directConversation() {
  return { id: 'conv-1', type: 'direct', participants: [SELF, PEER] };
}

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

function buttonsByText(container: HTMLElement, text: string): HTMLButtonElement[] {
  return [...container.querySelectorAll('button')].filter(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement[];
}

function blockButton(container: HTMLElement): HTMLButtonElement | undefined {
  return container.querySelector('button[aria-label="Block Peer Person"]') as
    | HTMLButtonElement
    | undefined;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

describe('QC-F-317: Block user action on the thread page', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    apiState.apiFetchRaw.mockReset();
    conversationState.conversation = directConversation();
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

  it('(i) shows Block only on a direct thread — not on a group, not without participants', async () => {
    await renderPage(container, root, 'conv-1');
    expect(blockButton(container)).toBeTruthy();

    conversationState.conversation = {
      id: 'conv-2',
      type: 'group',
      name: 'Group',
      participants: [SELF, PEER],
    };
    await renderPage(container, root, 'conv-2');
    expect(blockButton(container)).toBeNull();

    conversationState.conversation = { id: 'conv-3', type: 'direct' };
    await renderPage(container, root, 'conv-3');
    expect(container.querySelector('[data-testid="top-bar"]')).toBeTruthy();
    expect(blockButton(container)).toBeNull();
  });

  it('(ii) opening the confirm sheet and cancelling never calls the block API', async () => {
    await renderPage(container, root, 'conv-1');
    await click(blockButton(container)!);
    expect(container.textContent).toContain('Block Peer Person?');
    expect(apiState.apiFetchRaw).not.toHaveBeenCalled();

    await click(buttonsByText(container, 'Cancel')[0]);
    expect(container.textContent).not.toContain('Block Peer Person?');
    expect(apiState.apiFetchRaw).not.toHaveBeenCalled();
  });

  it('(iii) confirming POSTs to the blocked endpoint, then shows the banner and hides the button', async () => {
    apiState.apiFetchRaw.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { blockedUsers: [] } }),
    });
    await renderPage(container, root, 'conv-1');
    await click(blockButton(container)!);
    // Header button + sheet confirm share the label; confirm is the last one.
    const confirmButtons = buttonsByText(container, 'Block');
    await click(confirmButtons[confirmButtons.length - 1]);

    expect(apiState.apiFetchRaw).toHaveBeenCalledTimes(1);
    const [url, init] = apiState.apiFetchRaw.mock.calls[0] as [string, { method?: string }];
    expect(url).toBe('/api/settings/blocked/user-peer');
    expect(init.method).toBe('POST');
    expect(container.textContent).toContain('You blocked Peer Person');
    expect(blockButton(container)).toBeNull();
  });

  it('(iv) a failed POST keeps the sheet open with the backend error — no banner, button stays', async () => {
    apiState.apiFetchRaw.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        success: false,
        error: { code: 'BLOCKED_LIST_UNAVAILABLE', message: 'Blocked list unavailable' },
      }),
    });
    await renderPage(container, root, 'conv-1');
    await click(blockButton(container)!);
    const confirmButtons = buttonsByText(container, 'Block');
    await click(confirmButtons[confirmButtons.length - 1]);

    expect(apiState.apiFetchRaw).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Block Peer Person?');
    expect(container.textContent).toContain('Blocked list unavailable');
    expect(container.textContent).not.toContain('You blocked Peer Person');
    expect(blockButton(container)).toBeTruthy();
  });
});
