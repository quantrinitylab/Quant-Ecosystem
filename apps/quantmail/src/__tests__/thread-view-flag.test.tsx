// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Email } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const { showToast, api } = vi.hoisted(() => {
  const showToast = vi.fn();
  const api = {
    setFlagged: vi.fn(),
    togglePin: vi.fn(),
    toggleStar: vi.fn(),
    markAsUnread: vi.fn(),
    snoozeEmail: vi.fn(),
    applyLabel: vi.fn(),
    getLabels: vi.fn(),
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
vi.mock('../components/ThreadBubbleGestures', () => ({
  ThreadBubbleShell: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
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
  IconClock: () => null,
}));
vi.mock('../components/SwipeableEmailRow', () => ({
  isCoarsePointer: () => false,
}));
vi.mock('../lib/markdown', () => ({
  looksLikeMarkdown: () => false,
  useSafeMarkdownHtml: () => '',
}));

vi.mock('framer-motion', () => {
  const toPlain = (tag: string) => {
    const Component = React.forwardRef(({ children, ...rest }: any, ref: any) =>
      React.createElement(tag, { ...rest, ref }, children),
    );
    Component.displayName = `Plain_${tag}`;
    return Component;
  };
  const tagCache = new Map<string, React.ComponentType<any>>();
  const motionProxy = new Proxy(
    {},
    {
      get: (_target, prop: string) => {
        const tag = prop.toLowerCase();
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

let seq = 0;
const mockMsg = (over: Partial<Email> = {}): Email =>
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
    isPinned: false,
    isFlagged: false,
    isArchived: false,
    labels: [],
    attachments: [],
    createdAt: new Date('2026-10-09T10:00:00Z'),
    updatedAt: new Date('2026-10-09T10:00:00Z'),
    receivedAt: new Date('2026-10-09T10:00:00Z'),
    ...over,
  }) as Email;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let client: QueryClient;

function renderView(emails: Email[], threadId = 'thread-1') {
  if (!host) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  act(() => {
    root!.render(
      <QueryClientProvider client={client}>
        <ConversationalThreadView
          threadId={threadId}
          initialEmails={emails}
          subject="Test subject"
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

async function openMoreMenu() {
  const trigger = document.querySelector('button[aria-label="More conversation actions"]');
  if (!trigger) throw new Error('More menu trigger not found');
  await click(trigger);
}

function findButtonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === text || b.textContent?.includes(text),
  );
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  showToast.mockClear();
  Object.values(api).forEach((fn) => fn.mockReset());
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  host = null;
  root = null;
});

describe('ConversationalThreadView flagging (AC-16, HIGH 2)', () => {
  it('shows "Flag" for unflagged conversation and calls apiClient.setFlagged', async () => {
    api.setFlagged.mockResolvedValueOnce({ success: true });
    const msg = mockMsg({ id: 'm1', isFlagged: false });
    renderView([msg]);

    await openMoreMenu();
    const flagBtn = findButtonByText('Flag');
    expect(flagBtn).toBeDefined();

    await click(flagBtn!);

    expect(api.setFlagged).toHaveBeenCalledWith('m1', true);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Conversation flagged',
        type: 'success',
        undoAction: expect.any(Function),
      }),
    );
  });

  it('shows "Unflag" when any loaded message is flagged, even if not in list cache', async () => {
    api.setFlagged.mockResolvedValueOnce({ success: true });
    const m1 = mockMsg({ id: 'm1', isFlagged: false });
    const m2 = mockMsg({ id: 'm2', isFlagged: true });
    renderView([m1, m2]);

    await openMoreMenu();
    const unflagBtn = findButtonByText('Unflag');
    expect(unflagBtn).toBeDefined();

    await click(unflagBtn!);

    // Target is false: only wrong-side (m2) needs to be unflagged
    expect(api.setFlagged).toHaveBeenCalledWith('m2', false);
    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Conversation unflagged',
        type: 'success',
      }),
    );
  });

  it('restores state and shows error toast on resolved { success: false } without success toast', async () => {
    api.setFlagged.mockResolvedValueOnce({ success: false, error: { message: 'Refused' } });
    const msg = mockMsg({ id: 'm1', isFlagged: false });
    renderView([msg]);

    await openMoreMenu();
    const flagBtn = findButtonByText('Flag');
    await click(flagBtn!);

    expect(showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Could not update flag',
        type: 'error',
      }),
    );
    expect(showToast).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
      }),
    );
  });

  it('Undo operates only on original IDs after conversation switch (HIGH 2)', async () => {
    api.setFlagged.mockResolvedValue({ success: true });
    const convA = [mockMsg({ id: 'a1', isFlagged: false })];
    renderView(convA, 'thread-A');

    // Flag conversation A
    await openMoreMenu();
    await click(findButtonByText('Flag')!);
    expect(api.setFlagged).toHaveBeenCalledWith('a1', true);

    const toastCall = showToast.mock.calls.find((c) => c[0]?.undoAction);
    const undoAction = toastCall![0].undoAction;
    expect(undoAction).toBeDefined();

    // Now re-seed view with conversation B
    const convB = [mockMsg({ id: 'b1', isFlagged: false })];
    renderView(convB, 'thread-B');
    api.setFlagged.mockClear();

    // Fire Undo
    await act(async () => {
      undoAction();
    });
    await flush();

    // Undo must call setFlagged ONLY for conversation A's IDs ('a1', false), NOT B ('b1')
    expect(api.setFlagged).toHaveBeenCalledWith('a1', false);
    expect(api.setFlagged).not.toHaveBeenCalledWith('b1', expect.anything());
  });

  it('Pin behavior is preserved and unchanged', async () => {
    api.togglePin.mockResolvedValueOnce({ success: true });
    const msg = mockMsg({ id: 'm1' });
    renderView([msg]);

    await openMoreMenu();
    const pinBtn = findButtonByText('Pin');
    expect(pinBtn).toBeDefined();
    await click(pinBtn!);

    expect(api.togglePin).toHaveBeenCalledWith('m1');
  });
});
