'use client';

import { useEffect, useState } from 'react';

/**
 * QM-UIUX-040: one-time swipe tip for the inbox.
 *
 * Rows carry real swipe actions (left = archive, right = snooze) that a new
 * user has no way to discover. This says so once, in the list header, and
 * never again: dismissal is persisted in localStorage. It is only mounted
 * where swipeable rows exist.
 */

export const SWIPE_HINT_STORAGE_KEY = 'quantmail.swipe-hint-dismissed';

interface HintStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isSwipeHintDismissed(storage: HintStorage): boolean {
  try {
    return storage.getItem(SWIPE_HINT_STORAGE_KEY) !== null;
  } catch {
    // Storage that refuses to answer (private mode, disabled cookies) must
    // not turn into a hint that can never be dismissed — treat it as seen.
    return true;
  }
}

export function dismissSwipeHint(storage: HintStorage): void {
  try {
    storage.setItem(SWIPE_HINT_STORAGE_KEY, '1');
  } catch {
    // Nothing to persist into; the hint still hides for this session.
  }
}

export function SwipeHintBar({ onDismiss }: { onDismiss: () => void }) {
  return (
    <p className="mail-swipe-hint" role="note">
      <svg
        className="size-3.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m18 8 4 4-4 4" />
        <path d="M2 12h20" />
        <path d="m6 8-4 4 4 4" />
      </svg>
      <span>Swipe a conversation left to archive it, or right to snooze it.</span>
      <button
        type="button"
        className="mail-swipe-hint-dismiss"
        onClick={onDismiss}
        aria-label="Dismiss swipe tip"
      >
        ×
      </button>
    </p>
  );
}

export function SwipeHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isSwipeHintDismissed(window.localStorage)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <SwipeHintBar
      onDismiss={() => {
        dismissSwipeHint(window.localStorage);
        setVisible(false);
      }}
    />
  );
}

export default SwipeHint;
