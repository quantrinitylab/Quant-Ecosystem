'use client';

/**
 * PersonThread — the unified "email with chat" conversation view for the
 * People view (PART 2 of the feat/people-view-unified wave).
 *
 * Renders ALL messages of one PersonConversation chronologically, both
 * directions, chat-style: sent messages right-aligned with a subtle
 * Mail-orange tint, received messages left-aligned on neutral dark.
 *
 * The conversation contract (PersonConversation / ConversationWorld) lives in
 * `../lib/peopleGrouping.ts` (PART 1) and is re-exported here for consumers.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Email } from '../types';
import { isFromMe } from '../lib/threading';
import { formatBytes } from '../lib/format-bytes';
import { htmlToPlainText } from '../lib/htmlToPlainText';
import { IdentityAvatar } from './IdentityAvatar';
import type { ConversationWorld, PersonConversation } from '../lib/peopleGrouping';

// Re-exported so thread consumers can get the contract types from one place.
export type { ConversationWorld, PersonConversation };

export interface PersonThreadProps {
  conversation: PersonConversation;
  currentUserEmail: string;
  /** Reply surface rendered below the messages. Never rendered in the Updates world. */
  renderComposer?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const SNIPPET_LENGTH = 160;

/** Best plain-text rendering of a message body. Never injects HTML. */
function plainBodyText(message: Email): string {
  const text = (message.bodyText || '').trim();
  if (text) return text;
  // Untrusted HTML → plain text via the scanner-based sanitizer
  // (lib/htmlToPlainText): strips all tags without regex, decodes entities
  // exactly once, and is rendered as React text only — never injected.
  return htmlToPlainText(message.bodyHtml);
}

function formatMessageTime(receivedAt: Date): string {
  const date = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  const day = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${day}, ${time}`;
}

// ---------------------------------------------------------------------------
// One message row
// ---------------------------------------------------------------------------

function MessageRow({
  message,
  fromMe,
  showSenderName,
  showSubjectChange,
  senderLabel,
}: {
  message: Email;
  fromMe: boolean;
  showSenderName: boolean;
  /** The new subject when it differs from the previous message's, else null. */
  showSubjectChange: string | null;
  senderLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  // P1-F: the htmlToPlainText scanner runs once per message identity, not on
  // every parent re-render (polls, typing in the composer, pill toggles).
  const fullText = useMemo(
    () => plainBodyText(message),
    [message.id, message.bodyText, message.bodyHtml],
  );
  const isLong = fullText.length > SNIPPET_LENGTH;
  // P1-C: optimistic bubble still in flight — show "Sending…" instead of a
  // timestamp until the refetch confirms it.
  const isPendingSend = (message as { pendingSend?: boolean }).pendingSend === true;
  const visibleText = expanded || !isLong ? fullText : `${fullText.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
  const attachments = message.attachments ?? [];

  return (
    <div data-testid="thread-message" data-sent={fromMe ? 'true' : 'false'}>
      {showSubjectChange !== null && (
        <div
          data-testid="subject-change"
          className="my-3 flex items-center gap-3"
          aria-label={`Subject changed to ${showSubjectChange}`}
        >
          <span className="h-px flex-1 bg-zinc-800" aria-hidden="true" />
          {/* P2-1: truncate long subjects instead of wrapping ragged. */}
          <span
            dir="auto"
            className="min-w-0 max-w-[70%] truncate text-[11px] tracking-wide text-zinc-500"
          >
            Naya vishay: {showSubjectChange}
          </span>
          <span className="h-px flex-1 bg-zinc-800" aria-hidden="true" />
        </div>
      )}
      <div className={`flex w-full ${fromMe ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[70%] ${
            fromMe
              ? 'rounded-br-md bg-[rgba(249,115,22,0.14)] text-zinc-100'
              : 'rounded-bl-md bg-zinc-900 text-zinc-200'
          }`}
        >
          {showSenderName && (
            <div dir="auto" className="mb-1 text-[11px] font-medium text-zinc-400">
              {senderLabel}
            </div>
          )}
          {fullText ? (
            <div dir="auto" className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {visibleText}
            </div>
          ) : (
            <div className="text-sm italic text-zinc-500">No message text.</div>
          )}
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              // P1-4 (mobile): extend the tap target with padding instead of
              // a taller button — the -ml-2 keeps the label visually aligned.
              className="mt-1 inline-flex items-center px-2 py-2 -ml-2 text-xs font-medium text-orange-400/90 hover:text-orange-300"
              aria-expanded={expanded}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1.5" data-testid="thread-attachments">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  data-testid="thread-attachment"
                  className="flex items-center gap-2 rounded-lg bg-black/40 px-2.5 py-1.5"
                >
                  <span
                    className="min-w-0 flex-1 truncate text-xs text-zinc-300"
                    title={attachment.filename}
                  >
                    {attachment.filename}
                  </span>
                  <span className="flex-none text-[11px] text-zinc-500">
                    {formatBytes(attachment.size)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-1 text-right text-[11px] text-zinc-500">
            {isPendingSend ? (
              <span className="inline-flex items-center gap-1" aria-label="Sending">
                <span
                  className="size-3 rounded-full border border-zinc-500 border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                Sending…
              </span>
            ) : (
              formatMessageTime(message.receivedAt)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread header
// ---------------------------------------------------------------------------

function ThreadHeader({ conversation }: { conversation: PersonConversation }) {
  if (conversation.world === 'groups') {
    const participants = conversation.participantEmails ?? [];
    const shown = participants.slice(0, 4);
    const extra = participants.length - shown.length;
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex -space-x-2" aria-hidden="true">
          {shown.map((email) => (
            <IdentityAvatar key={email} name={email} size="sm" className="ring-2 ring-black" />
          ))}
        </div>
        <div className="min-w-0">
          <div dir="auto" className="truncate text-sm font-semibold text-zinc-100">
            {conversation.name}
          </div>
          <div className="text-xs text-zinc-500" data-testid="thread-participant-count">
            {participants.length} {participants.length === 1 ? 'person' : 'people'}
            {extra > 0 ? ` · +${extra} more` : ''}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <IdentityAvatar name={conversation.name || conversation.email} size="md" />
      <div className="min-w-0">
        <div dir="auto" className="truncate text-sm font-semibold text-zinc-100">
          {conversation.name}
        </div>
        <div className="truncate text-xs text-zinc-500">{conversation.email}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonThread
// ---------------------------------------------------------------------------

/** How many messages render initially; older ones load on demand (P1-F). */
const INITIAL_VISIBLE_MESSAGES = 50;
const LOAD_MORE_STEP = 50;
/** Within this many px of the bottom, new messages auto-scroll (P1-A). */
const NEAR_BOTTOM_PX = 120;

export function PersonThread({
  conversation,
  currentUserEmail,
  renderComposer,
}: PersonThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_MESSAGES);
  const prevLengthRef = useRef<number | null>(null);

  const messages = [...(conversation.messages ?? [])].sort(
    (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
  );

  // P1-F: only the tail renders; "Load earlier messages" reveals the rest.
  // P1-A: switching conversations jumps to the bottom and resets the window.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_MESSAGES);
    setShowNewMessagesPill(false);
    prevLengthRef.current = messages.length;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    // Intentionally keyed on personKey only: a conversation switch resets.
    // (No exhaustive-deps rule is configured in this repo's ESLint setup,
    // so no disable comment is needed — the narrow dep array is deliberate.)
  }, [conversation.personKey]);

  const isNearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setShowNewMessagesPill(false);
  };

  // P1-A: a background poll (or any incoming message) must not yank a reader
  // who scrolled up. Auto-scroll only when already near the bottom; otherwise
  // offer the "New messages" pill.
  useEffect(() => {
    if (prevLengthRef.current === null) {
      prevLengthRef.current = messages.length;
      return;
    }
    if (prevLengthRef.current === messages.length) return;
    prevLengthRef.current = messages.length;
    if (isNearBottom()) {
      scrollToBottom();
    } else {
      setShowNewMessagesPill(true);
    }
  });

  const handleScroll = () => {
    if (isNearBottom()) setShowNewMessagesPill(false);
  };

  const visibleMessages = messages.slice(-visibleCount);
  const earlierCount = messages.length - visibleMessages.length;

  const isUpdatesWorld = conversation.world === 'updates';

  return (
    <div className="flex h-full w-full flex-col bg-black text-zinc-100">
      <ThreadHeader conversation={conversation} />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full space-y-1.5 overflow-y-auto px-3 py-2 sm:px-4"
          data-testid="thread-scroll"
          role="log"
          aria-label={`Conversation with ${conversation.name}`}
        >
          {messages.length === 0 && (
            <div className="py-10 text-center text-sm text-zinc-500">No messages yet.</div>
          )}
          {earlierCount > 0 && (
            <div className="flex justify-center py-2">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + LOAD_MORE_STEP)}
                className="inline-flex min-h-[44px] items-center rounded-full bg-zinc-900 px-4 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 active:bg-zinc-700"
              >
                Load earlier messages ({earlierCount} more)
              </button>
            </div>
          )}
          {visibleMessages.map((message, index) => {
            const fromMe = isFromMe(message, currentUserEmail);
            const previousSubject = index > 0 ? visibleMessages[index - 1].subject : null;
            const subjectChanged =
              previousSubject !== null && message.subject !== previousSubject
                ? message.subject
                : null;
            return (
              <MessageRow
                key={message.id}
                message={message}
                fromMe={fromMe}
                showSenderName={!fromMe || conversation.world === 'groups'}
                showSubjectChange={subjectChanged}
                senderLabel={
                  message.from?.name && message.from.name.trim()
                    ? message.from.name
                    : message.from?.email || conversation.email
                }
              />
            );
          })}
        </div>
        {showNewMessagesPill && (
          <button
            type="button"
            onClick={scrollToBottom}
            data-testid="new-messages-pill"
            className="absolute bottom-3 left-1/2 inline-flex min-h-[44px] -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#F97316] px-4 text-xs font-bold text-black shadow-lg transition-transform active:scale-95"
            aria-label="Jump to new messages"
          >
            New messages
            <svg
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      <div className="px-3 pb-3 sm:px-4">
        {isUpdatesWorld ? (
          <div
            className="py-2 text-center text-xs text-zinc-600"
            data-testid="updates-no-reply-note"
          >
            Notifications don&apos;t need a reply.
          </div>
        ) : (
          renderComposer ?? null
        )}
      </div>
    </div>
  );
}
