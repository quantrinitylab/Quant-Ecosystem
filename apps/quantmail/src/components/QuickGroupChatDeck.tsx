'use client';

/**
 * QuickGroupChatDeck — the WhatsApp-style quick group-chat deck on the main
 * page ("Message <group>…" overlay opened from a group row).
 *
 * P1 false-success fix (finding 2026-10-18): the deck's Send used to fire
 * `composeEmail` + `sendEmail` the instant it was pressed, never read the
 * `sendEmail` result, and toasted "Message sent" unconditionally — a failed
 * send still celebrated — while bypassing the undo-send queue entirely, so an
 * accidental tap delivered with zero recall while every other compose surface
 * (EmailComposer, DockedComposer, ThreadComposer, quick reply, copilot
 * drawer) gets the 10-second window.
 *
 * The deck now routes through the shared queue (`useUndoSend`, from AppShell's
 * `UndoSendProvider` — this component must be rendered inside AppShell):
 * the real API call lives in `onSendNow` and runs only when the recall window
 * closes; `onSendNow` REJECTS on any failure (compose or send), so the
 * countdown bar can never claim "sent" for a message that never went out;
 * Undo (or a failed send) reopens this deck with the words intact via
 * `onRestore`. The success toast fires only after the awaited send truly
 * completed — never a timer guess, never on failure.
 */

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ContactGroup } from '../types';
import { apiClient } from '../services/api-client';
import { plainTextToHtml } from '../lib/email-body';
import { showToast } from './InboxToast';
import { invalidateMailLists } from '../lib/offline/folders';
import { useUndoSend } from './UndoSendCountdownBar';
import { MailIcon } from './MailIcon';

export interface QuickGroupChatDeckProps {
  /** The group being messaged. The host renders this deck only when non-null. */
  target: ContactGroup;
  message: string;
  onMessageChange: (value: string) => void;
  /** Close the deck (host clears its target). */
  onClose: () => void;
  /**
   * Reopen the deck with the message restored — the "hand the words back"
   * path shared by Undo and by a failed send, so a message is never silently
   * eaten.
   */
  onRestore: (target: ContactGroup, message: string) => void;
  /** Host refresh after a genuinely completed send. */
  onSent?: () => void | Promise<void>;
}

export function QuickGroupChatDeck({
  target,
  message,
  onMessageChange,
  onClose,
  onRestore,
  onSent,
}: QuickGroupChatDeckProps) {
  // The shared undo-send queue from AppShell's UndoSendProvider — the same
  // 10-second recall window the composers, quick reply and copilot drawer
  // send through. The deck used to be the one send surface with no way back.
  const { queueSend } = useUndoSend();
  const queryClient = useQueryClient();
  const [isSending, setIsSending] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = message.trim();
    if (!text || isSending) return;

    // Snapshot before the deck clears: `target`/`message` props can change
    // (or unmount) once the deck closes, but the queued send must keep the
    // exact words the user pressed Send on.
    const snapshotTarget = target;
    const snapshotText = text;
    const snapshotSubject = `[Group] ${snapshotTarget.name}`;

    // Undo and failed-send share one restore: reopen this exact deck with
    // the words intact. The `prev.trim()` guard keeps a restore from
    // clobbering a newer message the user started typing during the window.
    const restoreDeck = () => {
      onRestore(snapshotTarget, snapshotText);
    };

    // Runs only when the recall window closes (countdown expiry or Send
    // Now). MUST resolve only after the send truly completed — the
    // countdown bar claims "sent" only on resolve. Reject (throw) on any
    // failure so the bar never celebrates a send that never happened
    // (the false-success class this fix kills).
    const performSend = async (): Promise<void> => {
      setIsSending(true);
      try {
        const composeRes = await apiClient.composeEmail({
          to: snapshotTarget.emails.map((email) => ({ email })),
          subject: snapshotSubject,
          bodyText: snapshotText,
          // Escaped, like the quick-reply path: interpolating the raw text
          // into `<p>…</p>` broke on messages containing `<`.
          bodyHtml: plainTextToHtml(snapshotText),
          isDraft: false,
          messageKind: 'chat',
        });
        if (!composeRes.success || !composeRes.data?.id) {
          throw new Error(composeRes.error?.message || 'Failed to send message');
        }
        const sendRes = await apiClient.sendEmail(composeRes.data.id);
        if (!sendRes.success) {
          throw new Error(sendRes.error?.message || 'Failed to send message');
        }
        invalidateMailLists(queryClient);
        // Honest copy: this toast fires only after the awaited send truly
        // completed — never before the window closes, never on failure.
        showToast({
          text: `Message sent to ${snapshotTarget.name}`,
          type: 'success',
        });
        await onSent?.();
      } finally {
        setIsSending(false);
      }
    };

    queueSend({
      to: snapshotTarget.name,
      subject: snapshotSubject,
      body: snapshotText,
      onSendNow: performSend,
      // A rejected send hands the words back with an honest error — the bar
      // never claims "sent" for it.
      onSendFailed: (error: unknown) => {
        const failureMessage =
          error instanceof Error && error.message
            ? error.message
            : 'Could not send message to group';
        showToast({ text: failureMessage, type: 'error' });
        restoreDeck();
      },
      onUndo: () => {
        showToast({ text: 'Send undone — your message is back', type: 'info' });
        restoreDeck();
      },
    });

    // The deck clears the moment Send is pressed, exactly like the
    // composers: the countdown bar owns the in-flight state from here, and
    // Undo (or a failed send) restores the words via `restoreDeck`.
    onMessageChange('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[var(--quant-surface-elevated)] border border-[#3A404D]/80 rounded-2xl overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.7)] flex flex-col">
        {/* Header with WhatsApp-style group info */}
        <div className="flex items-center justify-between gap-3 p-4 bg-[var(--quant-surface-elevated)] border-b border-[var(--quant-surface-elevated)]">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="size-11 rounded-full flex items-center justify-center text-[var(--quant-surface)] font-bold shrink-0 shadow"
              style={{ background: target.color ?? 'var(--quant-primary)' }}
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate">
                {target.name}
              </h3>
              <p className="text-[11px] text-[var(--quant-muted-foreground)] truncate">
                {target.emails.length} participants:{' '}
                {target.emails.join(', ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] flex items-center justify-center transition-colors"
            aria-label="Close group chat"
          >
            <MailIcon name="close" className="size-4" />
          </button>
        </div>

        {/* Chat conversation preview */}
        <div className="p-4 min-h-[140px] max-h-[240px] overflow-y-auto bg-[var(--quant-background)]/70 flex flex-col justify-end space-y-3">
          <div className="mx-auto text-center px-3 py-1 rounded-full bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] text-[10px] text-[var(--quant-muted-foreground)]">
            Delivered to all {target.emails.length} group members
          </div>
          <div className="bg-[var(--quant-surface-elevated)]/80 border border-[var(--quant-surface-elevated)] rounded-xl p-3 text-xs text-[var(--quant-muted-foreground)] text-center">
            Send a quick message or update to everyone in{' '}
            <strong className="text-white">{target.name}</strong>.
          </div>
        </div>

        {/* WhatsApp-style Input Deck */}
        <form
          onSubmit={handleSubmit}
          className="p-3 bg-[var(--quant-surface)] border-t border-[var(--quant-surface-elevated)] flex items-center gap-2"
        >
          <input
            type="text"
            value={message}
            onChange={(e) => onMessageChange(e.target.value)}
            placeholder={`Message ${target.name}…`}
            autoFocus
            className="flex-1 min-h-touch bg-[var(--quant-background)] border border-[var(--quant-surface-elevated)] focus:border-[var(--quant-primary)] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!message.trim() || isSending}
            className="px-4 min-h-touch rounded-xl bg-[var(--quant-primary)] hover:bg-[var(--quant-primary-hover)] active:bg-[var(--brand-primary-pressed)] text-[var(--quant-background)] text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
          >
            {isSending ? (
              'Sending…'
            ) : (
              <>
                <span>Send</span>
                <svg
                  className="size-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
