'use client';

// ============================================================================
// QuantChat - StoryShareSheet (QC-F-556)
// ============================================================================
//
// The share surface for a story: pick one of YOUR conversations to send
// the story into as a gated reference card (POST /stories/:id/share via
// the caller's onShare), or copy the story's shareable link. The link
// points at the gated /stories/[storyId] page — it opens only for a
// signed-in user who passes the story's audience gate, so copying it is
// not a gate bypass. Sends surface their real result: a failed send
// shows the error and keeps the sheet open; nothing here claims success
// before the backend has persisted the card.
// ============================================================================

import { useState } from 'react';
import { useConversations } from '../hooks/useConversations';
import type { Conversation } from '../types';

interface StoryShareSheetProps {
  storyId: string;
  authorName: string;
  isOpen: boolean;
  onClose: () => void;
  /** Persist the share into a conversation; must reject on failure. */
  onShare: (conversationId: string) => Promise<void>;
}

function conversationLabel(conversation: Conversation): string {
  if (conversation.name) return conversation.name;
  const names = (conversation.participants ?? [])
    .map((p) => p.displayName)
    .filter(Boolean);
  return names.length > 0 ? names.join(', ') : 'Conversation';
}

export function StoryShareSheet({
  storyId,
  authorName,
  isOpen,
  onClose,
  onShare,
}: StoryShareSheetProps) {
  const { conversations, isLoading, error } = useConversations();
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (!isOpen) return null;

  const handleSend = async (conversationId: string) => {
    setSendingId(conversationId);
    setSendError(null);
    try {
      await onShare(conversationId);
      setSentId(conversationId);
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Couldn't share this story. Please try again.",
      );
    } finally {
      setSendingId(null);
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/stories/${storyId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Share story by ${authorName}`}
      data-testid="story-share-sheet"
    >
      <div className="w-full max-w-md rounded-2xl bg-[var(--quant-background)] border border-[var(--quant-border)] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--quant-border)]">
          <div>
            <p className="text-sm font-semibold text-[var(--quant-foreground)]">Share story</p>
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              {authorName} · only people who can view this story can open it
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share sheet"
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--quant-muted)] min-w-touch min-h-touch"
          >
            &#10005;
          </button>
        </div>

        <div className="px-4 py-3 border-b border-[var(--quant-border)]">
          <button
            type="button"
            onClick={handleCopyLink}
            className="w-full px-4 py-2.5 rounded-xl border border-[var(--quant-border)] text-sm font-medium text-[var(--quant-foreground)] hover:bg-[var(--quant-muted)]"
          >
            {copyState === 'copied'
              ? 'Link copied'
              : copyState === 'failed'
                ? "Couldn't copy — long-press the address bar link instead"
                : 'Copy link'}
          </button>
          <p className="mt-2 text-[11px] text-[var(--quant-muted-foreground)]">
            The link opens only for signed-in people who can view this story.
          </p>
        </div>

        <div className="overflow-y-auto px-2 py-2">
          {isLoading ? (
            <p className="px-3 py-4 text-sm text-[var(--quant-muted-foreground)]">
              Loading your conversations…
            </p>
          ) : error ? (
            <p className="px-3 py-4 text-sm text-red-500">
              Couldn't load your conversations. Close this and try again.
            </p>
          ) : conversations.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--quant-muted-foreground)]">
              You don't have any conversations yet — start a chat first, then share.
            </p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--quant-muted)]"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--quant-foreground)] truncate">
                    {conversationLabel(conversation)}
                  </p>
                  <p className="text-[11px] text-[var(--quant-muted-foreground)] capitalize">
                    {String(conversation.type).toLowerCase()}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={sendingId !== null || sentId === conversation.id}
                  onClick={() => handleSend(conversation.id)}
                  className="px-3.5 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 shrink-0"
                >
                  {sentId === conversation.id
                    ? 'Sent'
                    : sendingId === conversation.id
                      ? 'Sending…'
                      : 'Send'}
                </button>
              </div>
            ))
          )}
          {sendError && (
            <p role="alert" className="px-3 py-2 text-sm text-red-500">
              {sendError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default StoryShareSheet;
