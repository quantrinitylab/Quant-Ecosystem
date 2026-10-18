'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Email } from '../types';

/**
 * Per-thread quick-reply composer state for ConversationalThreadView
 * (fix/qm-thread-quickreply-reset).
 *
 * The thread view instance is reused across /thread/A → /thread/B
 * navigations — the thread page renders it without key= — so anything the
 * composer holds must be re-keyed to the thread. A half-typed reply, a
 * quoted-message chip, a stale send error, or an open schedule modal from
 * thread A riding into thread B's bar is a misdirected-message risk, and
 * browser-chrome back/forward between threads bypasses the leave guard
 * entirely. The reset therefore lives on the threadId itself, not only on
 * the guard's confirmed-discard path.
 *
 * Deliberately NOT reset here: `isSendingQuickReply` (a transient latch
 * owned by the in-flight send; clearing it on navigation would let a second
 * send start while the first is still running) and `composeMode`
 * (chat-vs-mail is a user preference, not thread content).
 */
export function useThreadComposerDraft(threadId: string) {
  const [quickReplyText, setQuickReplyText] = useState('');
  const [quotedMessage, setQuotedMessage] = useState<Email | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  useEffect(() => {
    setQuickReplyText('');
    setQuotedMessage(null);
    setReplyError(null);
    setShowScheduleModal(false);
  }, [threadId]);

  /**
   * Setter shape the leave guard expects. Writing '' is a discard, so it
   * clears the quote chip too — the chip is part of the draft, not
   * decoration, and must not survive a confirmed discard into the next
   * thread either. Any other write is a plain text update.
   */
  const setDraftText = useCallback((text: string) => {
    setQuickReplyText(text);
    if (!text) setQuotedMessage(null);
  }, []);

  return {
    quickReplyText,
    setQuickReplyText,
    quotedMessage,
    setQuotedMessage,
    replyError,
    setReplyError,
    showScheduleModal,
    setShowScheduleModal,
    setDraftText,
  };
}
