// @vitest-environment jsdom
// ============================================================================
// QM-UIUX-095 — the thread header/banner "Not spam" rescue must not
// claim success when the API refused the action.
//
// The defect (093 follow-up): `apiClient.request()` in
// services/api-client.ts RESOLVES `{ success: false, error }` on failure —
// network errors are caught and returned, and an HTTP error body is parsed
// and returned — it never rejects. `handleRescueSpam` in
// ConversationalThreadView awaited `markNotSpam` inside try/catch and then
// showed the success toast, called onNotSpam and closed the view
// unconditionally, so the catch was dead code for resolved failures and
// every refusal was confirmed to the user as rescued (the spam banner /
// state was removed even though the server kept the mail in spam).
// QM-UIUX-093 fixed the same defect class for the More-menu handlers;
// this file covers the header/banner "Not spam" action it left out.
//
// These tests render the REAL component with the REAL "Not spam" buttons,
// drive the REAL buttons, and stub only the transport (apiClient) and the
// toast sink. The failure cases resolve `{ success: false }` exactly as
// the real client does; on the pre-fix handler every failure case below
// fails (the success toast fires / onNotSpam + onClose are called), and
// the success case pins the normal behaviour so the fix cannot
// over-correct into always-error. Stable-mock pattern reused from 093:
// one referentially stable sendTyping and a cached framer-motion proxy,
// otherwise the [threadId, sendTyping] effect loops and the worker OOMs.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Email } from '../types';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

// jsdom gaps the real browser fills: framer-motion's reduced-motion probe
// needs matchMedia, and the stream's scroll-to-latest needs scrollIntoView.
// Environment shims only — no product behaviour is stubbed by these.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// --- Transport + toast sink (the two seams under test) ----------------------

// vi.hoisted: the vi.mock factories below are hoisted above these consts,
// so the shared stubs must be created inside vi.hoisted to exist by then.
const { showToast, api } = vi.hoisted(() => {
  const showToast = vi.fn();
  const api = {
    markAsUnread: vi.fn(),
    snoozeEmail: vi.fn(),
    addLabel: vi.fn(),
    getLabels: vi.fn(),
    toggleStar: vi.fn(),
    markNotSpam: vi.fn(),
    getThread: vi.fn(),
    getEmail: vi.fn(),
    markThreadRead: vi.fn(),
    aiSummarizeThread: vi.fn(),
    aiSuggestReplies: vi.fn(),
    replyToEmail: vi.fn(),
  };
  return { showToast, api };
});

vi.mock('../services/api-client', () => ({ apiClient: api }));
vi.mock('../components/InboxToast', () => ({ showToast }));

// --- Heavy neighbours the header does not exercise --------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/thread/thread-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));
vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: { email: 'me@quantmail.in', name: 'Me' } }),
}));
vi.mock('../hooks/useContactGroups', () => ({
  useContactGroups: () => ({ data: [] }),
  useUpdateContactGroup: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteContactGroup: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));
vi.mock('../hooks/useInbox', () => ({
  useInbox: () => ({ data: undefined, isPending: false }),
}));
// STABILITY IS LOAD-BEARING: the real useThreadRealtime returns a
// useCallback(..., []) sendTyping, so ConversationalThreadView's
// [threadId, sendTyping] effect runs once. A fresh vi.fn() per render makes
// that effect re-run on every render; the effect calls setTypingPeers({})
// unconditionally, so render -> effect -> setState -> render loops forever
// inside act() and the worker leaks until OOM (CI attempts 1-9). One stable
// function identity for the whole file is the fix.
const stableSendTyping = vi.fn();
vi.mock('../hooks/useThreadRealtime', () => ({
  useThreadRealtime: () => ({ sendTyping: stableSendTyping }),
}));
vi.mock('../hooks/usePullToRefresh', () => ({
  usePullToRefresh: () => ({ listProps: {}, pullDistance: 0, isRefreshing: false }),
}));
vi.mock('../components/UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));
vi.mock('../components/GroupInfoModal', () => ({
  GroupInfoModal: () => null,
  ContactProfileInspector: () => null,
  Inspector: () => null,
}));
vi.mock('../components/GroupEditorModal', () => ({
  GroupEditorModal: () => null,
}));
vi.mock('../components/AddMemberModal', () => ({
  AddMemberModal: () => null,
}));
vi.mock('../components/Quanty', () => ({
  Quanty: () => null,
}));
vi.mock('../lib/quanty/reactions', () => ({
  quantyReact: vi.fn(),
  useQuantyMood: () => 'idle',
}));

// Leaf presentational children + the markdown pipeline: none of them is on
// the More-menu path (the header, AnchoredMenu and the handlers under test
// are all real), and their transitive graphs (marked/dompurify, attachment
// previews, summary card) are what makes importing this 3.4k-line component
// heavy enough to OOM a small vitest worker. Stubbed at the module seam,
// exactly like the neighbours above.
vi.mock('../components/ThreadBubbleGestures', () => ({
  ThreadBubbleShell: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock('../components/SmartReplySuggestions', () => ({
  SmartReplySuggestions: () => null,
}));
vi.mock('../components/IdentityAvatar', () => ({
  IdentityAvatar: () => null,
}));
vi.mock('../components/EmailLetterCard', () => ({
  EmailLetterCard: () => null,
}));
vi.mock('../components/MessageKindBadge', () => ({
  MessageKindBadge: () => null,
  ThreadKindBadge: () => null,
}));
vi.mock('../components/AttachmentPreview', () => ({
  AttachmentPreview: () => null,
}));
vi.mock('../components/EmailReadReceipt', () => ({
  EmailReadReceipt: () => null,
}));
vi.mock('../components/ThreadSummaryCard', () => ({
  ThreadSummaryCard: () => null,
  messagesToSummaryPayload: () => [],
}));
vi.mock('../components/icons', () => ({
  IconChat: () => null,
  IconMail: () => null,
}));
vi.mock('../components/SwipeableEmailRow', () => ({
  isCoarsePointer: () => false,
}));
vi.mock('../lib/markdown', () => ({
  looksLikeMarkdown: () => false,
  useSafeMarkdownHtml: () => '',
}));

// --- framer-motion: heavy import (118s vs 12s locally), NOT the hang source ---
// Run-9 evidence (gate job 114183252419): the quarantined solo invocation ran
// 523.75s for 9 tests with testTimeout=60000 and `tests 0ms` — i.e. every
// test hung into its 60s timeout while the worker leaked ~8 GB and died.
// The real motion/AnimatePresence components (used by both
// ConversationalThreadView and the real AnchoredMenu on the menu path) start
// rAF-driven animation loops under jsdom that never settle inside React 19
// act(), so each test hangs and leaks until the timeout/OOM killer.
// Map motion.* to plain host elements, AnimatePresence to a fragment, and
// report reduced motion. The assertions below only read button text, toast
// calls and titles — none of which need real animation.
vi.mock('framer-motion', () => {
  // framer-motion-only props must not reach the DOM as unknown attributes.
  const STRIP = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants', 'layout', 'layoutId',
    'whileHover', 'whileTap', 'whileInView', 'whileFocus', 'whileDrag', 'drag',
    'dragConstraints', 'dragElastic', 'dragMomentum', 'onAnimationStart',
    'onAnimationComplete', 'onHoverStart', 'onHoverEnd', 'onTap', 'onPan',
    'onDragEnd', 'onDragStart', 'onViewportEnter', 'onViewportLeave',
  ]);
  const toPlain =
    (tag: string) =>
    ({ children, ...rest }: { children?: React.ReactNode; [k: string]: unknown }) => {
      const domProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (!STRIP.has(k)) domProps[k] = v;
      }
      return React.createElement(tag, domProps, children);
    };
  // The Proxy `get` trap fires on EVERY `motion.div` access — on every
  // render. Without a cache, each access returned a FRESH component
  // function, so React saw a different component identity at the same tree
  // position on every render and entered an unmount/remount loop: the
  // hang+OOM signature of gate job 114188075863 (run 38043411872 — FATAL
  // ERROR at 8 GB, Duration 785.97s, tests 0ms). Cache per tag so the
  // identity is stable across renders, exactly like real `motion.div`.
  const tagCache = new Map<string, ReturnType<typeof toPlain>>();
  const motionProxy = new Proxy(
    {},
    {
      get: (_t, tag) => {
        if (typeof tag !== 'string') return undefined;
        let Comp = tagCache.get(tag);
        if (!Comp) {
          Comp = toPlain(tag);
          tagCache.set(tag, Comp);
        }
        return Comp;
      },
    },
  );
  const noopMotionValue = (v: unknown) => ({
    get: () => v,
    set: () => {},
    on: () => () => {},
  });
  return {
    motion: motionProxy,
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => true,
    useAnimation: () => ({
      start: () => Promise.resolve(),
      stop: () => {},
      set: () => {},
    }),
    useMotionValue: noopMotionValue,
    useTransform: () => noopMotionValue(0),
    useSpring: (v: unknown) => v,
    animate: () => ({ stop: () => {} }),
  };
});

import { ConversationalThreadView } from '../components/ConversationalThreadView';

// --- Fixtures ----------------------------------------------------------------

const REFUSED = {
  success: false,
  error: { code: 'SERVER_ERROR', message: 'Backend refused', statusCode: 500 },
};
const ACCEPTED = { success: true, data: { message: 'ok' } };

let seq = 0;
const incoming = (over: Partial<Email> = {}): Email =>
  ({
    id: `msg-${++seq}`,
    threadId: 'thread-1',
    userId: 'user-1',
    from: { email: 'asha@example.com', name: 'Asha' },
    to: [{ email: 'me@quantmail.in', name: 'Me' }],
    cc: [],
    bcc: [],
    subject: 'Lunch tomorrow?',
    bodyText: 'hello there',
    bodyHtml: '',
    snippet: 'hello there',
    priority: 'normal',
    category: 'primary',
    status: 'delivered',
    messageKind: 'mail',
    isRead: true,
    isStarred: false,
    isArchived: false,
    labels: [],
    attachments: [],
    createdAt: new Date('2026-10-09T10:00:00Z'),
    updatedAt: new Date('2026-10-09T10:00:00Z'),
    receivedAt: new Date('2026-10-09T10:00:00Z'),
    ...over,
  }) as Email;

// --- Harness -----------------------------------------------------------------

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let onStarToggle: ReturnType<typeof vi.fn>;
let onNotSpam: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

function renderView(emails: Email[]) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  act(() => {
    root!.render(
      <QueryClientProvider client={client}>
        <ConversationalThreadView
          threadId="thread-1"
          initialEmails={emails}
          subject="Lunch tomorrow?"
          onStarToggle={onStarToggle}
          isSpam
          onNotSpam={onNotSpam}
          onClose={onClose}
        />
      </QueryClientProvider>,
    );
  });
  return host!;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
}

function toastCalls() {
  return showToast.mock.calls.map((c) => c[0] as { text: string; type: string });
}

beforeEach(() => {
  vi.clearAllMocks();
  onStarToggle = vi.fn();
  onNotSpam = vi.fn();
  onClose = vi.fn();
  // Mount-time calls default to quiet refusals so nothing else in the tree
  // paints fake data; each test overrides the method it exercises.
  api.getThread.mockResolvedValue(REFUSED);
  api.getEmail.mockResolvedValue(REFUSED);
  api.markThreadRead.mockResolvedValue(REFUSED);
  api.aiSuggestReplies.mockResolvedValue(REFUSED);
  api.getLabels.mockResolvedValue({ success: true, data: [] });
  api.markNotSpam.mockResolvedValue(REFUSED);
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
});

// --- Not spam rescue -----------------------------------------------------------

describe('QM-UIUX-095 — Not spam rescue (handleRescueSpam)', () => {
  function notSpamButtons(): HTMLButtonElement[] {
    return Array.from(document.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Not spam'),
    ) as HTMLButtonElement[];
  }

  function spamBannerPresent(): boolean {
    return document.body.textContent?.includes('This message is in Spam') ?? false;
  }

  it('API refusal shows the error toast, never the success toast, and keeps the spam state/banner', async () => {
    api.markNotSpam.mockResolvedValue(REFUSED);
    const msg = incoming();
    renderView([msg]);
    await flush();
    expect(spamBannerPresent()).toBe(true);
    expect(notSpamButtons().length).toBeGreaterThan(0);

    await click(notSpamButtons()[0]);

    expect(api.markNotSpam).toHaveBeenCalledWith(msg.id);
    // Existing error toast: the handler's catch surfaces the server message.
    expect(toastCalls()).toContainEqual({ text: 'Backend refused', type: 'error' });
    expect(
      toastCalls().some((t) => t.text === 'Rescued from spam — moved back to inbox'),
    ).toBe(false);
    // The spam state must NOT be removed: parent is not told it was rescued
    // and the view is not closed.
    expect(onNotSpam).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(spamBannerPresent()).toBe(true);
    expect(notSpamButtons().length).toBeGreaterThan(0);
  });

  it('API refusal without an error message falls back to the existing "Failed to rescue email" toast', async () => {
    api.markNotSpam.mockResolvedValue({ success: false });
    renderView([incoming()]);
    await flush();

    await click(notSpamButtons()[0]);

    expect(toastCalls()).toContainEqual({
      text: 'Failed to rescue email',
      type: 'error',
    });
    expect(
      toastCalls().some((t) => t.text === 'Rescued from spam — moved back to inbox'),
    ).toBe(false);
    expect(onNotSpam).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(spamBannerPresent()).toBe(true);
  });

  it('API rejection still shows the error toast and keeps the spam state (pre-existing catch path)', async () => {
    api.markNotSpam.mockRejectedValue(new Error('Network down'));
    renderView([incoming()]);
    await flush();

    await click(notSpamButtons()[0]);

    expect(toastCalls()).toContainEqual({ text: 'Network down', type: 'error' });
    expect(
      toastCalls().some((t) => t.text === 'Rescued from spam — moved back to inbox'),
    ).toBe(false);
    expect(onNotSpam).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(spamBannerPresent()).toBe(true);
  });

  it('API success keeps the normal rescue behaviour (success toast + onNotSpam + onClose)', async () => {
    api.markNotSpam.mockResolvedValue(ACCEPTED);
    const msg = incoming();
    renderView([msg]);
    await flush();

    await click(notSpamButtons()[0]);

    expect(api.markNotSpam).toHaveBeenCalledWith(msg.id);
    expect(toastCalls()).toContainEqual({
      text: 'Rescued from spam — moved back to inbox',
      type: 'success',
    });
    expect(toastCalls().some((t) => t.type === 'error')).toBe(false);
    expect(onNotSpam).toHaveBeenCalledTimes(1);
    expect(onNotSpam.mock.calls[0][0]).toContain(msg.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('banner "Not spam" button follows the same rule on refusal', async () => {
    api.markNotSpam.mockResolvedValue(REFUSED);
    renderView([incoming()]);
    await flush();
    const buttons = notSpamButtons();
    // Header button + banner button both exist for a quarantined thread;
    // drive the LAST one (the banner) to prove both entry points are fixed
    // (they share the one handleRescueSpam handler).
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    await click(buttons[buttons.length - 1]);

    expect(toastCalls()).toContainEqual({ text: 'Backend refused', type: 'error' });
    expect(
      toastCalls().some((t) => t.text === 'Rescued from spam — moved back to inbox'),
    ).toBe(false);
    expect(onNotSpam).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(spamBannerPresent()).toBe(true);
  });
});
