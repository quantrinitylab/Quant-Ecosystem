// @vitest-environment jsdom
//
// QC-F-020 — thread page: reactions + voice notes are real now.
//
// Pre-fix behaviour asserted AGAINST here:
//  - Reactions lived in a local useState map: a message whose PERSISTED
//    metadata carried reactions rendered none of them.
//  - A voice message rendered as a decorative waveform with nothing to
//    play, and "sending" one posted a TEXT message with the fabricated
//    content `Voice note (Xs)` — the recorded audio blob was discarded.
//
// These tests drive the real page with stable module-level mocks (the
// established chat-page harness pattern). useMessages returns backend-
// shaped records (Prisma enum type 'AUDIO', reactions in metadata).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testMessages = vi.hoisted(() => ({
  data: [
    {
      id: 'v1',
      content: '',
      senderId: 'other-user',
      createdAt: '2026-10-11T10:00:00.000Z',
      type: 'AUDIO',
      mediaUrl: 'data:audio/webm;base64,AAAA',
      metadata: { voiceDurationMs: 2500, reactions: { '❤️': ['u1', 'u2'] } },
    },
    {
      id: 't1',
      content: 'hello there',
      senderId: 'other-user',
      createdAt: '2026-10-11T10:01:00.000Z',
      type: 'TEXT',
      metadata: { reactions: { '👍': ['u1'] } },
    },
  ],
}));

const sentRequests = vi.hoisted(() => ({
  calls: [] as any[],
}));

vi.mock('../hooks/useChatSocket', () => ({
  useChatSocket: () => ({ subscribe: vi.fn(), send: vi.fn(), connectionState: 'open' }),
}));

vi.mock('../hooks/useMessages', () => ({
  useMessages: () => ({
    data: testMessages.data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../hooks/useSendMessage', () => ({
  useSendMessage: () => ({
    mutate: (req: any) => sentRequests.calls.push(req),
  }),
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
  const SAFE = /^(className|id|children|role|onClick|style|title|type|disabled)$|^(aria-|data-)/;
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

vi.mock('@quant/shared-ui', () => ({
  ChatBubble: ({ message }: { message: string }) =>
    React.createElement('div', { 'data-testid': 'bubble' }, message),
  ChatInput: () => React.createElement('div', { 'data-testid': 'chat-input' }),
  TypingIndicator: () => React.createElement('div', { 'data-testid': 'typing' }),
  TopBar: ({ title }: { title?: string }) =>
    React.createElement('div', { 'data-testid': 'top-bar' }, title),
  LoadingState: () => React.createElement('div', { 'data-testid': 'loading' }),
  ErrorState: () => React.createElement('div', { 'data-testid': 'error' }),
  EmptyState: () => React.createElement('div', { 'data-testid': 'empty' }),
}));

vi.mock('../components/ReactionPicker', () => ({ ReactionPicker: () => null }));

// Recorder double: lets the test fire the exact callbacks the real
// MediaRecorder-backed component fires — duration-only (legacy) and
// audio-recorded (real blob).
vi.mock('../components/VoiceNoteRecorder', () => ({
  VoiceNoteRecorder: (props: {
    onRecordingComplete?: (durationMs: number) => void;
    onAudioRecorded?: (blob: Blob, durationMs: number) => void;
  }) =>
    React.createElement(
      'div',
      null,
      React.createElement(
        'button',
        {
          'data-testid': 'rec-duration-only',
          onClick: () => props.onRecordingComplete?.(2500),
        },
        'duration-only',
      ),
      React.createElement(
        'button',
        {
          'data-testid': 'rec-audio',
          onClick: () =>
            props.onAudioRecorded?.(new Blob(['fake-audio'], { type: 'audio/webm' }), 2500),
        },
        'record-audio',
      ),
    ),
}));
vi.mock('../components/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }));
vi.mock('../components/chat/AIAgentPanel', () => ({ AIAgentPanel: () => null }));
vi.mock('../components/chat/ReplySuggestions', () => ({ ReplySuggestions: () => null }));
vi.mock('../components/games/GameLauncher', () => ({ GameLauncher: () => null }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import ChatPage from '../app/chat/[id]/page';

describe('QC-F-020 thread page — persisted reactions + real voice notes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    sentRequests.calls.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(
          React.Suspense,
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
    container.remove();
  });

  it('renders reactions from the persisted message metadata (not local state)', () => {
    const text = container.textContent ?? '';
    // ❤️ was reacted by 2 users on the voice message, 👍 by 1 on the text.
    expect(text).toContain('❤️');
    expect(text).toContain('👍');
    // The reaction count badge reflects the real number of reactions.
    expect(text).toContain('2');
  });

  it('renders a voice message as a playable audio element with its real duration', () => {
    const audio = container.querySelector('audio');
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute('src')).toBe('data:audio/webm;base64,AAAA');
    expect(container.textContent ?? '').toContain('3s');
  });

  it('never renders the fabricated `Voice note (Xs)` text anywhere', () => {
    expect(container.textContent ?? '').not.toContain('Voice note (');
  });

  it('a duration-only recording callback sends NOTHING (no fake text voice note)', async () => {
    const btn = container.querySelector('[data-testid="rec-duration-only"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    expect(sentRequests.calls).toHaveLength(0);
  });

  it('a recorded audio blob is sent as a real audio message (mediaUrl + duration metadata)', async () => {
    const btn = container.querySelector('[data-testid="rec-audio"]') as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    // FileReader resolves asynchronously in jsdom.
    await vi.waitFor(() => {
      expect(sentRequests.calls).toHaveLength(1);
    });
    const req = sentRequests.calls[0];
    expect(req.conversationId).toBe('c1');
    expect(req.type).toBe('audio');
    expect(req.content).toBe('');
    expect(req.mediaUrl).toContain('data:audio/webm');
    expect(req.metadata).toEqual({ voiceDurationMs: 2500 });
  });
});
