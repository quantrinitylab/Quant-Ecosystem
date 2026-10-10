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

import { useEffect, useRef, useState } from 'react';
import type { Email } from '../types';
import { isFromMe } from '../lib/threading';
import { formatBytes } from '../lib/format-bytes';
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
  const html = (message.bodyHtml || '').trim();
  if (!html) return '';
  // Simple tag strip + entity decode. We render text only — untrusted markup
  // is never passed to dangerouslySetInnerHTML.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
  const fullText = plainBodyText(message);
  const isLong = fullText.length > SNIPPET_LENGTH;
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
          <span className="text-[11px] tracking-wide text-zinc-500">
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
            <div className="mb-1 text-[11px] font-medium text-zinc-400">{senderLabel}</div>
          )}
          {fullText ? (
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {visibleText}
            </div>
          ) : (
            <div className="text-sm italic text-zinc-500">No message text.</div>
          )}
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-medium text-orange-400/90 hover:text-orange-300"
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
          <div className="mt-1 text-right text-[10px] text-zinc-500">
            {formatMessageTime(message.receivedAt)}
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
          <div className="truncate text-sm font-semibold text-zinc-100">{conversation.name}</div>
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
        <div className="truncate text-sm font-semibold text-zinc-100">{conversation.name}</div>
        <div className="truncate text-xs text-zinc-500">{conversation.email}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PersonThread
// ---------------------------------------------------------------------------

export function PersonThread({
  conversation,
  currentUserEmail,
  renderComposer,
}: PersonThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = [...(conversation.messages ?? [])].sort(
    (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, conversation.personKey]);

  const isUpdatesWorld = conversation.world === 'updates';

  return (
    <div className="flex h-full w-full flex-col bg-black text-zinc-100">
      <ThreadHeader conversation={conversation} />

      <div
        ref={scrollRef}
        className="flex-1 space-y-1.5 overflow-y-auto px-3 py-2 sm:px-4"
        data-testid="thread-scroll"
        role="log"
        aria-label={`Conversation with ${conversation.name}`}
      >
        {messages.length === 0 && (
          <div className="py-10 text-center text-sm text-zinc-500">No messages yet.</div>
        )}
        {messages.map((message, index) => {
          const fromMe = isFromMe(message, currentUserEmail);
          const previousSubject = index > 0 ? messages[index - 1].subject : null;
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
