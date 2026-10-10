'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../services/api-client';
import { showToast } from '../components/InboxToast';
import type { PersonConversation } from '../lib/peopleGrouping';

export interface ThreadComposerProps {
  conversation: PersonConversation;
  currentUserEmail: string;
  onSent?: () => void;
}

/**
 * The subject a reply in this thread carries.
 *
 * Pure function so the no-double-"Re:" rule is unit-testable: an existing
 * "Re:" (any casing, optional trailing space) is left alone, a bare subject
 * gets one prefix, and a subject-less thread falls back to a lone "Re:" so
 * the send path never ships an empty subject.
 */
export function defaultReplySubject(lastSubject: string): string {
  const trimmed = (lastSubject ?? '').trim();
  if (!trimmed) return 'Re:';
  return /^re:\s*/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

/**
 * The backend calls the send path runs against.
 *
 * Injected so the send orchestration is unit-testable without a DOM or a
 * live server. It is exactly the two calls PR #771's fixed path makes —
 * compose then send — plus the toast callback. There is deliberately no
 * discard handler, no router, and no navigation anywhere in this contract:
 * a failed send must never discard the draft or leave the thread.
 */
export interface ThreadSendDeps {
  composeEmail: (data: {
    to: Array<{ email: string }>;
    subject: string;
    bodyText: string;
    messageKind: 'chat';
    inReplyTo: string;
  }) => Promise<{ success: boolean; data?: { id?: string }; error?: { message?: string } }>;
  sendEmail: (draftId: string) => Promise<{ success: boolean; error?: { message?: string } }>;
  toast: (text: string, type: 'success' | 'error') => void;
}

export interface ThreadSendOutcome {
  ok: boolean;
  errorMessage?: string;
}

/**
 * The fixed #771 send path for a thread reply: compose a chat-kind draft
 * addressed to the person, in-reply-to the thread's last message, then send
 * it. Success toasts "Message sent"; failure toasts the server's own message
 * and reports `ok: false` so the caller keeps the typed text.
 */
export async function executeThreadSend(
  deps: ThreadSendDeps,
  conversation: PersonConversation,
  subject: string,
  bodyText: string,
): Promise<ThreadSendOutcome> {
  try {
    const composeRes = await deps.composeEmail({
      to: [{ email: conversation.email }],
      subject,
      bodyText,
      messageKind: 'chat',
      inReplyTo: conversation.lastMessage.id,
    });
    if (!composeRes.success || !composeRes.data?.id) {
      throw new Error(composeRes.error?.message || 'Failed to compose email');
    }
    const sendRes = await deps.sendEmail(composeRes.data.id);
    if (!sendRes.success) {
      throw new Error(sendRes.error?.message || 'Failed to deliver email');
    }
    deps.toast('Message sent', 'success');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send message';
    deps.toast(message, 'error');
    return { ok: false, errorMessage: message };
  }
}

/**
 * The message box pinned at the bottom of a person thread.
 *
 * Chat-style: textarea with auto-grow, Enter sends, Shift+Enter inserts a
 * newline. The subject is automatic (`Re: <last subject>`, never doubled);
 * "New topic" reveals a small inline field to start a fresh subject instead.
 *
 * Send-failure contract (from the #771 fix): the error toasts, the typed
 * text is preserved, nothing navigates, and no discard handler is ever
 * called — there is no `onDiscard` prop on this component by design.
 */
export function ThreadComposer({ conversation, onSent }: ThreadComposerProps) {
  const [body, setBody] = useState('');
  const [newTopic, setNewTopic] = useState(false);
  const [customSubject, setCustomSubject] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A different person is a different draft: reset the box and subject state.
  useEffect(() => {
    setBody('');
    setNewTopic(false);
    setCustomSubject('');
  }, [conversation.personKey]);

  // Auto-grow: the box follows its content instead of scrolling internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const subject =
    newTopic && customSubject.trim()
      ? customSubject.trim()
      : defaultReplySubject(conversation.lastMessage.subject);

  const canSend = body.trim().length > 0 && !isSending;

  const handleSend = async () => {
    const text = body.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      const outcome = await executeThreadSend(
        {
          composeEmail: (data) => apiClient.composeEmail(data),
          sendEmail: (draftId) => apiClient.sendEmail(draftId),
          toast: (text, type) => showToast({ text, type }),
        },
        conversation,
        subject,
        text,
      );
      if (outcome.ok) {
        setBody('');
        setCustomSubject('');
        setNewTopic(false);
        onSent?.();
      }
      // Failure path: the text stays in the box. No navigation, no discard —
      // `executeThreadSend` has no access to either.
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="bg-black px-3 pb-3 pt-2 sm:px-4">
      {newTopic && (
        <input
          type="text"
          value={customSubject}
          onChange={(event) => setCustomSubject(event.target.value)}
          placeholder="New topic subject…"
          aria-label="New topic subject"
          maxLength={200}
          className="mb-2 w-full rounded-xl bg-[#111318] px-3.5 py-2.5 text-sm text-white placeholder-[#6B6E76] focus:outline-none focus:ring-2 focus:ring-[#F97316]"
        />
      )}
      <div className="flex items-end gap-2 rounded-2xl bg-[#111318] px-2 py-2">
        <button
          type="button"
          onClick={() => setNewTopic((prev) => !prev)}
          aria-pressed={newTopic}
          title={newTopic ? 'Reply with the thread subject' : 'Start a new topic subject'}
          className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] ${
            newTopic ? 'bg-[#F97316] text-black' : 'text-[#9BA0AA] hover:text-white'
          }`}
        >
          {newTopic ? 'Re:' : 'New topic'}
        </button>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={`Message ${conversation.name}…`}
          aria-label={`Message ${conversation.name}`}
          disabled={isSending}
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-sm text-white placeholder-[#6B6E76] focus:outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          aria-label={isSending ? 'Sending message' : 'Send message'}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#F97316] px-4 text-sm font-bold text-black transition-all hover:bg-[#FB8A3D] disabled:opacity-40 disabled:hover:bg-[#F97316] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {isSending ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-3.5 rounded-full border-2 border-black/30 border-t-black animate-spin"
                aria-hidden="true"
              />
              Sending
            </span>
          ) : (
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-[#6B6E76]">
        {newTopic ? 'Starting a new topic' : `Replying: ${subject}`} · Enter to send, Shift+Enter for a new line
      </p>
    </div>
  );
}
