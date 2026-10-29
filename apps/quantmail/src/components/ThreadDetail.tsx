'use client';

/**
 * ThreadDetail — Phase 1.4 classic mail-detail surface.
 *
 * Presentational only. Nothing is fetched, sent, classified or routed by
 * this component: every action is a caller-owned callback, and any action
 * whose callback is not wired simply does not render. In particular,
 * reaction chips do not render without `onReact` — there is no
 * message-reaction endpoint on the mail backend today, so a tap must
 * never pretend it persisted. Full-compose-with-quoted-block is covered
 * by reusing the existing `/compose` routes through the caller's
 * Reply / Reply-all / Forward callbacks plus the subject/body helpers
 * in `lib/thread-detail` — no new composer is built here.
 *
 * NOT touched by this slice (by design): `lib/threading` classification,
 * `lib/inbox-nav`, `lib/starredDeepLink`, TopBar, CalendarHeader, the
 * existing `ConversationalThreadView`, and `thread/[id]/page.tsx`.
 * Wiring into a route is a CLAIM decision, not part of this component.
 */

import { useState, type ReactNode } from 'react';
import type { Email } from '../types';
import { formatDetailDate } from '../lib/honest-date';
import {
  THREAD_DETAIL_REACTIONS,
  formatAddressList,
  senderDisplayName,
  type ThreadDetailReaction,
} from '../lib/thread-detail';
import { EmailLetterCard } from './EmailLetterCard';
import { IdentityAvatar } from './IdentityAvatar';

export interface ThreadDetailProps {
  subject: string;
  messages: Email[];
  currentEmail?: string;
  currentHandle?: string;
  /** Caller-owned back target; the button renders only when wired. */
  onBack?: () => void;
  backLabel?: string;
  onReply?: () => void;
  onReplyAll?: () => void;
  onForward?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
  /** Wired only once a reaction store/endpoint exists; chips stay hidden until then. */
  onReact?: (messageId: string, reaction: ThreadDetailReaction) => void;
  onOpenInlineReply?: (messageId: string) => void;
  onSendInlineReply?: (messageId: string, text: string) => void;
  className?: string;
}

function ActionButton({
  onClick,
  children,
  label,
}: {
  onClick?: () => void;
  children: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="min-h-[44px] shrink-0 rounded-full border border-[var(--quant-border)] px-4 text-sm text-[var(--quant-foreground)]"
    >
      {children}
    </button>
  );
}

export function ThreadDetail({
  subject,
  messages,
  currentEmail,
  currentHandle,
  onBack,
  backLabel = 'Back to inbox',
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
  onReact,
  onOpenInlineReply,
  onSendInlineReply,
  className = '',
}: ThreadDetailProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState<ReadonlySet<string>>(new Set());
  const [inlineReplyId, setInlineReplyId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState('');

  const hasOverflowAction = Boolean(onArchive || onDelete);
  const hasBarAction = Boolean(
    onReply || onReplyAll || onForward || onArchive || onDelete,
  );

  const toggleDetails = (id: string) => {
    setDetailsOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openInlineReply = (message: Email) => {
    setInlineReplyId(message.id);
    setInlineDraft('');
    onOpenInlineReply?.(message.id);
  };

  const cancelDelete = () => {
    setConfirmDelete(false);
    setOverflowOpen(false);
  };

  const confirmDeleteAction = () => {
    setConfirmDelete(false);
    setOverflowOpen(false);
    onDelete?.();
  };

  if (messages.length === 0) {
    return (
      <div className={className} role="status">
        No messages in this conversation
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header: back arrow + subject (full text in title) + overflow menu. */}
      <header className="flex min-h-[44px] flex-wrap items-center gap-2 border-b border-[var(--quant-border)] px-3 py-2">
        {onBack ? (
          <button
            type="button"
            aria-label={backLabel}
            onClick={onBack}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-lg text-[var(--quant-foreground)]"
          >
            ←
          </button>
        ) : null}
        <h1
          title={subject}
          className="min-w-0 flex-1 truncate text-base font-semibold text-[var(--quant-foreground)]"
        >
          {subject}
        </h1>
        {hasOverflowAction ? (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="More actions"
              aria-expanded={overflowOpen}
              onClick={() => {
                setOverflowOpen((v) => !v);
                setConfirmDelete(false);
              }}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-lg text-[var(--quant-foreground)]"
            >
              ⋯
            </button>
            {overflowOpen ? (
              <div className="absolute right-0 top-full z-10 flex min-w-[180px] flex-col rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-1 shadow-lg">
                {confirmDelete ? (
                  <>
                    <button
                      type="button"
                      onClick={confirmDeleteAction}
                      className="min-h-[44px] rounded-lg px-3 text-left text-sm font-semibold text-red-500"
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      onClick={cancelDelete}
                      className="min-h-[44px] rounded-lg px-3 text-left text-sm text-[var(--quant-foreground)]"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    {onArchive ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOverflowOpen(false);
                          onArchive();
                        }}
                        className="min-h-[44px] rounded-lg px-3 text-left text-sm text-[var(--quant-foreground)]"
                      >
                        Archive
                      </button>
                    ) : null}
                    {onDelete ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="min-h-[44px] rounded-lg px-3 text-left text-sm text-red-500"
                      >
                        Delete
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {/* Message stream, in the order given — never re-sorted. */}
      <div className="flex flex-col gap-4 px-3 py-4">
        {messages.map((message) => {
          const sender = senderDisplayName(message, currentEmail, currentHandle);
          const attachments = message.attachments || [];
          const detailsShown = detailsOpen.has(message.id);
          return (
            <article
              key={message.id}
              className="rounded-2xl border border-[var(--quant-border)] p-3"
            >
              {/* Sender block. */}
              <div className="flex items-center gap-3">
                <IdentityAvatar name={sender} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--quant-foreground)]">
                    {sender}
                  </div>
                  <div className="truncate text-xs text-[var(--quant-muted-foreground)]">
                    {formatDetailDate(message)}
                  </div>
                </div>
                {attachments.length > 0 ? (
                  <span className="shrink-0 rounded-full border border-[var(--quant-border)] px-2 py-1 text-xs text-[var(--quant-muted-foreground)]">
                    {attachments.length} attachment
                    {attachments.length === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>

              {/* From / To / Cc / Date expander. */}
              <button
                type="button"
                aria-expanded={detailsShown}
                onClick={() => toggleDetails(message.id)}
                className="mt-2 flex min-h-[44px] items-center gap-1 text-xs text-[var(--quant-muted-foreground)]"
              >
                to me {detailsShown ? '▴' : '▾'}
              </button>
              {detailsShown ? (
                <dl className="mt-1 space-y-1 text-xs text-[var(--quant-muted-foreground)]">
                  <div className="flex gap-2">
                    <dt className="w-10 shrink-0 font-semibold">From:</dt>
                    <dd className="min-w-0 break-words">
                      {formatAddressList([message.from])}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-10 shrink-0 font-semibold">To:</dt>
                    <dd className="min-w-0 break-words">
                      {formatAddressList(message.to)}
                    </dd>
                  </div>
                  {message.cc && message.cc.length > 0 ? (
                    <div className="flex gap-2">
                      <dt className="w-10 shrink-0 font-semibold">Cc:</dt>
                      <dd className="min-w-0 break-words">
                        {formatAddressList(message.cc)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <dt className="w-10 shrink-0 font-semibold">Date:</dt>
                    <dd className="min-w-0 break-words">
                      {formatDetailDate(message)}
                    </dd>
                  </div>
                </dl>
              ) : null}

              {/* Flat body, rendered by the existing safe-HTML card. */}
              <div className="mt-2">
                <EmailLetterCard email={message} />
              </div>

              {/* Quick reactions — only when onReact is wired. */}
              {onReact ? (
                <div className="mt-3 flex flex-wrap gap-2" aria-label="Reactions">
                  {THREAD_DETAIL_REACTIONS.map((reaction) => (
                    <button
                      key={reaction}
                      type="button"
                      aria-label={`React ${reaction}`}
                      onClick={() => onReact(message.id, reaction)}
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--quant-border)] text-base"
                    >
                      {reaction}
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Reply in thread entry point — only when wired. */}
              {onSendInlineReply ? (
                <div className="mt-3">
                  {inlineReplyId === message.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={inlineDraft}
                        onChange={(e) => setInlineDraft(e.target.value)}
                        rows={3}
                        placeholder="Write a reply…"
                        aria-label="Inline reply"
                        className="w-full rounded-xl border border-[var(--quant-border)] bg-transparent p-3 text-sm text-[var(--quant-foreground)]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          label="Send inline reply"
                          onClick={() => {
                            onSendInlineReply(message.id, inlineDraft);
                            setInlineReplyId(null);
                            setInlineDraft('');
                          }}
                        >
                          Send
                        </ActionButton>
                        <ActionButton
                          label="Cancel inline reply"
                          onClick={() => {
                            setInlineReplyId(null);
                            setInlineDraft('');
                          }}
                        >
                          Cancel
                        </ActionButton>
                      </div>
                    </div>
                  ) : (
                    <ActionButton
                      label="Reply in thread"
                      onClick={() => openInlineReply(message)}
                    >
                      Reply in thread
                    </ActionButton>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {/* Sticky bottom action bar — only when an action is wired. */}
      {hasBarAction ? (
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-2">
          {onReply ? (
            <ActionButton label="Reply" onClick={onReply}>
              Reply
            </ActionButton>
          ) : null}
          {onReplyAll || onForward ? (
            <div className="relative shrink-0">
              <ActionButton
                label="More reply options"
                onClick={() => setDropdownOpen((v) => !v)}
              >
                Reply options ▾
              </ActionButton>
              {dropdownOpen ? (
                <div className="absolute bottom-full left-0 z-10 mb-1 flex min-w-[180px] flex-col rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-1 shadow-lg">
                  {onReplyAll ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onReplyAll();
                      }}
                      className="min-h-[44px] rounded-lg px-3 text-left text-sm text-[var(--quant-foreground)]"
                    >
                      Reply all
                    </button>
                  ) : null}
                  {onForward ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDropdownOpen(false);
                        onForward();
                      }}
                      className="min-h-[44px] rounded-lg px-3 text-left text-sm text-[var(--quant-foreground)]"
                    >
                      Forward
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {onArchive ? (
            <ActionButton label="Archive thread" onClick={onArchive}>
              Archive
            </ActionButton>
          ) : null}
          {onDelete ? (
            confirmDelete ? (
              <>
                <ActionButton label="Confirm delete thread" onClick={confirmDeleteAction}>
                  Confirm delete
                </ActionButton>
                <ActionButton label="Cancel delete" onClick={cancelDelete}>
                  Cancel
                </ActionButton>
              </>
            ) : (
              <ActionButton label="Delete thread" onClick={() => setConfirmDelete(true)}>
                Delete
              </ActionButton>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
