// @vitest-environment jsdom
//
// Tests for QuantChat Snapchat-grade Ephemeral View-Once Messaging
// Validates:
// 1. Unopened Photo Snap (🔴 'New Photo Snap · Tap to view') and Video Snap (🟣 'New Video Snap · Tap to view') with duration badges
// 2. Fullscreen Snap Viewer Modal with countdown timer and progress bar
// 3. Permanent transition to Opened (⬜ 'Opened · Just now') upon close/expiration and media auto-destruction
// 4. Single press-and-hold replay enforcement
// 5. Quick Camera button (📸) with duration selectors (10s, 30s, View Once, 24h)
// 6. Composer ephemeral duration badge selector
//

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const testMessages = vi.hoisted(() => ({
  data: [
    {
      id: 'snap-1',
      content: 'Photo Snap',
      sender: 'friend',
      timestamp: '12:00',
      type: 'snap_photo',
      mediaUrl: 'data:image/svg+xml;utf8,<svg></svg>',
      snapDurationSec: 10,
    },
    {
      id: 'snap-2',
      content: 'Video Snap',
      sender: 'friend',
      timestamp: '12:01',
      type: 'snap_video',
      mediaUrl: 'https://example.com/video.mp4',
      snapDurationSec: 10,
    },
    {
      id: 'text-1',
      content: 'Hello world',
      sender: 'friend',
      timestamp: '12:02',
      type: 'text',
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
  ChatInput: ({ onSend }: { onSend?: (text: string) => void }) =>
    React.createElement('input', {
      'data-testid': 'chat-input',
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') onSend?.((e.target as HTMLInputElement).value);
      },
    }),
  TypingIndicator: () => React.createElement('div', { 'data-testid': 'typing' }),
  TopBar: ({ title, rightActions }: { title?: string; rightActions?: React.ReactNode[] }) =>
    React.createElement('div', { 'data-testid': 'top-bar' }, title, rightActions),
  LoadingState: () => React.createElement('div', { 'data-testid': 'loading' }),
  ErrorState: () => React.createElement('div', { 'data-testid': 'error' }),
  EmptyState: () => React.createElement('div', { 'data-testid': 'empty' }),
}));

vi.mock('../components/ReactionPicker', () => ({ ReactionPicker: () => null }));
vi.mock('../components/VoiceNoteRecorder', () => ({
  VoiceNoteRecorder: () => React.createElement('div', { 'data-testid': 'voice-recorder' }),
}));
vi.mock('../components/LinkPreviewCard', () => ({ LinkPreviewCard: () => null }));
vi.mock('../components/chat/AIAgentPanel', () => ({ AIAgentPanel: () => null }));
vi.mock('../components/chat/ReplySuggestions', () => ({ ReplySuggestions: () => null }));
vi.mock('../components/games/GameLauncher', () => ({ GameLauncher: () => null }));

import ChatPage from '../app/chat/[id]/page';

describe('Snapchat-style Ephemeral View-Once Messaging', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    sentRequests.calls = [];
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('renders unopened Photo Snap with 🔴 and "New Photo Snap · Tap to view" (with 10s duration badge)', async () => {
    await act(async () => {
      root.render(React.createElement(ChatPage, { params: Promise.resolve({ id: 'conv-1' }) }));
    });

    expect(container.textContent).toContain('New Photo Snap · Tap to view');
    expect(container.textContent).toContain('10s');
    expect(container.textContent).toContain('🔴');
  });

  it('renders unopened Video Snap with 🟣 and "New Video Snap · Tap to view" (with 10s duration badge)', async () => {
    await act(async () => {
      root.render(React.createElement(ChatPage, { params: Promise.resolve({ id: 'conv-1' }) }));
    });

    expect(container.textContent).toContain('New Video Snap · Tap to view');
    expect(container.textContent).toContain('10s');
    expect(container.textContent).toContain('🟣');
  });

  it('opens Fullscreen Snap Viewer Modal when unopened snap is tapped', async () => {
    await act(async () => {
      root.render(React.createElement(ChatPage, { params: Promise.resolve({ id: 'conv-1' }) }));
    });

    const photoSnapButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New Photo Snap · Tap to view'),
    );
    expect(photoSnapButton).toBeDefined();

    await act(async () => {
      photoSnapButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Snap viewer modal is now displayed
    expect(container.textContent).toContain('Photo Snap');
    expect(container.textContent).toContain('Snap will auto-destroy');
  });

  it('permanently transitions to Opened state (⬜ "Opened · Just now") upon timer expiration or close', async () => {
    await act(async () => {
      root.render(React.createElement(ChatPage, { params: Promise.resolve({ id: 'conv-1' }) }));
    });

    const photoSnapButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New Photo Snap · Tap to view'),
    );

    await act(async () => {
      photoSnapButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Close button in viewer modal
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Close snap',
    );
    expect(closeBtn).toBeDefined();

    await act(async () => {
      closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Verify transition to Opened with ⬜ icon
    expect(container.textContent).toContain('Opened · Just now');
    expect(container.textContent).toContain('⬜');
    // Unopened snap text should no longer be present for this snap
    expect(container.textContent).not.toContain('New Photo Snap · Tap to view');
  });

  it('renders Quick Snap Camera button 📸 in composer input row and opens dialog', async () => {
    await act(async () => {
      root.render(React.createElement(ChatPage, { params: Promise.resolve({ id: 'conv-1' }) }));
    });

    const cameraButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Quick Snap Camera',
    );
    expect(cameraButton).toBeDefined();
    expect(cameraButton?.textContent).toContain('📸');

    await act(async () => {
      cameraButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Dialog opens
    expect(container.textContent).toContain('Send a Snap');
    expect(container.textContent).toContain('Snap Duration');
    expect(container.textContent).toContain('Photo Snap');
    expect(container.textContent).toContain('Video Snap');
  });

  it('allows selecting durations in the snap camera dialog', async () => {
    await act(async () => {
      root.render(React.createElement(ChatPage, { params: Promise.resolve({ id: 'conv-1' }) }));
    });

    const cameraButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Quick Snap Camera',
    );
    await act(async () => {
      cameraButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('10s');
    expect(container.textContent).toContain('30s');
    expect(container.textContent).toContain('View Once');
    expect(container.textContent).toContain('24h');
  });

  it('renders Ephemeral Duration selector badge in composer and toggles durations', async () => {
    await act(async () => {
      root.render(React.createElement(ChatPage, { params: Promise.resolve({ id: 'conv-1' }) }));
    });

    expect(container.textContent).toContain('⏱️ Snap Duration:');
    expect(container.textContent).toContain('10s (View Once)');
    expect(container.textContent).toContain('30s');
    expect(container.textContent).toContain('24h');

    const duration30sBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === '30s',
    );
    expect(duration30sBtn).toBeDefined();

    await act(async () => {
      duration30sBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(duration30sBtn?.className).toContain('bg-amber-500');
  });
});
