// @vitest-environment jsdom
//
// QC-F-529 — single-message Edit / Delete on the live thread page.
//
// Backend edit/delete were real but unreachable from any shipped surface:
// the Next proxy 405'd PUT/DELETE, the api-client sent the wrong edit
// body, and the thread page had no Edit/Delete action at all (and dropped
// isEdited/createdAt in its mappers, so no 'edited' label and no window
// check were even possible). These tests pin the web Slice-1 behaviour:
//   U1  Edit/Delete render ONLY for my own messages;
//   U2  editing saves through apiClient.editMessage and the new content +
//       'edited' label render;
//   U3  past the 15-minute window Edit is disabled WITH its reason, while
//       Delete (which has no window) stays available;
//   U4  delete needs a confirm step, then renders the honest tombstone
//       and the original content is gone;
//   U5  a backend edit refusal surfaces verbatim — no fake save, no
//       'edited' label, original content untouched.
//
// Harness mirrors qc-f-317-chat-block-action.test.tsx (stable module-level
// mocks only). Negative control: on the original page none of the
// Edit/Delete buttons exist, so U1–U5 all fail.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act, Suspense } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const messagesState = vi.hoisted(() => ({
  data: [] as Array<Record<string, unknown>>,
  refetch: vi.fn(),
}));

const apiState = vi.hoisted(() => ({
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  consumeSnap: vi.fn(),
  initiate1v1Call: vi.fn(),
  apiFetchRaw: vi.fn(),
}));

vi.mock('@quant/api-client', () => ({ apiFetchRaw: apiState.apiFetchRaw }));

vi.mock('../services/api-client', () => ({
  apiClient: {
    editMessage: apiState.editMessage,
    deleteMessage: apiState.deleteMessage,
    consumeSnap: apiState.consumeSnap,
    initiate1v1Call: apiState.initiate1v1Call,
  },
}));

vi.mock('../hooks/useChatSocket', () => ({
  useChatSocket: () => ({ subscribe: vi.fn(), send: vi.fn(), connectionState: 'open' }),
}));

vi.mock('../hooks/useMessages', () => ({
  useMessages: () => ({
    data: messagesState.data,
    isLoading: false,
    error: null,
    refetch: messagesState.refetch,
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
  useConversations: () => ({
    conversations: [
      {
        id: 'conv-1',
        type: 'direct',
        participants: [
          { userId: 'self', username: 'self', displayName: 'Self' },
          { userId: 'user-peer', username: 'peer', displayName: 'Peer Person' },
        ],
      },
    ],
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
  ChatBubble: ({ message }: { message?: string }) =>
    React.createElement('div', { 'data-testid': 'bubble' }, message),
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

function ownMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    content: 'hello world',
    senderId: 'self',
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    type: 'text',
    isEdited: false,
    ...overrides,
  };
}

function peerMessage() {
  return {
    id: 'm2',
    content: 'peer says hi',
    senderId: 'user-peer',
    createdAt: new Date(Date.now() - 50_000).toISOString(),
    type: 'text',
    isEdited: false,
  };
}

async function renderPage(container: HTMLElement, root: Root) {
  await act(async () => {
    root.render(
      React.createElement(
        Suspense,
        { fallback: null },
        React.createElement(ChatPage, { params: Promise.resolve({ id: 'conv-1' }) }),
      ),
    );
  });
}

function buttonsByLabel(container: HTMLElement, label: string): HTMLButtonElement[] {
  return [...container.querySelectorAll(`button[aria-label="${label}"]`)] as HTMLButtonElement[];
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

async function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )!.set!;
    setter.call(textarea, value);
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}

describe('QC-F-529: message Edit/Delete on the thread page', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    apiState.editMessage.mockReset();
    apiState.deleteMessage.mockReset();
    apiState.consumeSnap.mockReset();
    apiState.initiate1v1Call.mockReset();
    apiState.apiFetchRaw.mockReset();
    messagesState.refetch.mockReset();
    messagesState.data = [ownMessage(), peerMessage()];
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

  it('U1: Edit/Delete render only for my own message, never for the peer\'s', async () => {
    await renderPage(container, root);
    expect(container.textContent).toContain('hello world');
    expect(container.textContent).toContain('peer says hi');
    expect(buttonsByLabel(container, 'Edit message')).toHaveLength(1);
    expect(buttonsByLabel(container, 'Delete message')).toHaveLength(1);
  });

  it('U2: Save calls apiClient.editMessage and renders new content + edited label', async () => {
    apiState.editMessage.mockResolvedValue({
      success: true,
      data: { id: 'm1', content: 'edited hello', isEdited: true },
    });
    await renderPage(container, root);
    await click(buttonsByLabel(container, 'Edit message')[0]!);
    const textarea = container.querySelector(
      'textarea[aria-label="Edit message text"]',
    ) as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    expect(textarea!.value).toBe('hello world');
    await setTextareaValue(textarea!, 'edited hello');
    await click(buttonsByLabel(container, 'Save edit')[0]!);
    expect(apiState.editMessage).toHaveBeenCalledTimes(1);
    expect(apiState.editMessage).toHaveBeenCalledWith('m1', 'edited hello');
    expect(container.textContent).toContain('edited hello');
    expect(container.textContent).toContain('edited');
    expect(container.querySelector('textarea[aria-label="Edit message text"]')).toBeNull();
  });

  it('U3: past the 15-minute window Edit is disabled with its reason; Delete stays available', async () => {
    messagesState.data = [
      ownMessage({ createdAt: new Date(Date.now() - 20 * 60_000).toISOString() }),
    ];
    await renderPage(container, root);
    const editButtons = buttonsByLabel(container, 'Edit message');
    expect(editButtons).toHaveLength(1);
    expect(editButtons[0]!.disabled).toBe(true);
    expect(editButtons[0]!.title).toContain('15 minutes');
    const deleteButtons = buttonsByLabel(container, 'Delete message');
    expect(deleteButtons).toHaveLength(1);
    expect(deleteButtons[0]!.disabled).toBe(false);
  });

  it('U4: Delete requires confirmation, then renders the tombstone and drops the content', async () => {
    apiState.deleteMessage.mockResolvedValue({ success: true, data: { id: 'm1' } });
    await renderPage(container, root);
    await click(buttonsByLabel(container, 'Delete message')[0]!);
    // A click alone never deletes.
    expect(apiState.deleteMessage).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Delete this message for everyone?');
    expect(container.textContent).toContain('hello world');
    await click(buttonsByLabel(container, 'Confirm delete')[0]!);
    expect(apiState.deleteMessage).toHaveBeenCalledTimes(1);
    expect(apiState.deleteMessage).toHaveBeenCalledWith('m1');
    expect(container.textContent).toContain('This message was deleted');
    expect(container.textContent).not.toContain('hello world');
  });

  it('U5: a backend edit refusal surfaces verbatim — no fake save, original untouched', async () => {
    apiState.editMessage.mockResolvedValue({
      success: false,
      error: {
        code: 'EDIT_WINDOW_EXPIRED',
        message: 'Message can only be edited within 15 minutes',
        statusCode: 400,
      },
    });
    await renderPage(container, root);
    await click(buttonsByLabel(container, 'Edit message')[0]!);
    const textarea = container.querySelector(
      'textarea[aria-label="Edit message text"]',
    ) as HTMLTextAreaElement | null;
    expect(textarea).not.toBeNull();
    await setTextareaValue(textarea!, 'too late edit');
    await click(buttonsByLabel(container, 'Save edit')[0]!);
    expect(apiState.editMessage).toHaveBeenCalledWith('m1', 'too late edit');
    expect(container.textContent).toContain('Message can only be edited within 15 minutes');
    // Editor stays open with the draft preserved; nothing was saved over
    // the original and no success/'edited' state appeared.
    const stillOpen = container.querySelector(
      'textarea[aria-label="Edit message text"]',
    ) as HTMLTextAreaElement | null;
    expect(stillOpen).not.toBeNull();
    expect(stillOpen!.value).toBe('too late edit');
    expect(buttonsByLabel(container, 'Save edit')).toHaveLength(1);
    expect(messagesState.refetch).not.toHaveBeenCalled();
  });
});
