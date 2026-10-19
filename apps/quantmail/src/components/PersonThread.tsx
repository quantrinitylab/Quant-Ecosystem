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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Email } from '../types';
import { isFromMe } from '../lib/threading';
import { htmlToPlainText } from '../lib/htmlToPlainText';
import { IdentityAvatar } from './IdentityAvatar';
import { EmailSafetyBanner } from './EmailSafetyBanner';
import { AttachmentPreview } from './AttachmentPreview';
import { EmailReadReceipt, OpenTrackingIndicator } from './EmailReadReceipt';
import { receiptStatusOf, openStatusOf } from '../lib/readReceipt';
import { attachmentServiceId } from '../lib/mail-attachments';
import { showToast } from './InboxToast';
import { useRegisterCommands } from '../lib/keyboard/hooks';
import type { Command } from '../lib/keyboard/command-registry';
import { THREAD_KEYBOARD_SCOPE } from '../hooks/useThreadViewKeyboard';
import {
  buildEventDraftFromThread,
  type EmailDraftEntryType,
  type EmailEventDraft,
} from '../lib/emailToEvent';
import type { ConversationWorld, PersonConversation } from '../lib/peopleGrouping';

// Re-exported so thread consumers can get the contract types from one place.
export type { ConversationWorld, PersonConversation };

export interface PersonThreadProps {
  conversation: PersonConversation;
  currentUserEmail: string;
  /** Reply surface rendered below the messages. Never rendered in the Updates world. */
  renderComposer?: React.ReactNode;
  /**
   * fix/qm-calendar-nlp-quickadd — one-key event-from-email. The parent
   * receives the draft built from this conversation's messages (attendees
   * from the real participants, time parsed or honestly marked suggested)
   * and decides where it goes — the people page deep-links to
   * /calendar?emailDraft=. Absent → no event button and no `b` binding.
   */
  onEventDraft?: (draft: EmailEventDraft) => void;
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
  // Guard the same family as dayKey/formatDayDivider: an unparseable
  // receivedAt must degrade to an empty fallback — never the literal
  // "Invalid Date" under a message bubble.
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
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
  currentUserEmail,
}: {
  message: Email;
  fromMe: boolean;
  showSenderName: boolean;
  /** The new subject when it differs from the previous message's, else null. */
  showSubjectChange: string | null;
  senderLabel: string;
  /** The signed-in user's address — drives the external-sender indicator. */
  currentUserEmail: string;
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
  /*
   * fix/qm-personthread-read-ticks — WhatsApp-style read ticks on YOUR sent
   * messages (shared receiptStatusOf with ConversationalThreadView: single
   * grey = sent, double grey = delivered, double green = read). The default
   * people thread never rendered them, so sent mail here carried no
   * delivery/read state. Inbound rows and notes-to-self get none, exactly
   * like a messaging app.
   */
  const receipt = receiptStatusOf(message, fromMe, currentUserEmail);
  // Open tracking (fix/qm-composer-open-tracking-2): external-recipient read
  // status; null unless the beacon fired.
  const openStatus = openStatusOf(message);
  const visibleText = expanded || !isLong ? fullText : `${fullText.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
  const attachments = message.attachments ?? [];

  // Map the message's EmailAttachment rows onto the AttachmentPreview
  // contract (same defensive mapping as ConversationalThreadView, plus the
  // QM-M39-010 rule): only AttachmentService rows ("att_<uuid>") carry
  // readable bytes on the backend — inbound metadata-only rows get no
  // attachmentId, so no Save-to-Drive button is ever offered on bytes the
  // backend cannot read. A row with no url simply opens no preview — no
  // fake preview, no invented download path.
  const previewAttachments = attachments.map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename ?? 'attachment',
    mimeType: attachment.mimeType ?? 'application/octet-stream',
    size: attachment.size ?? 0,
    url: attachment.url,
    attachmentId: attachmentServiceId(attachment.id),
  }));

  const scrollToMessage = () => {
    const el = document.getElementById(`mail-message-${message.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div data-testid="thread-message" data-sent={fromMe ? 'true' : 'false'} id={`mail-message-${message.id}`}>
      {/*
        QM-SCREEN-005 R2: sender-safety indicators on inbound messages —
        external-sender note plus the real backend phishing scan (lazy, per
        message). Your own sends are never scanned.
      */}
      {!fromMe && (
        <div className="mb-1.5 w-full max-w-[85%] sm:max-w-[70%]">
          <EmailSafetyBanner
            email={message}
            currentUserEmail={currentUserEmail}
            isOutbound={false}
            variant="compact"
          />
        </div>
      )}
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
            <div className="mt-2 personthread-attachments" data-testid="thread-attachments">
              <AttachmentPreview
                attachments={previewAttachments}
                messageId={message.id}
                onBackToMail={scrollToMessage}
              />
            </div>
          )}
          <div className="mt-1 flex items-center justify-end gap-1.5 text-right text-[11px] text-zinc-500">
            {isPendingSend ? (
              <span className="inline-flex items-center gap-1" aria-label="Sending">
                <span
                  className="size-3 rounded-full border border-zinc-500 border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                Sending…
              </span>
            ) : (
              <>
                <span>{formatMessageTime(message.receivedAt)}</span>
                {/*
                  Read ticks (fix/qm-personthread-read-ticks): suppressed while
                  the send is still in flight — a "sent" tick on an unsent
                  message would lie about its state; the Sending… spinner is
                  the honest in-flight indicator.
                */}
                {receipt && (
                  <EmailReadReceipt
                    status={receipt.status}
                    readAt={receipt.readAt}
                    deliveredAt={receipt.deliveredAt}
                  />
                )}
                  {/* Open tracking (fix/qm-composer-open-tracking-2): Superhuman-class read status for external recipients — shows only when the beacon fired (openStatusOf returns null otherwise). */}
                  {openStatus && (
                    <OpenTrackingIndicator
                      openCount={openStatus.openCount}
                      firstOpenedAt={openStatus.firstOpenedAt}
                      lastOpenedAt={openStatus.lastOpenedAt}
                    />
                  )}
              </>
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

function ThreadHeader({
  conversation,
  onCreateEvent,
}: {
  conversation: PersonConversation;
  /** fix/qm-calendar-nlp-quickadd: one-key event-from-email entry point. */
  onCreateEvent?: () => void;
}) {
  const headerAction = onCreateEvent ? (
    <button
      type="button"
      onClick={onCreateEvent}
      title="Create event from email (B)"
      aria-label="Create calendar event from this conversation"
      className="ml-auto flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-info)] sm:min-h-0 sm:min-w-0"
    >
      <svg
        className="size-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
      </svg>
    </button>
  ) : null;

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
        {headerAction}
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
      {headerAction}
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

/**
 * NaN-guard for the chronological sort — sister to the formatMessageTime /
 * dayKey / formatDayDivider guards from fix/qm-invalid-date-guard (#874).
 * An unparseable receivedAt maps to -Infinity so it sorts deterministically
 * to the START of the thread: never into the visible 50-message tail
 * window (which renders the newest end), and always behind the
 * "Load earlier messages" reveal. Valid timestamps are unaffected.
 */
export function messageSortTime(receivedAt: Date | string): number {
  const date = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  const t = date.getTime();
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * Total-order chronological comparator with a stable id tie-break.
 * Uses three-way comparison — never subtraction — so the comparator
 * always returns a real number and the sort contract (antisymmetry,
 * transitivity) holds for every input pair, including when both
 * timestamps are invalid. (Note: -Infinity - -Infinity is NaN, which
 * is exactly the contract violation this fix removes.)
 */
export function compareMessagesChronologically(a: Email, b: Email): number {
  const ta = messageSortTime(a.receivedAt);
  const tb = messageSortTime(b.receivedAt);
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function PersonThread({
  conversation,
  currentUserEmail,
  renderComposer,
  onEventDraft,
}: PersonThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showNewMessagesPill, setShowNewMessagesPill] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_MESSAGES);
  const prevLengthRef = useRef<number | null>(null);

  // NaN-guard comparator (messageSortTime/compareMessagesChronologically):
  // an unparseable receivedAt sorts to the start of the thread so the
  // visible 50-message tail window never clips real messages around it.
  const messages = [...(conversation.messages ?? [])].sort(compareMessagesChronologically);

  /*
   * fix/qm-calendar-nlp-quickadd — one-key event-from-email. Same draft
   * builder as the thread view: attendees from the real participants, time
   * parsed from the email or honestly marked suggested. Navigation stays
   * with the parent (no useRouter here — this component renders in tests
   * without the app router mounted).
   */
  const handleCreateEventFromEmail = useCallback(
    (entryType: EmailDraftEntryType) => {
      const draft = buildEventDraftFromThread(messages, currentUserEmail, new Date(), entryType);
      if (!draft) {
        showToast({ text: 'No messages to build an event from', type: 'error' });
        return;
      }
      onEventDraft?.(draft);
    },
    [messages, currentUserEmail, onEventDraft],
  );

  useRegisterCommands(
    useMemo(
      () =>
        onEventDraft
          ? [
              {
                id: 'thread.createEvent',
                label: 'Create event from email',
                group: 'Conversation',
                keys: 'b',
                scope: THREAD_KEYBOARD_SCOPE,
                description: 'Build a calendar event from this conversation — attendees pulled from the thread',
                run: () => handleCreateEventFromEmail('event'),
              } satisfies Command,
            ]
          : [],
      [handleCreateEventFromEmail, onEventDraft],
    ),
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
      <ThreadHeader
        conversation={conversation}
        onCreateEvent={onEventDraft ? () => handleCreateEventFromEmail('event') : undefined}
      />

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
                currentUserEmail={currentUserEmail}
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
