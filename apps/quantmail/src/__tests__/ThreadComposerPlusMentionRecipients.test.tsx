// @vitest-environment jsdom
// ============================================================================
// CODEX-REVIEW on PR #1549 (checkpoint 6387470473): the ThreadComposer "+"
// picker inserted only "@Name" text — its send path had no recipient list,
// so a pick was a recipient action that added no recipient.
//
// The fix wires the pick into a real recipient list: picking a contact
// appends them to `mentionedRecipients`, the chips above the bar show the
// list, and the send path addresses every entry alongside the thread
// person (direct send AND the undo-queue path). The list persists in the
// per-person draft, so a person switch or reload can never silently drop
// a pick while the "@Name" text survives.
//
// Layers, following this repo's established test conventions:
//  1. Pure: add/merge/resolve/display helpers + executeThreadSend with
//     extras — the compose call itself must carry the picked contact.
//  2. Draft lib: the picked list round-trips through parse/save/switch.
//  3. Behavioural: the real composer mounted under jsdom — type "+Bo",
//     pick Bob from the dropdown, see the chip, hit Send, and assert the
//     compose call's To list contains Bob (not just the "@Bob" text).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

const toastMock = vi.hoisted(() => vi.fn());
const composeMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());

vi.mock('../services/api-client', () => ({
  apiClient: { composeEmail: composeMock, sendEmail: sendMock },
}));
vi.mock('../components/InboxToast', () => ({ showToast: toastMock }));
// The picker suggestions come from the frequent-contacts hook (a data
// boundary, mocked against its contract like useInbox elsewhere). The
// list deliberately includes the thread person herself: the picker must
// never OFFER her, because she is already the primary recipient.
vi.mock('../hooks/useContactSuggestions', () => ({
  useContactSuggestions: () => ({
    contacts: [
      { email: 'bob@x.com', name: 'Bob', frequency: 9 },
      { email: 'carol@x.com', name: 'Carol', frequency: 5 },
      { email: 'ada@x.com', name: 'Ada', frequency: 99 },
    ],
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

import {
  ThreadComposer,
  addMentionedRecipient,
  executeThreadSend,
  mergeMentionedRecipients,
  threadSendDisplayRecipients,
  threadSendRecipients,
} from '../components/ThreadComposer';
import {
  UndoSendManager,
  UndoSendProvider,
  UNDO_SEND_COUNTDOWN_SEC,
} from '../components/UndoSendCountdownBar';
import {
  isThreadDraftEmpty,
  loadThreadDraft,
  normalizeMentionedRecipients,
  parseThreadDraft,
  saveThreadDraft,
  switchThreadDraft,
  threadDraftAccountKey,
  type ThreadDraftStorage,
} from '../lib/threadReplyDrafts';

function makeConversation() {
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
  };
}

function okCompose(id = 'draft-1') {
  return { success: true, data: { id }, error: undefined };
}
function okSend() {
  return { success: true, data: undefined, error: undefined };
}

function mapStore(): ThreadDraftStorage & { backing: Map<string, string> } {
  const backing = new Map<string, string>();
  return {
    backing,
    getItem: (k) => backing.get(k) ?? null,
    setItem: (k, v) => {
      backing.set(k, v);
    },
    removeItem: (k) => {
      backing.delete(k);
    },
    keys: (prefix) => [...backing.keys()].filter((k) => !prefix || k.startsWith(prefix)),
  };
}

describe('addMentionedRecipient (pick -> recipient list)', () => {
  it('appends a picked contact with its name', () => {
    expect(addMentionedRecipient([], { email: 'bob@x.com', name: 'Bob' }, 'ada@x.com')).toEqual([
      { email: 'bob@x.com', name: 'Bob' },
    ]);
  });

  it('never adds the thread person herself (she is already the primary recipient)', () => {
    expect(addMentionedRecipient([], { email: 'ADA@x.com', name: 'Ada' }, 'ada@x.com')).toEqual([]);
  });

  it('never adds the same address twice, case-insensitively, keeping the first name', () => {
    const once = addMentionedRecipient([], { email: 'bob@x.com', name: 'Bob' }, 'ada@x.com');
    expect(addMentionedRecipient(once, { email: 'BOB@x.com', name: 'Robert' }, 'ada@x.com')).toEqual([
      { email: 'bob@x.com', name: 'Bob' },
    ]);
  });

  it('adds nothing for a blank email', () => {
    expect(addMentionedRecipient([], { email: '   ' }, 'ada@x.com')).toEqual([]);
  });
});

describe('mergeMentionedRecipients (failure/undo restore)', () => {
  it('unions both lists, first occurrence wins, no duplicates', () => {
    expect(
      mergeMentionedRecipients(
        [{ email: 'bob@x.com', name: 'Bob' }],
        [{ email: 'BOB@x.com', name: 'Robert' }, { email: 'carol@x.com' }],
      ),
    ).toEqual([{ email: 'bob@x.com', name: 'Bob' }, { email: 'carol@x.com' }]);
  });
});

describe('threadSendRecipients / threadSendDisplayRecipients', () => {
  const conversation = makeConversation() as any;

  it('is the thread person first, then picked contacts in pick order', () => {
    expect(
      threadSendRecipients(conversation, [
        { email: 'bob@x.com', name: 'Bob' },
        { email: 'carol@x.com' },
      ]),
    ).toEqual([{ email: 'ada@x.com' }, { email: 'bob@x.com' }, { email: 'carol@x.com' }]);
  });

  it('defensively drops blanks, thread-person duplicates and repeated picks', () => {
    expect(
      threadSendRecipients(conversation, [
        { email: 'ada@x.com' },
        { email: 'bob@x.com' },
        { email: 'BOB@x.com' },
        { email: '  ' },
      ]),
    ).toEqual([{ email: 'ada@x.com' }, { email: 'bob@x.com' }]);
  });

  it('is the thread person alone when nothing was picked', () => {
    expect(threadSendRecipients(conversation, [])).toEqual([{ email: 'ada@x.com' }]);
  });

  it('names everyone the send will reach (name, else email)', () => {
    expect(threadSendDisplayRecipients(conversation, [])).toBe('Ada');
    expect(
      threadSendDisplayRecipients(conversation, [
        { email: 'bob@x.com', name: 'Bob' },
        { email: 'carol@x.com' },
      ]),
    ).toBe('Ada, Bob, carol@x.com');
  });
});

describe('executeThreadSend with picked recipients', () => {
  const conversation = makeConversation() as any;

  it('addresses picked contacts on the compose call itself', async () => {
    composeMock.mockResolvedValue(okCompose('draft-9'));
    sendMock.mockResolvedValue(okSend());

    const outcome = await executeThreadSend(
      {
        composeEmail: composeMock,
        sendEmail: sendMock,
        toast: (text, type) => toastMock({ text, type }),
      },
      conversation,
      'Re: Hi there',
      'Hi @Bob, looping you in',
      undefined,
      [{ email: 'bob@x.com', name: 'Bob' }],
    );

    expect(outcome.ok).toBe(true);
    expect(composeMock).toHaveBeenCalledWith({
      to: [{ email: 'ada@x.com' }, { email: 'bob@x.com' }],
      subject: 'Re: Hi there',
      bodyText: 'Hi @Bob, looping you in',
      messageKind: 'chat',
      inReplyTo: 'msg-9',
    });
    expect(sendMock).toHaveBeenCalledWith('draft-9');
  });
});

describe('draft persistence for picked recipients', () => {
  const NOW = 1_700_000_000_000;
  const ACCOUNT = threadDraftAccountKey('01JABCDEF0000000000000001');

  it('parses a stored list back, and drops garbage entries without failing', () => {
    expect(
      parseThreadDraft(
        JSON.stringify({
          body: 'hi @Bob',
          newTopic: false,
          customSubject: '',
          updatedAt: NOW,
          mentionedRecipients: [
            { email: 'bob@x.com', name: 'Bob' },
            { email: '  ' },
            { name: 'Nameless' },
            'not-an-object',
            { email: 'BOB@x.com', name: 'Duplicate' },
            { email: 'carol@x.com' },
          ],
        }),
      ),
    ).toEqual({
      body: 'hi @Bob',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
      mentionedRecipients: [{ email: 'bob@x.com', name: 'Bob' }, { email: 'carol@x.com' }],
    });
    expect(normalizeMentionedRecipients('not-an-array')).toEqual([]);
  });

  it('keeps the old shape for drafts written before the field existed', () => {
    expect(
      parseThreadDraft(
        JSON.stringify({ body: 'old', newTopic: false, customSubject: '', updatedAt: NOW }),
      ),
    ).toEqual({ body: 'old', newTopic: false, customSubject: '', updatedAt: NOW });
  });

  it('a recipients-only draft is NOT empty (chips still standing)', () => {
    expect(
      isThreadDraftEmpty({
        body: '',
        customSubject: '',
        mentionedRecipients: [{ email: 'bob@x.com' }],
      }),
    ).toBe(false);
    expect(isThreadDraftEmpty({ body: '', customSubject: '', mentionedRecipients: [] })).toBe(true);
  });

  it('switchThreadDraft flushes the outgoing picks and restores the incoming ones', () => {
    const store = mapStore();
    saveThreadDraft(store, 'carol', ACCOUNT, {
      body: 'hey @Bob',
      newTopic: false,
      customSubject: '',
      updatedAt: NOW,
      mentionedRecipients: [{ email: 'bob@x.com', name: 'Bob' }],
    });

    const toCarol = switchThreadDraft({
      store,
      prevPersonKey: 'ada',
      nextPersonKey: 'carol',
      accountKey: ACCOUNT,
      latest: {
        body: 'for ada',
        newTopic: false,
        customSubject: '',
        mentionedRecipients: [{ email: 'dave@x.com' }],
      },
      now: NOW,
    });
    expect(toCarol.mentionedRecipients).toEqual([{ email: 'bob@x.com', name: 'Bob' }]);
    // The outgoing person's picks were flushed under HER key, not Carol's.
    expect(loadThreadDraft(store, 'ada', ACCOUNT, NOW)?.mentionedRecipients).toEqual([
      { email: 'dave@x.com' },
    ]);
    expect(loadThreadDraft(store, 'carol', ACCOUNT, NOW)?.mentionedRecipients).toEqual([
      { email: 'bob@x.com', name: 'Bob' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Behavioural: real composer under jsdom.
// ---------------------------------------------------------------------------

interface Mounted {
  container: HTMLElement;
  unmount: () => Promise<void>;
  textarea: HTMLTextAreaElement;
  manager: UndoSendManager | null;
}

async function mountComposer(withProvider: boolean): Promise<Mounted> {
  const { act } = await import('react');
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');

  const manager = withProvider ? new UndoSendManager() : null;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const composer = <ThreadComposer conversation={makeConversation() as any} currentUserId="u-1" />;
  await act(async () => {
    root.render(
      withProvider && manager ? <UndoSendProvider manager={manager}>{composer}</UndoSendProvider> : composer,
    );
  });
  const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
  expect(textarea).not.toBeNull();
  return {
    container,
    manager,
    textarea,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      manager?.destroy();
      container.remove();
    },
  };
}

async function typeText(textarea: HTMLTextAreaElement, text: string) {
  const { act } = await import('react');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;
    setter?.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function pickOption(container: HTMLElement, email: string): HTMLElement {
  const options = [...container.querySelectorAll('[role="option"]')];
  const option = options.find((o) => (o.textContent ?? '').includes(email));
  expect(option).toBeDefined();
  return option as HTMLElement;
}

async function clickOption(option: HTMLElement) {
  const { act } = await import('react');
  await act(async () => {
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
}

async function clickButton(button: HTMLButtonElement) {
  const { act } = await import('react');
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function flush() {
  const { act } = await import('react');
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // The composer persists drafts to localStorage under (account, person):
  // without a clear, one test's unsent draft restores into the next test's
  // mount. (The older undo-send suite dodges this by passing no
  // currentUserId, which disables persistence entirely.)
  try {
    window.localStorage.clear();
  } catch {
    // Storage unavailable: the composer degrades to no persistence.
  }
  // The pick handler restores focus + caret via requestAnimationFrame;
  // run it synchronously so the pick settles inside act.
  (globalThis as any).requestAnimationFrame = (cb: (t: number) => void) => {
    cb(0);
    return 0;
  };
  if (!Element.prototype.scrollIntoView) {
    (Element.prototype as any).scrollIntoView = vi.fn();
  }
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ThreadComposer "+" pick -> real recipient (direct send)', () => {
  it('picking Bob shows a chip AND addresses Bob on the compose call', async () => {
    composeMock.mockResolvedValue(okCompose('draft-1'));
    sendMock.mockResolvedValue(okSend());
    const m = await mountComposer(false);

    await typeText(m.textarea, 'Hi +Bo');
    expect(m.container.querySelector('[role="listbox"]')).not.toBeNull();
    await clickOption(pickOption(m.container, 'bob@x.com'));

    // The "@Bob" text landed AND the recipient chip stands above the bar.
    expect(m.textarea.value).toBe('Hi @Bob ');
    expect(m.container.querySelector('[aria-label="Additional recipients"]')?.textContent).toContain('Bob');

    const sendButton = m.container.querySelector(
      'button[aria-label="Send message"]',
    ) as HTMLButtonElement;
    await clickButton(sendButton);
    await flush();

    // The picked contact is in the SENT recipients — not just in the text.
    // (handleSend trims the body, so the sent text is "Hi @Bob" while the
    // box held "Hi @Bob " — the recipient assertion is the point here.)
    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock).toHaveBeenCalledWith({
      to: [{ email: 'ada@x.com' }, { email: 'bob@x.com' }],
      subject: 'Re: Hi there',
      bodyText: 'Hi @Bob',
      messageKind: 'chat',
      inReplyTo: 'msg-9',
    });
    expect(sendMock).toHaveBeenCalledWith('draft-1');

    await m.unmount();
  });

  it('never offers the thread person herself as a pick', async () => {
    const m = await mountComposer(false);

    await typeText(m.textarea, 'Hi +Ad');
    // Ada matches "Ad" but is excluded: no picker, no option, no chip path.
    expect(m.container.querySelector('[role="listbox"]')).toBeNull();

    await m.unmount();
  });

  it('never offers an already-picked contact a second time', async () => {
    const m = await mountComposer(false);

    await typeText(m.textarea, 'Hi +Bo');
    await clickOption(pickOption(m.container, 'bob@x.com'));
    expect(m.textarea.value).toBe('Hi @Bob ');

    await typeText(m.textarea, 'Hi @Bob +Bo');
    expect(m.container.querySelector('[role="listbox"]')).toBeNull();

    await m.unmount();
  });

  it('removing the chip removes the recipient from the send', async () => {
    composeMock.mockResolvedValue(okCompose());
    sendMock.mockResolvedValue(okSend());
    const m = await mountComposer(false);

    await typeText(m.textarea, 'Hi +Bo');
    await clickOption(pickOption(m.container, 'bob@x.com'));
    const remove = m.container.querySelector(
      'button[aria-label="Remove Bob from recipients"]',
    ) as HTMLButtonElement;
    expect(remove).not.toBeNull();
    await clickButton(remove);
    expect(m.container.querySelector('[aria-label="Additional recipients"]')).toBeNull();

    const sendButton = m.container.querySelector(
      'button[aria-label="Send message"]',
    ) as HTMLButtonElement;
    await clickButton(sendButton);
    await flush();

    expect(composeMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: [{ email: 'ada@x.com' }] }),
    );

    await m.unmount();
  });

  it('a remount restores the picked recipient chip with the draft text', async () => {
    const first = await mountComposer(false);
    await typeText(first.textarea, 'Hi +Bo');
    await clickOption(pickOption(first.container, 'bob@x.com'));
    expect(first.textarea.value).toBe('Hi @Bob ');
    await first.unmount();

    // A fresh mount for the same person + account restores both: the
    // "@Bob" text AND the chip that makes Bob a real recipient.
    const second = await mountComposer(false);
    expect(second.textarea.value).toBe('Hi @Bob ');
    expect(second.container.querySelector('[aria-label="Additional recipients"]')?.textContent).toContain('Bob');
    await second.unmount();
  });

  it('a failed send hands the picked recipient back with the words', async () => {
    composeMock.mockResolvedValue({ success: false, data: undefined, error: { message: 'Quota exceeded' } });
    const m = await mountComposer(false);

    await typeText(m.textarea, 'Hi +Bo');
    await clickOption(pickOption(m.container, 'bob@x.com'));
    const sendButton = m.container.querySelector(
      'button[aria-label="Send message"]',
    ) as HTMLButtonElement;
    await clickButton(sendButton);
    await flush();

    expect(sendMock).not.toHaveBeenCalled();
    // restoreDraft hands back the send's (trimmed) text — the pre-existing
    // failure contract — plus the picked recipient chip.
    expect(m.textarea.value).toBe('Hi @Bob');
    expect(m.container.querySelector('[aria-label="Additional recipients"]')?.textContent).toContain('Bob');

    await m.unmount();
  });
});

describe('ThreadComposer "+" pick -> real recipient (undo-queue path)', () => {
  it('when the recall window expires, the queued send still addresses the picked contact', async () => {
    vi.useFakeTimers();
    composeMock.mockResolvedValue(okCompose('draft-7'));
    sendMock.mockResolvedValue(okSend());
    const m = await mountComposer(true);

    await typeText(m.textarea, 'Hi +Bo');
    await clickOption(pickOption(m.container, 'bob@x.com'));
    const sendButton = m.container.querySelector(
      'button[aria-label="Send message"]',
    ) as HTMLButtonElement;
    await clickButton(sendButton);
    expect(composeMock).not.toHaveBeenCalled();

    // The undo bar names everyone the send will reach, not just Ada.
    const bar = m.container.querySelector('[data-testid="undo-send-bar"]');
    expect(bar?.textContent).toContain('Ada, Bob');

    const { act } = await import('react');
    await act(async () => {
      vi.advanceTimersByTime(UNDO_SEND_COUNTDOWN_SEC * 1000);
    });

    expect(composeMock).toHaveBeenCalledTimes(1);
    expect(composeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: [{ email: 'ada@x.com' }, { email: 'bob@x.com' }],
      }),
    );

    await m.unmount();
  });
});
