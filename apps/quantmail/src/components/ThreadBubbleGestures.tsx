'use client';

// ============================================================================
// ThreadBubbleGestures — the four gestures thread bubbles were missing
// ============================================================================
// WhatsApp's defining gesture is swipe-right-to-reply; Telegram/Slack reveal
// quick actions on hover; long-press and right-click open the message menu.
// The thread view had none of them: zero `onTouch` handlers, zero
// `onContextMenu`, and the only per-message actions lived behind the thread
// header's overflow menu.
//
// `ThreadBubbleShell` wraps one rendered message (collapsed strip or expanded
// card) and layers all four gestures onto it. The shell is purely additive:
// the wrapped content keeps its own click semantics, and every gesture that
// could be mistaken for a tap suppresses the click that follows it — the same
// contract the inbox row's `useTouchSwipe`/`isLongPressRef` pair honours.
//
// Conventions reused from the inbox:
// - `touch-pan-y`: the browser keeps vertical scroll, hands over horizontal.
// - Click suppression window: 400ms after a swipe or long-press fires.
// - Long-press haptic: `navigator.vibrate(35)` (best-effort).
// - Long-press threshold: 500ms (the architect's recommendation over the
//   row's 450ms), with a visible press tint so the gesture is discoverable
//   rather than a vibration out of nowhere.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Email } from '../types';
import { showToast } from './InboxToast';

/** px of rightward travel that commits a swipe into a quoted reply. */
export const SWIPE_REPLY_THRESHOLD_PX = 60;
/** Hard clamp so a long drag cannot throw the bubble off-screen. */
export const MAX_SWIPE_OFFSET_PX = 120;
/** ms of still touch before a long-press fires. */
export const LONG_PRESS_MS = 500;
/** ms a gesture suppresses the click that follows it. */
export const CLICK_SUPPRESSION_MS = 400;
/** Reaction set: standard, emoji-as-content (the design system bans emoji as
 *  UI glyphs, but reactions are message content, like WhatsApp's tray). */
export const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;

/** Pure: clamp rightward travel into the legal range. Unit-tested. */
export function clampSwipeOffset(dx: number): number {
  if (dx <= 0) return 0;
  return Math.min(dx, MAX_SWIPE_OFFSET_PX);
}

/** Pure: has the finger crossed the commit line? Unit-tested. */
export function shouldCommitSwipeReply(offset: number): boolean {
  return offset >= SWIPE_REPLY_THRESHOLD_PX;
}

const MENU_WIDTH_PX = 232;
const MENU_HEIGHT_PX = 340;

/**
 * Pure: clamp a pointer-anchored menu into the viewport. Unit-tested.
 * `menuH` varies with content; callers pass the rendered estimate.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  viewportW: number,
  viewportH: number,
  menuH: number = MENU_HEIGHT_PX,
): { left: number; top: number } {
  const left = Math.max(8, Math.min(x, Math.max(8, viewportW - MENU_WIDTH_PX - 8)));
  const top = Math.max(8, Math.min(y, Math.max(8, viewportH - menuH - 8)));
  return { left, top };
}

function vibrate(ms: number): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(ms);
    } catch {
      /* haptics are best-effort */
    }
  }
}

export interface ThreadBubbleGestureHandlers {
  onQuoteReply: (message: Email) => void;
  onForwardMessage: (message: Email) => void;
  /**
   * Optional: when present the long-press/right-click menu gains a Delete
   * item. Absent (e.g. a read-only thread) the menu simply has no Delete —
   * "delete where allowed".
   */
  onDeleteMessage?: (message: Email) => void;
}

interface UseThreadBubbleGesturesOptions extends ThreadBubbleGestureHandlers {
  message: Email;
}

interface MenuAnchor {
  x: number;
  y: number;
}

function useThreadBubbleGestures({ message, onQuoteReply, onForwardMessage, onDeleteMessage }: UseThreadBubbleGesturesOptions) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isPressing, setIsPressing] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);
  // Local-only reaction counts, keyed by emoji. No delivery pipeline exists
  // yet (see the email-with-chat inventory), so this is optimistic UI with an
  // explicit TODO until `PATCH /messages/:id/reactions` lands.
  // TODO(reactions-pipeline): persist + fan out via WebSocket like QuantChat.
  const [reactions, setReactions] = useState<Record<string, number>>({});

  const touchRef = useRef<{ startX: number; startY: number } | null>(null);
  const trackingRef = useRef(false);
  const armedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressUntilRef = useRef(0);
  const callbacksRef = useRef({ onQuoteReply, onForwardMessage, onDeleteMessage });
  useEffect(() => {
    callbacksRef.current = { onQuoteReply, onForwardMessage, onDeleteMessage };
  });

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsPressing(false);
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const openMenuAt = useCallback((x: number, y: number) => {
    setMenuAnchor({ x, y });
  }, []);

  const closeMenu = useCallback(() => setMenuAnchor(null), []);

  const fireLongPress = useCallback(
    (x: number, y: number) => {
      suppressUntilRef.current = Date.now() + CLICK_SUPPRESSION_MS;
      vibrate(35);
      openMenuAt(x, y);
    },
    [openMenuAt],
  );

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1) return;
      touchRef.current = { startX: touch.clientX, startY: touch.clientY };
      trackingRef.current = false;
      armedRef.current = false;
      setIsPressing(true);
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        setIsPressing(false);
        fireLongPress(touch.clientX, touch.clientY);
      }, LONG_PRESS_MS);
    },
    [fireLongPress],
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      const touch = event.touches[0];
      const start = touchRef.current;
      if (!touch || !start) return;
      const dx = touch.clientX - start.startX;
      const dy = touch.clientY - start.startY;

      // Any real movement cancels the long-press: a press is stillness.
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearLongPress();

      // Horizontal-dominant rightward travel becomes a swipe-to-reply.
      if (!trackingRef.current) {
        if (dx > 8 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          trackingRef.current = true;
          clearLongPress();
        } else {
          return;
        }
      }
      const offset = clampSwipeOffset(dx);
      setSwipeOffset(offset);
      const armed = shouldCommitSwipeReply(offset);
      if (armed && !armedRef.current) vibrate(10);
      armedRef.current = armed;
    },
    [clearLongPress],
  );

  const settleSwipe = useCallback(() => {
    if (trackingRef.current) {
      suppressUntilRef.current = Date.now() + CLICK_SUPPRESSION_MS;
      if (armedRef.current) {
        vibrate(18);
        callbacksRef.current.onQuoteReply(message);
      }
    }
    trackingRef.current = false;
    armedRef.current = false;
    touchRef.current = null;
    setSwipeOffset(0);
  }, [message]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
    settleSwipe();
  }, [clearLongPress, settleSwipe]);

  const handleTouchCancel = useCallback(() => {
    clearLongPress();
    trackingRef.current = false;
    armedRef.current = false;
    touchRef.current = null;
    setSwipeOffset(0);
  }, [clearLongPress]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      // Desktop's long-press: suppress the native menu, show ours.
      event.preventDefault();
      openMenuAt(event.clientX, event.clientY);
    },
    [openMenuAt],
  );

  /** True while a gesture owns the pointer — callers suppress the tap. */
  const shouldSuppressClick = useCallback(
    () => Date.now() < suppressUntilRef.current,
    [],
  );

  const handleClickCapture = useCallback(
    (event: React.MouseEvent) => {
      if (shouldSuppressClick()) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    [shouldSuppressClick],
  );

  const toggleReaction = useCallback((emoji: string) => {
    setReactions((prev) => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }));
  }, []);

  const doCopy = useCallback(() => {
    const text = message.bodyText || message.snippet || '';
    if (text && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {
        /* clipboard is best-effort */
      });
      showToast({ text: 'Message copied to clipboard', type: 'success' });
    }
    closeMenu();
  }, [message, closeMenu]);

  const doQuoteReply = useCallback(() => {
    callbacksRef.current.onQuoteReply(message);
    closeMenu();
  }, [message, closeMenu]);

  const doForward = useCallback(() => {
    callbacksRef.current.onForwardMessage(message);
    closeMenu();
  }, [message, closeMenu]);

  const doDelete = useCallback(() => {
    callbacksRef.current.onDeleteMessage?.(message);
    closeMenu();
  }, [message, closeMenu]);

  return {
    swipeOffset,
    isPressing,
    menuAnchor,
    reactions,
    closeMenu,
    openMenuAt,
    toggleReaction,
    doCopy,
    doQuoteReply,
    doForward,
    doDelete,
    shouldSuppressClick,
    gestureProps: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
      onContextMenu: handleContextMenu,
      onClickCapture: handleClickCapture,
    },
  };
}

function ReplyArrowIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 17l-5-5 5-5" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function CopyIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ForwardIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function SmileyIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" x2="9.01" y1="9" y2="9" />
      <line x1="15" x2="15.01" y1="9" y2="9" />
    </svg>
  );
}

function TrashIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

interface ThreadBubbleMenuProps {
  anchor: MenuAnchor;
  senderName: string;
  onClose: () => void;
  onToggleReaction: (emoji: string) => void;
  onQuoteReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  /** When omitted the menu has no Delete item ("delete where allowed"). */
  onDelete?: () => void;
}

function ThreadBubbleMenu({
  anchor,
  senderName,
  onClose,
  onToggleReaction,
  onQuoteReply,
  onCopy,
  onForward,
  onDelete,
}: ThreadBubbleMenuProps) {
  const pos =
    typeof window !== 'undefined'
      ? clampMenuPosition(anchor.x, anchor.y, window.innerWidth, window.innerHeight)
      : { left: anchor.x, top: anchor.y };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {/* Outside tap: a transparent layer, not a portal — the thread is the world. */}
      <div
        className="fixed inset-0 z-[60]"
        onPointerDown={onClose}
        aria-hidden="true"
      />
      <motion.div
        role="menu"
        aria-label={`Message actions for ${senderName}`}
        initial={{ opacity: 0, scale: 0.92, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -2 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        className="fixed z-[61] overflow-hidden rounded-2xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.65)]"
        style={{ left: pos.left, top: pos.top, width: MENU_WIDTH_PX }}
      >
        {/* Reaction tray — WhatsApp's long-press headline. */}
        <div className="flex items-center justify-between px-3 pb-1.5 pt-1" role="group" aria-label="React to message">
          {REACTION_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              aria-label={`React ${emoji}`}
              onClick={() => onToggleReaction(emoji)}
              className="rounded-full p-1.5 text-xl leading-none transition-transform hover:scale-125 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              <span aria-hidden="true">{emoji}</span>
            </button>
          ))}
        </div>
        <div className="mx-3 border-t border-[var(--quant-surface-elevated)]" aria-hidden="true" />
        {(
          [
            { label: 'Reply', Icon: ReplyArrowIcon, action: onQuoteReply, danger: false },
            { label: 'Copy', Icon: CopyIcon, action: onCopy, danger: false },
            { label: 'Forward', Icon: ForwardIcon, action: onForward, danger: false },
            // Delete only when the host allowed it — the thread view passes it
            // through only when its own `onDelete` prop exists.
            ...(onDelete
              ? [{ label: 'Delete', Icon: TrashIcon, action: onDelete, danger: true } as const]
              : []),
          ] as const
        ).map(({ label, Icon, action, danger }) => (
          <button
            key={label}
            type="button"
            role="menuitem"
            onClick={action}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none ${
              danger
                ? 'text-rose-400 hover:bg-rose-500/10 focus-visible:bg-rose-500/10'
                : 'text-[#EDEDED] hover:bg-white/[0.05] focus-visible:bg-white/[0.05]'
            }`}
          >
            <Icon className={`size-4 ${danger ? 'text-rose-400' : 'text-[var(--quant-muted-foreground)]'}`} />
            <span>{label}</span>
          </button>
        ))}
      </motion.div>
    </>
  );
}

export interface ThreadBubbleShellProps extends ThreadBubbleGestureHandlers {
  message: Email;
  senderName: string;
  isOutbound: boolean;
  children: ReactNode;
}

/**
 * Wraps one rendered thread message and layers the four missing gestures on.
 *
 * - Swipe right (touch, 60px) → quoted reply, with a reply-arrow indicator
 *   that tracks the finger and a haptic when the commit line is crossed.
 * - Long-press (touch, 500ms) → reaction tray + message menu.
 * - Right-click (mouse) → the same menu at the pointer.
 * - Hover (fine pointer) → a fade-in react/reply cluster on the bubble.
 *
 * The wrapped content keeps its own clicks; any gesture that engaged
 * suppresses the tap that would otherwise follow it.
 */
export function ThreadBubbleShell({
  message,
  senderName,
  isOutbound,
  onQuoteReply,
  onForwardMessage,
  onDeleteMessage,
  children,
}: ThreadBubbleShellProps) {
  const {
    swipeOffset,
    isPressing,
    menuAnchor,
    reactions,
    closeMenu,
    openMenuAt,
    toggleReaction,
    doCopy,
    doQuoteReply,
    doForward,
    doDelete,
    gestureProps,
  } = useThreadBubbleGestures({ message, onQuoteReply, onForwardMessage, onDeleteMessage });

  const progress = Math.min(1, swipeOffset / SWIPE_REPLY_THRESHOLD_PX);
  const reactionEntries = Object.entries(reactions).filter(([, count]) => count > 0);

  /*
   * Perf: swipe tracking calls `setSwipeOffset` on every touchmove, which
   * re-renders this shell. The message body (a full letter card with HTML) is
   * the expensive part and its element identity is stable across those
   * renders, so memoizing it keeps the tracking path to the transform plus
   * the indicator — no jank on long threads.
   */
  const stableChildren = useMemo(() => children, [children]);

  return (
    <div
      {...gestureProps}
      // `touch-pan-y`: vertical scroll stays the browser's; horizontal is ours.
      // The inline transform is 1:1 under the finger; a transition class only
      // while settling so it cannot fight the tracking.
      className={`group/bubble relative w-full touch-pan-y ${
        swipeOffset === 0 ? 'transition-transform duration-200 ease-out' : ''
      }`}
      style={swipeOffset === 0 ? undefined : { transform: `translate3d(${swipeOffset}px, 0, 0)` }}
    >
      {/* Swipe indicator: the reply arrow that chases the finger. */}
      {swipeOffset > 8 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1 top-1/2 z-10 -translate-y-1/2"
          style={{ opacity: progress }}
        >
          <span
            className={`flex size-8 items-center justify-center rounded-full bg-[var(--quant-primary)] text-[#111111] shadow-lg transition-transform ${
              progress >= 1 ? 'scale-110' : 'scale-90'
            }`}
          >
            <ReplyArrowIcon className="size-4" />
          </span>
        </div>
      )}

      {/* Long-press cue: a tint while the press is held, so the 500ms is
          discoverable rather than a vibration out of nowhere. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 z-10 rounded-xl bg-white/[0.07] transition-opacity duration-150 ${
          isPressing ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {stableChildren}

      {/* Persisted reactions, rendered as chips under the bubble. */}
      {reactionEntries.length > 0 && (
        <div className={`flex gap-1 px-1 pt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`} aria-label="Message reactions">
          {reactionEntries.map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => toggleReaction(emoji)}
              aria-label={`Reaction ${emoji}, ${count}`}
              className="flex items-center gap-0.5 rounded-full border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] px-1.5 py-0.5 text-xs shadow-sm transition-transform hover:scale-105 active:scale-95"
            >
              <span aria-hidden="true">{emoji}</span>
              <span className="text-[10px] font-semibold text-[var(--quant-muted-foreground)]">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hover quick-actions: Telegram/Slack-style react + reply cluster.
          `group-hover/bubble` only — on coarse pointers the long-press menu
          is the path, so no tap-target conflict. */}
      <div
        className={`absolute z-20 hidden [@media(hover:hover)]:flex items-center gap-1 rounded-full border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)]/95 p-1 opacity-0 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur transition-opacity duration-150 group-hover/bubble:opacity-100 focus-within:opacity-100 ${
          isOutbound ? 'right-3' : 'left-3'
        } -top-3`}
      >
        <button
          type="button"
          onClick={doQuoteReply}
          title="Reply to this message"
          aria-label={`Reply to message from ${senderName}`}
          className="flex size-8 items-center justify-center rounded-full text-[var(--quant-muted-foreground)] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
        >
          <ReplyArrowIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            // The smiley opens the full menu, whose first row is the tray.
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            openMenuAt(rect.left + rect.width / 2, rect.bottom + 8);
          }}
          title="React to this message"
          aria-label={`React to message from ${senderName}`}
          className="flex size-8 items-center justify-center rounded-full text-[var(--quant-muted-foreground)] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
        >
          <SmileyIcon className="size-4" />
        </button>
      </div>

      <AnimatePresence>
        {menuAnchor && (
          <ThreadBubbleMenu
            anchor={menuAnchor}
            senderName={senderName}
            onClose={closeMenu}
            onToggleReaction={(emoji) => {
              toggleReaction(emoji);
              closeMenu();
            }}
            onQuoteReply={doQuoteReply}
            onCopy={doCopy}
            onForward={doForward}
            onDelete={onDeleteMessage ? doDelete : undefined}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
