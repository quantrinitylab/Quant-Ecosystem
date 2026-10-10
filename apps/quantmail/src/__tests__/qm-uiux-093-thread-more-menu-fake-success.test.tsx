// @vitest-environment jsdom
// ============================================================================
// QM-UIUX-093 — the thread view's "More conversation actions" menu must not
// claim success when the API refused the action.
//
// The defect (zero-defect run-38, D38-1): `apiClient.request()` in
// services/api-client.ts RESOLVES `{ success: false, error }` on failure —
// network errors are caught and returned, and an HTTP error body is parsed
// and returned — it never rejects. The More-menu handlers in
// ConversationalThreadView awaited the call inside try/catch and then showed
// the success toast unconditionally, so the catch was dead code and every
// resolved failure was confirmed to the user as done:
//
//   - Mark unread: flipped local read state + "Marked as unread"
//   - Snooze: "Snoozed until …" success toast
//   - Labels: `Label "…" applied` success toast
//   - Star (header pin + menu): kept the optimistic flip + "Pinned to top"
//
// These tests render the REAL component with the REAL menu, drive the REAL
// buttons, and stub only the transport (apiClient) and the toast sink. The
// failure cases resolve `{ success: false }` exactly as the real client
// does; on the pre-fix handlers every failure case below fails (the success
// toast fires / the star is never rolled back), and the success cases pin
// the normal behaviour so the fix cannot over-correct into always-error.
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
vi.mock('../hooks/useThreadRealtime', () => ({
  useThreadRealtime: () => ({ sendTyping: vi.fn() }),
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
vi.mock('../components/EmailSnooze', () => ({ EmailSnooze: () => null }));
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

// --- framer-motion: the real animation engine is the hang/OOM source --------
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

function buttonByText(text: string): HTMLButtonElement {
  const btn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text || b.textContent?.includes(text),
  );
  if (!btn) throw new Error(`button not found: ${text}`);
  return btn as HTMLButtonElement;
}

async function openMoreMenu() {
  const trigger = document.querySelector(
    'button[aria-label="More conversation actions"]',
  );
  if (!trigger) throw new Error('More menu trigger not found');
  await click(trigger);
}

function toastCalls() {
  return showToast.mock.calls.map((c) => c[0] as { text: string; type: string });
}

beforeEach(() => {
  vi.clearAllMocks();
  onStarToggle = vi.fn();
  // Mount-time calls default to quiet refusals so nothing else in the tree
  // paints fake data; each test overrides the method it exercises.
  api.getThread.mockResolvedValue(REFUSED);
  api.getEmail.mockResolvedValue(REFUSED);
  api.markThreadRead.mockResolvedValue(REFUSED);
  api.aiSuggestReplies.mockResolvedValue(REFUSED);
  api.getLabels.mockResolvedValue({ success: true, data: [] });
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

// --- Mark unread ---------------------------------------------------------------

describe('QM-UIUX-093 — Mark unread', () => {
  it('API refusal shows the error toast, never the success toast', async () => {
    api.markAsUnread.mockResolvedValue(REFUSED);
    renderView([incoming(), incoming()]);
    await flush();

    await openMoreMenu();
    await click(buttonByText('Mark unread'));

    expect(api.markAsUnread).toHaveBeenCalled();
    expect(toastCalls()).toContainEqual({
      text: 'Could not mark as unread',
      type: 'error',
    });
    expect(toastCalls().some((t) => t.text === 'Marked as unread')).toBe(false);
  });

  it('partial refusal (one of two POSTs refused) is still reported as failure', async () => {
    api.markAsUnread
      .mockResolvedValueOnce(ACCEPTED)
      .mockResolvedValueOnce(REFUSED);
    renderView([incoming(), incoming()]);
    await flush();

    await openMoreMenu();
    await click(buttonByText('Mark unread'));

    expect(toastCalls()).toContainEqual({
      text: 'Could not mark as unread',
      type: 'error',
    });
    expect(toastCalls().some((t) => t.text === 'Marked as unread')).toBe(false);
  });

  it('API success keeps the normal success behaviour', async () => {
    api.markAsUnread.mockResolvedValue(ACCEPTED);
    renderView([incoming(), incoming()]);
    await flush();

    await openMoreMenu();
    await click(buttonByText('Mark unread'));

    expect(toastCalls()).toContainEqual({ text: 'Marked as unread', type: 'info' });
    expect(
      toastCalls().some((t) => t.text === 'Could not mark as unread'),
    ).toBe(false);
  });
});

// --- Snooze --------------------------------------------------------------------

describe('QM-UIUX-093 — Snooze', () => {
  async function snoozeViaMenu() {
    await openMoreMenu();
    await click(buttonByText('Snooze…'));
    await click(buttonByText('Tomorrow'));
  }

  it('API refusal shows the error toast, never the "Snoozed until" success', async () => {
    api.snoozeEmail.mockResolvedValue(REFUSED);
    renderView([incoming()]);
    await flush();

    await snoozeViaMenu();

    expect(api.snoozeEmail).toHaveBeenCalled();
    expect(toastCalls()).toContainEqual({
      text: 'Could not snooze conversation',
      type: 'error',
    });
    expect(toastCalls().some((t) => t.text.startsWith('Snoozed until'))).toBe(
      false,
    );
  });

  it('API success keeps the normal "Snoozed until" behaviour', async () => {
    api.snoozeEmail.mockResolvedValue(ACCEPTED);
    renderView([incoming()]);
    await flush();

    await snoozeViaMenu();

    const snoozed = toastCalls().find((t) => t.text.startsWith('Snoozed until'));
    expect(snoozed?.type).toBe('success');
    expect(
      toastCalls().some((t) => t.text === 'Could not snooze conversation'),
    ).toBe(false);
  });
});

// --- Labels --------------------------------------------------------------------

describe('QM-UIUX-093 — Apply label', () => {
  async function applyLabelViaMenu() {
    await openMoreMenu();
    await click(buttonByText('Labels…'));
    await click(buttonByText('Receipts'));
  }

  beforeEach(() => {
    api.getLabels.mockResolvedValue({
      success: true,
      data: [{ id: 'lbl-1', name: 'Receipts', color: '#888888' }],
    });
  });

  it('API refusal shows the error toast, never the "applied" success', async () => {
    api.addLabel.mockResolvedValue(REFUSED);
    renderView([incoming()]);
    await flush();

    await applyLabelViaMenu();

    expect(api.addLabel).toHaveBeenCalled();
    expect(toastCalls()).toContainEqual({
      text: 'Could not apply label',
      type: 'error',
    });
    expect(toastCalls().some((t) => t.text === 'Label "Receipts" applied')).toBe(
      false,
    );
  });

  it('API success keeps the normal "applied" behaviour', async () => {
    api.addLabel.mockResolvedValue(ACCEPTED);
    renderView([incoming()]);
    await flush();

    await applyLabelViaMenu();

    expect(toastCalls()).toContainEqual({
      text: 'Label "Receipts" applied',
      type: 'success',
    });
    expect(toastCalls().some((t) => t.text === 'Could not apply label')).toBe(
      false,
    );
  });
});

// --- Star ----------------------------------------------------------------------

describe('QM-UIUX-093 — Star / pin', () => {
  function pinButton(): HTMLButtonElement {
    const btn = document.querySelector(
      'button[title="Pin to top"], button[title="Pinned to top"]',
    );
    if (!btn) throw new Error('pin button not found');
    return btn as HTMLButtonElement;
  }

  it('API refusal rolls the optimistic star back and shows an error, never "Pinned to top"', async () => {
    api.toggleStar.mockResolvedValue(REFUSED);
    renderView([incoming()]);
    await flush();

    await click(pinButton());

    expect(api.toggleStar).toHaveBeenCalled();
    // Optimistic flip out, rollback back in — the parent is never left
    // believing a star the server refused.
    expect(onStarToggle.mock.calls).toEqual([[true], [false]]);
    expect(toastCalls()).toContainEqual({
      text: 'Could not update star',
      type: 'error',
    });
    expect(toastCalls().some((t) => t.text === 'Pinned to top')).toBe(false);
    // The button itself is back to its unstarred affordance.
    expect(pinButton().getAttribute('title')).toBe('Pin to top');
  });

  it('API success keeps the star and the normal toast', async () => {
    api.toggleStar.mockResolvedValue(ACCEPTED);
    renderView([incoming()]);
    await flush();

    await click(pinButton());

    expect(onStarToggle.mock.calls).toEqual([[true]]);
    expect(toastCalls()).toContainEqual({ text: 'Pinned to top', type: 'info' });
    expect(toastCalls().some((t) => t.text === 'Could not update star')).toBe(
      false,
    );
    expect(pinButton().getAttribute('title')).toBe('Pinned to top');
  });
});
