'use client';

import { useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import { useConfirm } from './useConfirm';

/**
 * The thread page's handle on the quick-reply unsaved-changes guard. Kept as
 * a ref (not a callback prop) because the page's leave paths — edge swipe,
 * keyboard Esc, swipe-to-next-thread — fire outside the view's own back
 * button, which already routes through `onClose`.
 */
export interface ThreadLeaveGuard {
  /** Resolves true when it is safe to navigate away from the thread. */
  confirmLeaveIfNeeded: () => Promise<boolean>;
}

/**
 * Unsaved-changes guard for the thread leave paths (edge swipe, header back,
 * Esc, swipe-to-next-thread). Mirrors /compose's discard guard
 * (L773/qm-compose-edge-swipe-discard): the branded confirm replaces the old
 * silent vaporisation of typed-but-unsent quick-reply text.
 *
 * The copy is /compose's verbatim discard wording
 * (EmailComposer.handleDiscardDraft) — no new copy, no new design language.
 * "Keep editing" resolves false and the text stays put; an empty reply bar
 * resolves true with no dialog at all. Confirming "Discard" clears the bar —
 * the thread view instance is reused across thread navigations, so a
 * discarded reply must not leak into the next thread's composer.
 *
 * Returns the guard callback plus the branded confirm dialog element —
 * render the dialog once in the host tree (ConfirmDialog portals to
 * document.body).
 */
export function useThreadLeaveGuard(
  quickReplyText: string,
  setQuickReplyText: (text: string) => void,
  leaveGuardRef?: RefObject<ThreadLeaveGuard | null>,
) {
  const { confirm, dialog } = useConfirm();

  const confirmLeaveIfNeeded = useCallback(async (): Promise<boolean> => {
    if (!quickReplyText.trim()) return true;
    const discard = await confirm({
      title: 'Discard draft?',
      message: "This message hasn't been saved. Discard it?",
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      variant: 'destructive',
    });
    if (discard) setQuickReplyText('');
    return discard;
  }, [quickReplyText, setQuickReplyText, confirm]);

  useEffect(() => {
    if (!leaveGuardRef) return;
    leaveGuardRef.current = { confirmLeaveIfNeeded };
    return () => {
      leaveGuardRef.current = null;
    };
  }, [leaveGuardRef, confirmLeaveIfNeeded]);

  return { dialog, confirmLeaveIfNeeded };
}
