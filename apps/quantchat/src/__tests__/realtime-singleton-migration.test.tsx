// @vitest-environment jsdom
// ============================================================================
// QM-UIUX-060 — RealtimeProvider → chat-socket singleton migration regressions
//
// The dead RealtimeProvider (`/ws`) and its context are deleted; all six
// former consumers now ride the working `chatSocket` singleton (`/ws/chat`):
//   ConnectionStatusBanner, usePresence, NotificationBadge, useChatThemeSync,
//   app/map/page.tsx, useRealtimeChat (already migrated in QM-UIUX-055).
//
// These tests exercise the REAL hooks/components against the REAL
// ChatSocketManager singleton with only the network boundary stubbed
// (MockWebSocket + fetch/apiClient mocks). Inbound frames are real contract
// §18 envelopes pushed through the manager's own normalization, so a green
// run proves the migrated consumers receive exactly what the backend sends.
// ============================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Network-boundary stubs
// ---------------------------------------------------------------------------

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  protocols: string[];
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  constructor(url: string, protocols?: string[]) {
    this.url = url;
    this.protocols = protocols ?? [];
    MockWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }
}

const lastSocket = () => MockWebSocket.instances[MockWebSocket.instances.length - 1];

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: { friends: [] }, messages: [] }),
  })),
}));

vi.mock('../services/api-client', () => ({
  apiClient: {
    getPresence: vi.fn(async () => ({
      success: true,
      data: { online: ['user-1'] },
      error: null,
    })),
  },
}));

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

// Imported after the mocks above are registered.
import { chatSocket } from '../services/chat-socket';
import { ConnectionStatusBanner, bannerStateFor } from '../components/ConnectionStatusBanner';
import { NotificationBadge } from '../components/ui/NotificationBadge';
import { usePresence, type PresenceStatus } from '../hooks/usePresence';
import { useChatThemeSync, type UseChatThemeSyncResult } from '../hooks/useChatThemeSync';
import { useRealtimeChat } from '../hooks/useRealtimeChat';
import { applyFriendLocationUpdate } from '../app/map/friendLocationUpdate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let envelopeSeq = 0;
function envelope(eventType: string, payload: unknown, cursor: string): string {
  envelopeSeq += 1;
  return JSON.stringify({
    event_id: `evt-${envelopeSeq}`,
    event_type: eventType,
    event_version: 1,
    occurred_at: new Date().toISOString(),
    resource_ref: 'res',
    aggregate_version: 1,
    sequence: envelopeSeq,
    cursor,
    payload,
  });
}

async function mount(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

async function unmount(root: Root) {
  await act(async () => {
    root.unmount();
  });
}

async function openSocket() {
  const socket = lastSocket();
  await act(async () => {
    socket.readyState = MockWebSocket.OPEN;
    socket.onopen?.({});
  });
  return socket;
}

async function pushFrame(socket: MockWebSocket, data: string) {
  await act(async () => {
    socket.onmessage?.({ data });
  });
}

/** Poll with act() flushes until `check` passes or the budget is exhausted. */
async function waitFor(check: () => boolean, budgetMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    if (check()) return;
  }
  throw new Error('waitFor: condition not met within budget');
}

beforeEach(() => {
  MockWebSocket.instances = [];
  // NOTE: envelopeSeq is deliberately NOT reset between tests. The chatSocket
  // singleton is process-lifetime and dedupes inbound envelopes by event_id
  // (contract §18), exactly as in production where server event ids are
  // globally unique. Reissuing evt-1 in a later test would be swallowed as a
  // redelivery, so ids stay monotonic across the whole file.
  vi.stubGlobal('WebSocket', MockWebSocket);
  localStorage.clear();
  localStorage.setItem('token', 'test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Layer 1 — source guard: provider is gone, consumers are on the singleton
// ---------------------------------------------------------------------------

function appPath(relFromApp: string): string {
  const candidates = [resolve(process.cwd(), relFromApp), resolve(process.cwd(), 'apps/quantchat', relFromApp)];
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error(`Could not locate source file: ${relFromApp}`);
  return found;
}

function readAppSource(relFromApp: string): string {
  return readFileSync(appPath(relFromApp), 'utf8');
}

function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      collectSources(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('QM-UIUX-060 source guard', () => {
  it('RealtimeProvider files are deleted', () => {
    const srcRoot = appPath('src');
    expect(existsSync(join(srcRoot, 'providers', 'RealtimeProvider.tsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'providers', 'realtime-provider.tsx'))).toBe(false);
    expect(existsSync(join(srcRoot, 'providers', 'realtime-context.ts'))).toBe(false);
  });

  it('no source file imports the deleted realtime provider modules or useRealtime', () => {
    const srcRoot = appPath('src');
    const offenders: string[] = [];
    for (const file of collectSources(srcRoot)) {
      const source = readFileSync(file, 'utf8');
      if (
        /from\s+['"][^'"]*realtime-context['"]/.test(source) ||
        /from\s+['"][^'"]*realtime-provider['"]/.test(source) ||
        /from\s+['"][^'"]*RealtimeProvider['"]/.test(source) ||
        /(?<![A-Za-z])useRealtime\s*\(/.test(source)
      ) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every former consumer is wired to the chat-socket singleton', () => {
    expect(readAppSource('src/components/ConnectionStatusBanner.tsx')).toContain('useChatSocket');
    expect(readAppSource('src/hooks/usePresence.ts')).toContain('useChatSocket');
    expect(readAppSource('src/components/ui/NotificationBadge.tsx')).toContain('useChatSocket');
    expect(readAppSource('src/hooks/useChatThemeSync.ts')).toContain('chatSocket');
    expect(readAppSource('src/app/map/page.tsx')).toContain('chatSocket');
    expect(readAppSource('src/app/map/page.tsx')).toContain('/api/map/friends');
    expect(readAppSource('src/hooks/useRealtimeChat.ts')).toContain('chatSocket');
    expect(readAppSource('src/providers/app-providers.tsx')).not.toMatch(
      /import\s*\{[^}]*RealtimeProvider/,
    );
  });
});

// ---------------------------------------------------------------------------
// Layer 2 — behavior through the real singleton
// ---------------------------------------------------------------------------

describe('bannerStateFor mapping', () => {
  it('maps singleton states to the old banner visibility exactly', () => {
    expect(bannerStateFor('open')).toBeNull();
    expect(bannerStateFor('closed')).toBeNull();
    expect(bannerStateFor('connecting')).toBe('reconnecting');
    expect(bannerStateFor('degraded')).toBe('degraded');
  });
});

describe('ConnectionStatusBanner (real singleton)', () => {
  it('shows Reconnecting while connecting, hides when open', async () => {
    const { container, root } = await mount(React.createElement(ConnectionStatusBanner));
    // Socket was acquired on mount and is still CONNECTING.
    expect(container.textContent).toContain('Reconnecting...');
    await openSocket();
    expect(container.textContent).not.toContain('Reconnecting...');
    expect(container.textContent).toBe('');
    await unmount(root);
  });

  it('shows the degraded banner after repeated connection failures engage the HTTP fallback', async () => {
    vi.useFakeTimers();
    const { container, root } = await mount(React.createElement(ConnectionStatusBanner));
    expect(container.textContent).toContain('Reconnecting...');

    // Three consecutive unexpected closes: reconnects at 1s then 2s, and the
    // third failure engages the manager's long-poll fallback => 'degraded'.
    for (const delay of [1000, 2000]) {
      const socket = lastSocket();
      await act(async () => {
        socket.close();
      });
      await act(async () => {
        vi.advanceTimersByTime(delay);
      });
    }
    const third = lastSocket();
    await act(async () => {
      third.close();
    });

    expect(chatSocket.getState()).toBe('degraded');
    expect(container.textContent).toContain('Connection limited');
    await unmount(root);
    vi.useRealTimers();
  });
});

describe('usePresence (real singleton)', () => {
  it('seeds from the REST snapshot and applies live presence:update events, ignoring untracked users', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let latest: Record<string, PresenceStatus> = {};
    function Probe() {
      latest = usePresence(['user-1', 'user-2']);
      return null;
    }
    const { root } = await mount(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(Probe),
      ),
    );

    await waitFor(() => latest['user-1'] === 'online' && latest['user-2'] === 'offline');

    const socket = await openSocket();
    await pushFrame(
      socket,
      envelope(
        'chat.presence.v1',
        { type: 'presence:update', userId: 'user-2', status: 'online', lastSeen: Date.now() },
        'presence:1',
      ),
    );
    expect(latest['user-2']).toBe('online');

    // Untracked user transitions must not enter the map.
    await pushFrame(
      socket,
      envelope(
        'chat.presence.v1',
        { type: 'presence:update', userId: 'user-9', status: 'online', lastSeen: Date.now() },
        'presence:2',
      ),
    );
    expect(latest['user-9']).toBeUndefined();

    await unmount(root);
    queryClient.clear();
  });
});

describe('NotificationBadge (real singleton)', () => {
  it('shows the dot on a real new_message envelope and clears it on a read frame', async () => {
    const { container, root } = await mount(
      React.createElement(NotificationBadge, null, React.createElement('span', null, 'Chats')),
    );
    expect(container.querySelector('.bg-red-500')).toBeNull();

    const socket = await openSocket();
    await pushFrame(
      socket,
      envelope(
        'chat.message.created.v1',
        { id: 'm1', content: 'hi', senderId: 'user-2', conversationId: 'conv-1' },
        'conversation.conv-1:1',
      ),
    );
    expect(container.querySelector('.bg-red-500')).not.toBeNull();

    await pushFrame(socket, JSON.stringify({ type: 'read' }));
    expect(container.querySelector('.bg-red-500')).toBeNull();
    await unmount(root);
  });

  it('with an itemId, only explicitly attributed events toggle the badge', async () => {
    const { container, root } = await mount(
      React.createElement(NotificationBadge, {
        itemId: 'nav-chats',
        children: React.createElement('span', null, 'Chats'),
      }),
    );
    const socket = await openSocket();

    // Unattributed new_message: must NOT light an itemId-scoped badge.
    await pushFrame(
      socket,
      envelope(
        'chat.message.created.v1',
        { id: 'm2', content: 'hi', senderId: 'user-2', conversationId: 'conv-1' },
        'conversation.conv-1:2',
      ),
    );
    expect(container.querySelector('.bg-red-500')).toBeNull();

    // Explicitly attributed unread frame lights it.
    await pushFrame(
      socket,
      JSON.stringify({ type: 'unread', payload: { itemId: 'nav-chats' } }),
    );
    expect(container.querySelector('.bg-red-500')).not.toBeNull();
    await unmount(root);
  });
});

describe('useChatThemeSync (real singleton)', () => {
  it('applies theme_changed frames for its conversation only, and setTheme persists + broadcasts', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    let latest: UseChatThemeSyncResult | null = null;
    function Probe() {
      latest = useChatThemeSync('conv-9');
      return null;
    }
    const { root } = await mount(React.createElement(Probe));
    expect(latest!.theme.id).toBe('default');

    const socket = await openSocket();
    // Theme frame for another conversation is ignored.
    await pushFrame(
      socket,
      JSON.stringify({ type: 'theme_changed', conversationId: 'conv-other', themeId: 'ocean' }),
    );
    expect(latest!.theme.id).toBe('default');
    // Theme frame for this conversation applies immediately.
    await pushFrame(
      socket,
      JSON.stringify({ type: 'theme_changed', conversationId: 'conv-9', themeId: 'ocean' }),
    );
    expect(latest!.theme.id).toBe('ocean');

    // setTheme: optimistic apply + REST persist + socket broadcast frame.
    await act(async () => {
      await latest!.setTheme('sunset');
    });
    expect(latest!.theme.id).toBe('sunset');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/conversations/conv-9/theme'),
      expect.objectContaining({ method: 'POST' }),
    );
    const sentFrames = socket.sent.map((s) => JSON.parse(s));
    expect(sentFrames).toContainEqual(
      expect.objectContaining({ type: 'theme_changed', conversationId: 'conv-9', themeId: 'sunset' }),
    );
    await unmount(root);
  });
});

describe('useRealtimeChat (real singleton, QM-UIUX-055 regression)', () => {
  it('joins the room and surfaces typing users and incoming messages', async () => {
    let latest: ReturnType<typeof useRealtimeChat> | null = null;
    function Probe() {
      latest = useRealtimeChat('conv-1');
      return null;
    }
    const { root } = await mount(React.createElement(Probe));

    const socket = await openSocket();
    // On open the manager replays the room join for the subscribed conversation.
    const sentFrames = socket.sent.map((s) => JSON.parse(s));
    expect(sentFrames).toContainEqual(
      expect.objectContaining({ type: 'join_conversation', conversationId: 'conv-1' }),
    );
    expect(latest!.isConnected).toBe(true);

    await pushFrame(
      socket,
      envelope('chat.typing.v1', { userId: 'user-2', isTyping: true }, 'conversation.conv-1:1'),
    );
    expect(latest!.typingUsers).toContain('user-2');

    await pushFrame(
      socket,
      envelope(
        'chat.message.created.v1',
        { id: 'm1', content: 'Hello world', senderId: 'user-2' },
        'conversation.conv-1:2',
      ),
    );
    expect(latest!.incomingMessages).toHaveLength(1);
    expect(latest!.incomingMessages[0].content).toBe('Hello world');
    await unmount(root);
  });
});

describe('map page friend-location updates', () => {
  const base = { userId: 'u1', username: 'Ada', avatarUrl: '', isOnline: false };

  it('appends a new friend and updates an existing friend in place', () => {
    const one = applyFriendLocationUpdate([], { ...base, position: [10, 20], isOnline: true });
    expect(one).toHaveLength(1);
    expect(one[0].position).toEqual([10, 20]);
    expect(one[0].isOnline).toBe(true);

    const moved = applyFriendLocationUpdate(one, { ...base, position: [11, 21], isOnline: true });
    expect(moved).toHaveLength(1);
    expect(moved[0].position).toEqual([11, 21]);

    const two = applyFriendLocationUpdate(moved, {
      userId: 'u2',
      username: 'Grace',
      avatarUrl: '',
      position: [0, 0],
      isOnline: true,
    });
    expect(two).toHaveLength(2);
    expect(two[1].userId).toBe('u2');
  });
});
