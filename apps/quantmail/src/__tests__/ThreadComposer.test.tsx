// @vitest-environment jsdom
// Thread composer + People home routing tests.
//
// The composer never touches a DOM here: the send orchestration lives in the
// pure `executeThreadSend` helper (injected backend calls), so success,
// failure, draft-preservation and the exact #771 call shape are asserted
// directly. Component-level assertions use renderToStaticMarkup, the repo's
// established pattern for component tests (no @testing-library/react in this
// app). Sibling-owned modules (peopleGrouping, PeopleList, PersonThread,
// PeopleWorldTabs) are module-mocked against the shared contract so these
// tests pin the exact props this part of the feature passes.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const toastMock = vi.hoisted(() => vi.fn());
const composeMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const inboxState = vi.hoisted(() => ({
  data: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
const groupState = vi.hoisted(() => ({ convos: [] as unknown[] }));
const navState = vi.hoisted(() => ({ params: {} as Record<string, string>, push: vi.fn() }));
// Last conversation the (mocked) PersonThread rendered — the page-level
// phantom-bubble test reads this after a failed send settles.
const capturedThreadConversation = vi.hoisted(() => ({ current: null as any }));

vi.mock('../services/api-client', () => ({
  apiClient: { composeEmail: composeMock, sendEmail: sendMock },
}));
vi.mock('../components/InboxToast', () => ({ showToast: toastMock }));
vi.mock('../hooks/useInbox', () => ({
  useInbox: () => ({
    data: inboxState.data,
    isLoading: inboxState.isLoading,
    isError: inboxState.isError,
    refetch: inboxState.refetch,
  }),
}));
// The people thread page wires CUST-P1-4 keyboard shortcuts through
// useMailMutations, which needs a react-query QueryClientProvider in
// production (provided by the root layout). These tests render the page
// without providers, so the sibling-owned hook is mocked against its
// contract — the same pattern used for useInbox above.
const mutationsMock = vi.hoisted(() => ({
  archive: vi.fn(),
  markUnread: vi.fn(),
  toggleStar: vi.fn(),
}));
vi.mock('../hooks/useMailMutations', () => ({
  useMailMutations: () => mutationsMock,
}));
vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: { email: 'me@quantmail.in' } }),
}));
vi.mock('../lib/peopleGrouping', () => ({ groupEmailsByPerson: () => groupState.convos }));
vi.mock('../components/PeopleWorldTabs', () => ({
  PeopleWorldTabs: ({ world, counts }: any) => (
    <div data-testid="world-tabs" data-world={world}>
      log:{counts.log} groups:{counts.groups} updates:{counts.updates}
    </div>
  ),
}));
vi.mock('../components/PeopleList', () => ({
  PeopleList: ({ conversations, onSelect, searchQuery, loading }: any) => (
    <div data-testid="people-list" data-search={searchQuery} data-loading={String(!!loading)}>
      {conversations.map((c: any) => (
        <button key={c.personKey} data-testid={`person-${c.personKey}`} onClick={() => onSelect(c)}>
          {c.name}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('../components/PersonThread', () => ({
  PersonThread: ({ conversation, renderComposer }: any) => {
    // Captured for the phantom-bubble tests: the page-level assertion reads
    // the conversation the thread actually rendered after a failed send.
    capturedThreadConversation.current = conversation;
    return (
      <div data-testid="person-thread">
        <span data-testid="thread-name">{conversation.name}</span>
        {renderComposer}
      </div>
    );
  },
}));
vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: any) => <div data-testid="app-shell">{children}</div>,
}));
// QM fix qm-personthread-smart-replies: the real SmartReplySuggestions fetches
// from the backend inside a useEffect (never runs under renderToStaticMarkup)
// and pulls framer-motion. The mock keeps the page-wiring assertions honest —
// it renders a tappable chip wired to the real onSelectReply prop, so the
// chip → composer prefill loop is exercised without network or animation.
const smartReplyChipText = vi.hoisted(() => ({ text: 'Sounds good, thanks!' }));
vi.mock('../components/SmartReplySuggestions', () => ({
  SmartReplySuggestions: ({ emailId, onSelectReply }: any) => (
    <div data-testid="smart-replies" data-email-id={emailId}>
      <button type="button" data-testid="smart-reply-chip" onClick={() => onSelectReply(smartReplyChipText.text)}>
        {smartReplyChipText.text}
      </button>
    </div>
  ),
}));
vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navState.push }),
  useParams: () => navState.params,
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : ''} {...rest}>
      {children}
    </a>
  ),
}));

import { ThreadComposer, defaultReplySubject, executeThreadSend } from '../components/ThreadComposer';
import { PeopleHome } from '../components/PeopleHome';
import PersonPage from '../app/people/[personId]/page';

function makeConversation(overrides: Record<string, unknown> = {}) {
  const lastMessage = {
    id: 'msg-9',
    subject: 'Hi there',
    from: { email: 'ada@x.com', name: 'Ada' },
    to: [{ email: 'me@quantmail.in' }],
  };
  return {
    personKey: 'ada',
    name: 'Ada',
    email: 'ada@x.com',
    messages: [lastMessage],
    lastMessage,
    lastActivityAt: new Date('2026-10-10T10:00:00Z'),
    unreadCount: 0,
    lastMessageFromMe: false,
    world: 'log',
    participantEmails: ['ada@x.com'],
    ...overrides,
  };
}

function okCompose(id = 'draft-1') {
  return { success: true, data: { id }, error: undefined };
}
function okSend() {
  return { success: true, data: undefined, error: undefined };
}

beforeEach(() => {
  vi.clearAllMocks();
  inboxState.data = [];
  inboxState.isLoading = false;
  inboxState.isError = false;
  groupState.convos = [];
  navState.params = {};
});

describe('defaultReplySubject', () => {
  it('prefixes a bare subject with Re:', () => {
    expect(defaultReplySubject('Hi there')).toBe('Re: Hi there');
  });
  it('does not double-prefix an existing Re:', () => {
    expect(defaultReplySubject('Re: Hi there')).toBe('Re: Hi there');
  });
  it('treats the prefix case-insensitively', () => {
    expect(defaultReplySubject('re: hi')).toBe('re: hi');
    expect(defaultReplySubject('RE:Quarterly report')).toBe('RE:Quarterly report');
  });
  it('falls back to a lone Re: when the thread has no subject', () => {
    expect(defaultReplySubject('')).toBe('Re:');
    expect(defaultReplySubject('   ')).toBe('Re:');
  });
});

describe('executeThreadSend (the fixed #771 send path)', () => {
  const conversation = makeConversation();

  it('composes a chat-kind draft in-reply-to the last message, then sends it', async () => {
    composeMock.mockResolvedValue(okCompose('draft-1'));
    sendMock.mockResolvedValue(okSend());

    const outcome = await executeThreadSend(
      {
        composeEmail: composeMock,
        sendEmail: sendMock,
        toast: (text, type) => toastMock({ text, type }),
      },
      conversation as any,
      'Re: Hi there',
      'hello',
    );

    expect(outcome.ok).toBe(true);
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock).toHaveBeenCalledWith({
      to: [{ email: 'ada@x.com' }],
      subject: 'Re: Hi there',
      bodyText: 'hello',
      messageKind: 'chat',
      inReplyTo: 'msg-9',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith('draft-1');
    expect(toastMock).toHaveBeenCalledWith({ text: 'Message sent', type: 'success' });
  });

  it('on compose failure: error toast, send never attempted, draft never sent', async () => {
    composeMock.mockResolvedValue({ success: false, data: undefined, error: { message: 'Quota exceeded' } });

    const outcome = await executeThreadSend(
      {
        composeEmail: composeMock,
        sendEmail: sendMock,
        toast: (text, type) => toastMock({ text, type }),
      },
      conversation as any,
      'Re: Hi there',
      'hello',
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.errorMessage).toBe('Quota exceeded');
    expect(sendMock).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({ text: 'Quota exceeded', type: 'error' });
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' }),
    );
  });

  it('on send failure: error toast with the server message', async () => {
    composeMock.mockResolvedValue(okCompose('draft-2'));
    sendMock.mockResolvedValue({ success: false, data: undefined, error: { message: 'SMTP down' } });

    const outcome = await executeThreadSend(
      {
        composeEmail: composeMock,
        sendEmail: sendMock,
        toast: (text, type) => toastMock({ text, type }),
      },
      conversation as any,
      'Re: Hi there',
      'hello',
    );

    expect(outcome.ok).toBe(false);
    expect(toastMock).toHaveBeenCalledWith({ text: 'SMTP down', type: 'error' });
  });

  it('on a thrown network error: error toast, no success toast', async () => {
    composeMock.mockRejectedValue(new Error('Network unreachable'));

    const outcome = await executeThreadSend(
      {
        composeEmail: composeMock,
        sendEmail: sendMock,
        toast: (text, type) => toastMock({ text, type }),
      },
      conversation as any,
      'Re: Hi there',
      'hello',
    );

    expect(outcome.ok).toBe(false);
    expect(toastMock).toHaveBeenCalledWith({ text: 'Network unreachable', type: 'error' });
  });

  it('never touches navigation, discard, or anything outside compose/send/toast', async () => {
    composeMock.mockResolvedValue(okCompose());
    sendMock.mockResolvedValue(okSend());
    const touched = new Set<string>();
    const recording = new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          touched.add(prop);
          if (prop === 'composeEmail') return composeMock;
          if (prop === 'sendEmail') return sendMock;
          if (prop === 'toast') return () => undefined;
          throw new Error(`unexpected dependency access: ${prop}`);
        },
      },
    );

    await executeThreadSend(recording as any, conversation as any, 'Re: Hi there', 'hello');

    expect([...touched].sort()).toEqual(['composeEmail', 'sendEmail', 'toast']);
  });
});

describe('ThreadComposer rendering', () => {
  it('renders disabled send with an empty body (Enter-to-send hint shown)', () => {
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation() as any} currentUserEmail="me@quantmail.in" />,
    );
    expect(html).toContain('Message Ada…');
    expect(html).toContain('New topic');
    // Send is disabled while the box is empty — the exact gate `handleSend`
    // enforces too, so the button can never look sendable when it is not.
    expect(html).toMatch(/disabled[^>]*aria-label="Send message"/);
    expect(html).toContain('Enter to send');
  });

  it('shows no subject field until New topic is toggled', () => {
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation() as any} currentUserEmail="me@quantmail.in" />,
    );
    expect(html).not.toContain('aria-label="New topic subject"');
    expect(html).toContain('Replying: Re: Hi there');
  });

  it('exposes no discard handler — the props contract has no onDiscard', () => {
    // The component must never call a discard handler on the send path, so it
    // must not accept one. A compile-time guard would be ideal; the runtime
    // half is asserted here: the static render carries no discard affordance.
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation() as any} currentUserEmail="me@quantmail.in" />,
    );
    expect(html.toLowerCase()).not.toContain('discard');
  });

  it('P1-C: fires onSendStart with the text and subject before the network send', async () => {
    const { act } = await import('react');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { createRoot } = await import('react-dom/client');
    composeMock.mockResolvedValue(okCompose());
    sendMock.mockResolvedValue(okSend());

    const onSendStart = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ThreadComposer
          conversation={makeConversation() as any}
          currentUserEmail="me@quantmail.in"
          onSendStart={onSendStart}
        />,
      );
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(textarea),
        'value',
      )?.set;
      setter?.call(textarea, 'optimistic hello');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const sendButton = container.querySelector(
      'button[aria-label="Send message"]',
    ) as HTMLButtonElement;
    expect(sendButton).not.toBeNull();
    expect(sendButton.disabled).toBe(false);
    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Fired synchronously on send-start, before the async compose/send.
    expect(onSendStart).toHaveBeenCalledTimes(1);
    expect(onSendStart).toHaveBeenCalledWith('optimistic hello', 'Re: Hi there');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

// DOM helper: mount the real composer, type text, click send, let the send
// settle. Returns the container for assertions.
async function mountComposerAndSend(
  text: string,
  handlers: { onSendStart?: () => void; onSendError?: (text: string, subject: string) => void; onSent?: () => void },
) {
  const { act } = await import('react');
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThreadComposer
        conversation={makeConversation() as any}
        currentUserEmail="me@quantmail.in"
        onSendStart={handlers.onSendStart as any}
        onSendError={handlers.onSendError}
        onSent={handlers.onSent}
      />,
    );
  });

  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  expect(textarea).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(textarea),
      'value',
    )?.set;
    setter?.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });

  const sendButton = container.querySelector(
    'button[aria-label="Send message"]',
  ) as HTMLButtonElement;
  expect(sendButton).not.toBeNull();
  expect(sendButton.disabled).toBe(false);
  await act(async () => {
    sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  return { container, root, act, textarea };
}

describe('ThreadComposer onSendError (phantom-bubble fix)', () => {
  it('fires onSendError with (text, subject) on send failure — and keeps the text', async () => {
    composeMock.mockResolvedValue(okCompose('draft-x'));
    sendMock.mockResolvedValue({ success: false, data: undefined, error: { message: 'SMTP down' } });

    const onSendStart = vi.fn();
    const onSendError = vi.fn();
    const onSent = vi.fn();
    const { container, root, act, textarea } = await mountComposerAndSend('doomed message', {
      onSendStart,
      onSendError,
      onSent,
    });

    // The optimistic bubble went up first…
    expect(onSendStart).toHaveBeenCalledTimes(1);
    expect(onSent).not.toHaveBeenCalled();
    // …then the failure withdrew it. The host needs (text, subject) to know
    // which bubble to remove.
    expect(onSendError).toHaveBeenCalledTimes(1);
    expect(onSendError).toHaveBeenCalledWith('doomed message', 'Re: Hi there');
    // The failure contract is unchanged: error toast shown, text preserved.
    expect(toastMock).toHaveBeenCalledWith({ text: 'SMTP down', type: 'error' });
    expect(textarea.value).toBe('doomed message');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('fires onSendError on compose failure too (not just send failure)', async () => {
    composeMock.mockResolvedValue({ success: false, data: undefined, error: { message: 'Quota exceeded' } });

    const onSendStart = vi.fn();
    const onSendError = vi.fn();
    const { container, root, act, textarea } = await mountComposerAndSend('never composed', {
      onSendStart,
      onSendError,
    });

    expect(onSendStart).toHaveBeenCalledTimes(1);
    expect(onSendError).toHaveBeenCalledTimes(1);
    expect(onSendError).toHaveBeenCalledWith('never composed', 'Re: Hi there');
    expect(textarea.value).toBe('never composed');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('never fires onSendError on a successful send', async () => {
    composeMock.mockResolvedValue(okCompose());
    sendMock.mockResolvedValue(okSend());

    const onSendStart = vi.fn();
    const onSendError = vi.fn();
    const onSent = vi.fn();
    const { container, root, act, textarea } = await mountComposerAndSend('happy path', {
      onSendStart,
      onSendError,
      onSent,
    });

    expect(onSendStart).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSendError).not.toHaveBeenCalled();
    // Success clears the box (unchanged).
    expect(textarea.value).toBe('');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe('/people home', () => {
  it('renders world tabs with counts and the filtered person list', () => {
    groupState.convos = [
      makeConversation(),
      makeConversation({ personKey: 'team', name: 'Team Alpha', world: 'groups' }),
      makeConversation({ personKey: 'news', name: 'Newsletter', world: 'updates' }),
    ];

    const html = renderToStaticMarkup(<PeopleHome />);

    expect(html).toContain('data-testid="world-tabs"');
    expect(html).toContain('data-world="log"');
    expect(html).toContain('log:1');
    expect(html).toContain('groups:1');
    expect(html).toContain('updates:1');
    // Default world is log — only the log conversation is listed, and the
    // list receives the search + loading wiring from the real PeopleListProps.
    expect(html).toContain('data-testid="people-list"');
    expect(html).toContain('data-search=""');
    expect(html).toContain('data-loading="false"');
    expect(html).toContain('Ada');
    expect(html).not.toContain('Team Alpha');
  });

  it('passes the loading state through to the list while fetching', () => {
    inboxState.isLoading = true;
    groupState.convos = [makeConversation()];

    const html = renderToStaticMarkup(<PeopleHome />);

    expect(html).toContain('data-loading="true"');
    expect(html).not.toContain('No conversations yet');
  });

  it('shows an honest error state with a retry', () => {
    inboxState.isError = true;
    const html = renderToStaticMarkup(<PeopleHome />);
    expect(html).toContain('load your conversations');
    expect(html).toContain('Retry');
  });

  it('shows an honest empty state instead of demo rows', () => {
    groupState.convos = [];
    const html = renderToStaticMarkup(<PeopleHome />);
    expect(html).toContain('No conversations yet');
    expect(html).not.toContain('data-testid="people-list"');
  });
});

describe('/people/[personId] thread page', () => {
  it('renders the thread with the composer for a known person', () => {
    groupState.convos = [makeConversation()];
    navState.params = { personId: encodeURIComponent('ada') };

    const html = renderToStaticMarkup(<PersonPage />);

    expect(html).toContain('data-testid="person-thread"');
    expect(html).toContain('data-testid="thread-name"');
    // Composer is present for the log world.
    expect(html).toContain('Message Ada…');
    expect(html).not.toContain('Conversation not found');
  });

  it('hides the composer for the updates world (no reply expectation)', () => {
    groupState.convos = [makeConversation({ world: 'updates' })];
    navState.params = { personId: encodeURIComponent('ada') };

    const html = renderToStaticMarkup(<PersonPage />);

    expect(html).toContain('data-testid="person-thread"');
    expect(html).not.toContain('Message Ada…');
  });

  it('shows an honest not-found state for an unknown personId', () => {
    groupState.convos = [makeConversation()];
    navState.params = { personId: encodeURIComponent('ghost') };

    const html = renderToStaticMarkup(<PersonPage />);

    expect(html).toContain('Conversation not found');
    expect(html).not.toContain('data-testid="person-thread"');
    expect(html).toContain('Back to people');
  });

  it('P1-B: shows an honest retry UI on fetch error, not "not found"', () => {
    inboxState.isError = true;
    groupState.convos = [makeConversation()];
    navState.params = { personId: encodeURIComponent('ada') };

    const html = renderToStaticMarkup(<PersonPage />);

    expect(html).toContain("load this conversation");
    expect(html).toContain('Retry');
    expect(html).not.toContain('Conversation not found');
    expect(html).not.toContain('data-testid="person-thread"');
  });

  it('P1 phantom-bubble: a failed send leaves no optimistic bubble in the rendered thread', async () => {
    groupState.convos = [makeConversation()];
    navState.params = { personId: encodeURIComponent('ada') };
    composeMock.mockResolvedValue(okCompose('draft-f'));
    sendMock.mockResolvedValue({ success: false, data: undefined, error: { message: 'SMTP down' } });

    const { act } = await import('react');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PersonPage />);
    });

    const textarea = container.querySelector(
      'textarea#people-reply-input',
    ) as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(textarea),
        'value',
      )?.set;
      setter?.call(textarea, 'will fail');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const sendButton = container.querySelector(
      'button[aria-label="Send message"]',
    ) as HTMLButtonElement;
    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // The error toasted (send genuinely failed) …
    expect(toastMock).toHaveBeenCalledWith({ text: 'SMTP down', type: 'error' });
    // …but the thread the page rendered carries no phantom sent message: the
    // optimistic bubble was withdrawn on failure instead of sticking around.
    const rendered = capturedThreadConversation.current;
    expect(rendered).not.toBeNull();
    const phantoms = (rendered.messages as Array<{ pendingSend?: boolean }>).filter(
      (message) => message.pendingSend === true,
    );
    expect(phantoms).toHaveLength(0);
    // The failed text is still in the box for a retry.
    expect(textarea.value).toBe('will fail');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

describe('ThreadComposer smart-reply prefill (qm-personthread-smart-replies)', () => {
  it('renders the tapped suggestion text in the box', () => {
    const html = renderToStaticMarkup(
      <ThreadComposer
        conversation={makeConversation() as any}
        currentUserEmail="me@quantmail.in"
        suggestedReply={{ text: 'Sounds good, thanks!', nonce: 1 }}
      />,
    );
    expect(html).toContain('id="people-reply-input"');
    expect(html).toContain('Sounds good, thanks!');
  });

  it('renders an empty box with no suggestion (prop optional, backwards compatible)', () => {
    const html = renderToStaticMarkup(
      <ThreadComposer conversation={makeConversation() as any} currentUserEmail="me@quantmail.in" />,
    );
    expect(html).toContain('id="people-reply-input"');
    expect(html).not.toContain('Sounds good, thanks!');
  });
});

describe('/people/[personId] smart-reply wiring (qm-personthread-smart-replies)', () => {
  // QM fix qm-threadcomposer-draft-persist: the composer now persists an
  // unsent reply per person in window.localStorage and restores it on mount.
  // Earlier tests in this file type real text into the box, so start each
  // test with a clean slate — otherwise a saved draft for the same person
  // would (correctly) prefill the box and these assertions would see it.
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders smart-reply chips for the thread\'s latest message above the composer', () => {
    groupState.convos = [makeConversation()];
    navState.params = { personId: encodeURIComponent('ada') };

    const html = renderToStaticMarkup(<PersonPage />);

    // Chips are requested for the latest message — the same real backend
    // (GET /emails/:id/reply-suggestions) the sibling ConversationalThreadView
    // already uses. No canned fallbacks anywhere in this path.
    expect(html).toContain('data-testid="smart-replies"');
    expect(html).toContain('data-email-id="msg-9"');
    // …and the composer they prefill sits in the same reply area below.
    expect(html).toContain('id="people-reply-input"');
  });

  it('renders no smart replies in the updates world (no reply expectation)', () => {
    groupState.convos = [makeConversation({ world: 'updates' })];
    navState.params = { personId: encodeURIComponent('ada') };

    const html = renderToStaticMarkup(<PersonPage />);

    expect(html).not.toContain('data-testid="smart-replies"');
    expect(html).not.toContain('id="people-reply-input"');
  });

  it('tapping a chip prefills the thread composer box (and re-tapping refills it)', async () => {
    groupState.convos = [makeConversation()];
    navState.params = { personId: encodeURIComponent('ada') };

    // jsdom implements no scrollIntoView; the composer's onFocus handler
    // calls it when the chip-prefill focuses the box. Stub it so the test
    // exercises the real focus path without the jsdom gap (real browsers
    // always have scrollIntoView — production code stays untouched).
    (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??=
      () => {};

    const { act } = await import('react');
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { createRoot } = await import('react-dom/client');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PersonPage />);
    });

    const chip = container.querySelector('[data-testid="smart-reply-chip"]') as HTMLButtonElement;
    expect(chip).not.toBeNull();
    const box = container.querySelector('#people-reply-input') as HTMLTextAreaElement;
    expect(box).not.toBeNull();
    expect(box.value).toBe('');

    await act(async () => {
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    // The chip's text lands in the box, ready to edit or send.
    expect(box.value).toBe('Sounds good, thanks!');

    // A second tap on the same chip refills the box (fresh nonce per tap —
    // the fill is keyed on the suggestion object's identity, not its text).
    await act(async () => {
      chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(box.value).toBe('Sounds good, thanks!');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
