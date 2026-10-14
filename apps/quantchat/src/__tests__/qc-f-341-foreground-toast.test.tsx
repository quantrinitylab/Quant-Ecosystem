// @vitest-environment jsdom
// ============================================================================
// QC-F-341 — foreground in-app toast wiring regression tests
//
// The in-app toast SYSTEM (src/components/ui/InAppToast.tsx) was complete
// and unit-tested (Property 24) but production-dead: InAppToastContainer
// was mounted nowhere, showInAppToast/handleForegroundPush had no
// production caller, and nothing turned a real foreground event into a
// toast. Slice 1 wires it honestly:
//   - AppProviders mounts <InAppToastContainer onNavigate={router.push}>
//     and the new <ForegroundToastBridge/> (T1 source pin).
//   - The bridge listens to the shared chatSocket's `new_message` events
//     and runs them through the pure gate function
//     `evaluateForegroundToast` (G1–G11): only created (not edit/delete),
//     only another conversation, only another sender, MESSAGES category
//     on, ephemeral content NEVER in the body, dedupe, burst cap 3.
//     Visibility itself is NOT re-checked in the bridge —
//     handleForegroundPush owns that decision (G9, pinned by T11).
//
// Negative control (pre-fix tree): T1 FAILS (no mount in app-providers),
// T3–T11 + T13–T15 FAIL (the bridge module does not exist — the lazy
// import below rejects), T2 + T12 PASS (declared regression pins: the
// toast system itself was always correct; the defect is the wiring).
//
// Mocks are stable module-level hoisted objects (never fresh identities).
// The socket/conversations/settings seams are mocked at the hook/module
// boundary the bridge actually consumes; the bridge, the gate function,
// the toast manager and the container under test are the REAL modules.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- next/navigation (stable hoisted mock) ---------------------------------
const navMocks = vi.hoisted(() => ({
  push: vi.fn(),
  pathname: '/chat/c-1' as string,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: navMocks.push,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => navMocks.pathname,
}));

// --- @quant/shared-ui useAuth (the only export the bridge consumes) --------
const authMocks = vi.hoisted(() => ({
  user: { id: 'u-me' } as { id: string } | null,
}));

vi.mock('@quant/shared-ui', () => ({
  useAuth: () => ({
    user: authMocks.user,
    isAuthenticated: authMocks.user !== null,
    isLoading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    refreshToken: vi.fn(),
  }),
}));

// --- socket + conversations + settings seams -------------------------------
const socketMocks = vi.hoisted(() => ({
  handler: null as ((event: unknown) => void) | null,
  subscribe: vi.fn(),
}));

vi.mock('../hooks/useChatSocket', () => ({
  useChatSocket: (onEvent?: (event: unknown) => void) => {
    socketMocks.handler = onEvent ?? null;
    return {
      send: vi.fn(),
      subscribe: socketMocks.subscribe,
      connectionState: 'open' as const,
    };
  },
}));

const convMocks = vi.hoisted(() => ({
  list: [] as Array<Record<string, unknown>>,
}));

vi.mock('../hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: convMocks.list,
    isLoading: false,
    error: null,
    data: convMocks.list,
    refetch: vi.fn(),
    isError: false,
  }),
}));

const settingsMocks = vi.hoisted(() => ({
  current: {
    MESSAGES: true,
    CALLS: true,
    STORIES: true,
    STREAKS: true,
    REELS: true,
    SYSTEM: true,
  } as Record<string, boolean>,
}));

vi.mock('../components/settings/NotificationSettings', () => ({
  loadNotificationSettings: () => settingsMocks.current,
}));

// --- real modules under test -------------------------------------------------
import {
  InAppToastContainer,
  showInAppToast,
  toastManager,
} from '../components/ui/InAppToast';

/** Structural shape of the bridge module (no static import — see below). */
interface BridgeModule {
  evaluateForegroundToast: (
    event: unknown,
    ctx: ReturnType<typeof baseCtx>,
  ) => { fire: boolean; title?: string; body?: string; conversationId?: string };
  ForegroundToastBridge: React.ComponentType;
}

/**
 * Lazy via a variable specifier so the pre-fix tree fails ONLY the bridge
 * cases at runtime (the import rejects per-case) while the T2/T12
 * regression pins still run and pass — the brief's NC shape. A literal
 * dynamic import is resolved by vite's import-analysis at transform time
 * and would fail the whole suite, taking the pins down with it.
 */
const BRIDGE_SPECIFIER = '../components/ui/ForegroundToastBridge';
function loadBridge(): Promise<BridgeModule> {
  return import(BRIDGE_SPECIFIER) as Promise<BridgeModule>;
}

// --- helpers ------------------------------------------------------------------
function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

interface CtxOverrides {
  currentUserId?: string | null;
  activeConversationId?: string | null;
  messagesEnabled?: boolean;
  mutedConversationIds?: ReadonlySet<string>;
  alreadySeen?: ReadonlySet<string>;
  activeToastCount?: number;
}

function baseCtx(over: CtxOverrides = {}) {
  return {
    currentUserId: 'u-me' as string | null,
    activeConversationId: 'c-1' as string | null,
    messagesEnabled: true,
    mutedConversationIds: new Set<string>() as ReadonlySet<string>,
    alreadySeen: new Set<string>() as ReadonlySet<string>,
    activeToastCount: 0,
    ...over,
  };
}

function createdEvent(dataOver: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'new_message',
    data: {
      id: 'm-1',
      conversationId: 'c-2',
      senderId: 'u-other',
      content: 'asal wala text',
      type: 'TEXT',
      ...dataOver,
    },
    envelope: { event_type: 'chat.message.created.v1' },
  };
}

const roots: Root[] = [];
function renderInto(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(node);
  });
  return container;
}

beforeEach(() => {
  navMocks.push.mockClear();
  navMocks.pathname = '/chat/c-1';
  authMocks.user = { id: 'u-me' };
  convMocks.list = [];
  settingsMocks.current = {
    MESSAGES: true,
    CALLS: true,
    STORIES: true,
    STREAKS: true,
    REELS: true,
    SYSTEM: true,
  };
  socketMocks.handler = null;
  socketMocks.subscribe.mockClear();
  setVisibility('visible');
  toastManager.clear();
});

afterEach(() => {
  while (roots.length) {
    const root = roots.pop()!;
    act(() => root.unmount());
  }
  document.body.innerHTML = '';
  toastManager.clear();
});

// ============================================================================
// QC-F-341 — mount pin, gate function, and bridge integration
// ============================================================================
describe('QC-F-341 foreground toast wiring', () => {
  it('T1: AppProviders mounts the toast container with real router navigation and the foreground bridge', () => {
    const candidates = [
      resolve(process.cwd(), 'src/providers/app-providers.tsx'),
      resolve(process.cwd(), 'apps/quantchat/src/providers/app-providers.tsx'),
    ];
    const path = candidates.find((c) => existsSync(c));
    expect(path, 'app-providers.tsx must be findable').toBeTruthy();
    const source = readFileSync(path!, 'utf8');

    // Container imported AND rendered, with navigation wired to the real
    // App Router — a bare mount without onNavigate fails this case on
    // purpose (half a fix is the QC-F-051 disease).
    expect(source).toContain('InAppToastContainer');
    expect(source).toContain('<InAppToastContainer');
    expect(source).toContain('useRouter');
    expect(source).toContain('router.push(deepLink)');
    // The trigger bridge is mounted in the same tree.
    expect(source).toContain('ForegroundToastBridge');
    expect(source).toContain('<ForegroundToastBridge');
  });

  it('T2: container renders a toast pushed through showInAppToast (regression pin)', () => {
    const container = renderInto(<InAppToastContainer onNavigate={vi.fn()} />);
    act(() => {
      showInAppToast({ title: 'QuantChat', body: 'hello', deepLink: '/chat/c-9' });
    });
    expect(container.textContent).toContain('hello');
    expect(toastManager.getToasts()).toHaveLength(1);
  });

  it('T3: fires for a created message in another conversation', async () => {
    const { evaluateForegroundToast, ForegroundToastBridge } = await loadBridge();

    const decision = evaluateForegroundToast(createdEvent(), baseCtx());
    expect(decision).toEqual({
      fire: true,
      title: 'QuantChat',
      body: 'asal wala text',
      conversationId: 'c-2',
    });

    // Integration: the same event through the mounted bridge surfaces as
    // a real toast in the real container, deep-linked to /chat/c-2.
    const container = renderInto(
      <>
        <InAppToastContainer onNavigate={navMocks.push} />
        <ForegroundToastBridge />
      </>,
    );
    expect(socketMocks.handler).toBeTypeOf('function');
    act(() => {
      socketMocks.handler!(createdEvent());
    });
    const toasts = toastManager.getToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]!.deepLink).toBe('/chat/c-2');
    expect(toasts[0]!.body).toBe('asal wala text');
    expect(container.textContent).toContain('asal wala text');
  });

  it('T4: does not fire for the currently open conversation', async () => {
    const { evaluateForegroundToast } = await loadBridge();
    const decision = evaluateForegroundToast(
      createdEvent(),
      baseCtx({ activeConversationId: 'c-2' }),
    );
    expect(decision.fire).toBe(false);
  });

  it("T5: does not fire for the user's own message", async () => {
    const { evaluateForegroundToast } = await loadBridge();
    expect(
      evaluateForegroundToast(createdEvent({ senderId: 'u-me' }), baseCtx()).fire,
    ).toBe(false);
    // Fail-closed: no sender identity at all -> no toast either (G5).
    const anonymous = createdEvent();
    delete (anonymous.data as Record<string, unknown>).senderId;
    expect(evaluateForegroundToast(anonymous, baseCtx()).fire).toBe(false);
  });

  it('T6: does not fire for message edits or deletes', async () => {
    const { evaluateForegroundToast } = await loadBridge();
    for (const eventType of ['chat.message.updated.v1', 'chat.message.deleted.v1']) {
      const event = createdEvent();
      (event.envelope as Record<string, unknown>).event_type = eventType;
      expect(evaluateForegroundToast(event, baseCtx()).fire).toBe(false);
    }
  });

  it('T7: does not fire for the snapshot_required empty hint', async () => {
    const { evaluateForegroundToast } = await loadBridge();
    expect(
      evaluateForegroundToast({ type: 'new_message', data: {} }, baseCtx()).fire,
    ).toBe(false);
  });

  it('T8: does not fire when the MESSAGES category is disabled', async () => {
    const { evaluateForegroundToast } = await loadBridge();
    expect(
      evaluateForegroundToast(createdEvent(), baseCtx({ messagesEnabled: false })).fire,
    ).toBe(false);
  });

  it('T9: ephemeral messages toast with a generic body, never their content', async () => {
    const { evaluateForegroundToast } = await loadBridge();
    for (const metadata of [{ viewOnce: true }, { disappearMode: '24h' }]) {
      const decision = evaluateForegroundToast(
        createdEvent({ content: 'SECRET-EPHEMERAL-TEXT', metadata }),
        baseCtx(),
      );
      expect(decision.fire).toBe(true);
      if (decision.fire) {
        expect(decision.body).toBe('New message');
        expect(decision.body).not.toContain('SECRET');
      }
    }
  });

  it('T10: duplicate delivery of the same message fires only once', async () => {
    const { evaluateForegroundToast } = await loadBridge();
    expect(evaluateForegroundToast(createdEvent(), baseCtx()).fire).toBe(true);
    const second = evaluateForegroundToast(
      createdEvent(),
      baseCtx({ alreadySeen: new Set(['m-1']) }),
    );
    expect(second.fire).toBe(false);
  });

  it('T11: hidden document produces no toast even for a fire-worthy event', async () => {
    const { ForegroundToastBridge } = await loadBridge();
    setVisibility('hidden');
    renderInto(
      <>
        <InAppToastContainer onNavigate={navMocks.push} />
        <ForegroundToastBridge />
      </>,
    );
    expect(socketMocks.handler).toBeTypeOf('function');
    act(() => {
      socketMocks.handler!(createdEvent());
    });
    // G9 lives inside handleForegroundPush — the bridge must delegate to
    // it, never call showInAppToast directly.
    expect(toastManager.getToasts()).toHaveLength(0);
  });

  it('T12: tapping a toast navigates to its deep link and dismisses it (regression pin)', () => {
    const onNavigate = vi.fn();
    const container = renderInto(<InAppToastContainer onNavigate={onNavigate} />);
    act(() => {
      showInAppToast({ title: 'QuantChat', body: 'tap me', deepLink: '/chat/c-2' });
    });
    const card = container.querySelector('[role="status"]');
    expect(card).toBeTruthy();
    act(() => {
      card!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('/chat/c-2');
    expect(toastManager.getToasts()).toHaveLength(0);
  });

  it('T13: fires for a poll-fallback message without an envelope', async () => {
    const { evaluateForegroundToast } = await loadBridge();
    const event = createdEvent();
    delete event.envelope;
    const decision = evaluateForegroundToast(event, baseCtx());
    expect(decision.fire).toBe(true);
  });

  it('T14: does not fire when unauthenticated', async () => {
    const { evaluateForegroundToast } = await loadBridge();
    expect(
      evaluateForegroundToast(createdEvent(), baseCtx({ currentUserId: null })).fire,
    ).toBe(false);
  });

  it('T15: burst cap: no toast beyond three already-active toasts', async () => {
    const { evaluateForegroundToast } = await loadBridge();
    expect(
      evaluateForegroundToast(createdEvent(), baseCtx({ activeToastCount: 3 })).fire,
    ).toBe(false);
  });
});
