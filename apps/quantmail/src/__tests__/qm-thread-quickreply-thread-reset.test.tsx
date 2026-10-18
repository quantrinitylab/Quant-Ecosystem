// @vitest-environment jsdom
// ============================================================================
// Thread quick-reply composer reset on thread change
// (fix/qm-thread-quickreply-reset).
//
// The thread view instance is reused across /thread/A → /thread/B
// navigations (the thread page renders ConversationalThreadView without
// key=). Before the fix, quickReplyText and the quotedMessage chip were
// plain useState with no threadId-keyed reset — only reactions, typing
// peers and the group/profile panels reset — so a half-typed reply (or a
// quote) from thread A rode into thread B's composer, a misdirected-message
// risk. Browser-chrome back/forward between threads bypasses the leave
// guard entirely, so the guard's confirmed-discard path could not cover it.
//
// The fix extracts the composer draft into useThreadComposerDraft, which
// resets the bar text, the quote chip, the send error and the schedule
// modal on every threadId change, and wires the leave guard through a
// setter that also clears the quote chip on a confirmed discard.
//
// These tests drive the REAL hook (the same composition the view uses),
// asserting only observable state: text, quote, error and modal after a
// threadId change, and the discard-setter contract the guard relies on.
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useThreadComposerDraft } from '../hooks/useThreadComposerDraft';
import type { Email } from '../types';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mounted: Root[] = [];

type DraftApi = ReturnType<typeof useThreadComposerDraft>;

function renderDraft(threadId: string): { api: () => DraftApi; rerender: (id: string) => void } {
  let current!: DraftApi;
  function Harness({ id }: { id: string }) {
    current = useThreadComposerDraft(id);
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<Harness id={threadId} />);
  });
  mounted.push(root);
  return {
    api: () => current,
    rerender: (id: string) => {
      act(() => {
        root.render(<Harness id={id} />);
      });
    },
  };
}

afterEach(() => {
  while (mounted.length > 0) {
    const root = mounted.pop()!;
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = '';
});

// Minimal Email fixture: only the fields the quote chip reads.
function quotedEmail(): Email {
  return {
    id: 'msg-quoted-1',
    threadId: 'thread-A',
    userId: 'user-1',
    from: { name: 'Asha', email: 'asha@example.com' },
    to: [],
    cc: [],
    bcc: [],
    subject: 'Re: plans',
    bodyText: 'sounds good, see you at six',
    bodyHtml: '<p>sounds good, see you at six</p>',
    snippet: 'sounds good, see you at six',
    priority: 'normal',
    category: 'primary',
    status: 'delivered',
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    labels: [],
    attachments: [],
    references: [],
    headers: {},
    receivedAt: new Date('2026-10-19T01:00:00Z'),
    createdAt: new Date('2026-10-19T01:00:00Z'),
    updatedAt: new Date('2026-10-19T01:00:00Z'),
  } as Email;
}

describe('useThreadComposerDraft', () => {
  it('resets the reply bar text and the quote chip when threadId changes', () => {
    const { api, rerender } = renderDraft('thread-A');
    act(() => {
      api().setQuickReplyText('half-typed reply for Asha');
      api().setQuotedMessage(quotedEmail());
    });
    expect(api().quickReplyText).toBe('half-typed reply for Asha');
    expect(api().quotedMessage?.id).toBe('msg-quoted-1');

    // /thread/A → /thread/B: the same view instance, a new threadId.
    rerender('thread-B');

    expect(api().quickReplyText).toBe('');
    expect(api().quotedMessage).toBeNull();
  });

  it('also resets the send error and the schedule modal on thread change', () => {
    const { api, rerender } = renderDraft('thread-A');
    act(() => {
      api().setReplyError('Failed to send reply');
      api().setShowScheduleModal(true);
    });
    expect(api().replyError).toBe('Failed to send reply');
    expect(api().showScheduleModal).toBe(true);

    rerender('thread-B');

    expect(api().replyError).toBeNull();
    expect(api().showScheduleModal).toBe(false);
  });

  it('keeps the draft when the threadId does not change', () => {
    const { api, rerender } = renderDraft('thread-A');
    act(() => {
      api().setQuickReplyText('still writing…');
      api().setQuotedMessage(quotedEmail());
    });

    // Re-render for the same thread (e.g. a poll refresh): no reset.
    rerender('thread-A');

    expect(api().quickReplyText).toBe('still writing…');
    expect(api().quotedMessage?.id).toBe('msg-quoted-1');
  });

  it("the guard's discard setter clears the quote chip too", () => {
    // useThreadLeaveGuard calls the setter with '' on a confirmed discard.
    const { api } = renderDraft('thread-A');
    act(() => {
      api().setQuickReplyText('unsent words');
      api().setQuotedMessage(quotedEmail());
      api().setDraftText('');
    });
    expect(api().quickReplyText).toBe('');
    expect(api().quotedMessage).toBeNull();
  });

  it('typing through the draft setter leaves an existing quote alone', () => {
    const { api } = renderDraft('thread-A');
    act(() => {
      api().setQuotedMessage(quotedEmail());
      api().setDraftText('answering the quoted message');
    });
    expect(api().quickReplyText).toBe('answering the quoted message');
    expect(api().quotedMessage?.id).toBe('msg-quoted-1');
  });
});
