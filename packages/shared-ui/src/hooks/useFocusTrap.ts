'use client';
// ============================================================================
// Shared UI - useFocusTrap
// One implementation of the thing every `aria-modal` surface in the ecosystem
// was supposed to do and none of them did: keep Tab inside the dialog, move
// focus in on open, and hand it back to whatever opened it on close.
// ============================================================================

import { useEffect, useRef } from 'react';

/**
 * Anything that can hold focus, minus the things that only *look* focusable.
 *
 * The generic `[tabindex]:not([tabindex="-1"])` branch is not enough on its own,
 * which is the whole reason the runtime `tabindex` filter below exists: a
 * `<button tabindex="-1">` still matches `button:not([disabled])`, and a list
 * built on the roving-tabindex/`aria-activedescendant` pattern is *made* of
 * those. Measured on the command palette — 25 elements matched, 24 of them
 * `tabindex="-1"` rows — so the trap's "last" was a row Tab can never reach, the
 * wrap never fired, and Tab walked out into the page behind an `aria-modal`
 * surface. Programmatically focusable is not the same as tabbable, and a Tab trap
 * only cares about the second.
 */
const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface UseFocusTrapOptions {
  /** Trap only while this is true. Everything is inert when it flips false. */
  active: boolean;
  /**
   * Called when Escape is pressed inside the trap. Omit to leave Escape to the
   * surface's own handler — this hook does not assume it owns dismissal.
   */
  onEscape?: () => void;
  /**
   * Move focus into the container on activate. Default true. Pass false for a
   * surface that manages its own initial focus (a search field that should keep
   * the caret where the user left it, say).
   *
   * When true, a descendant carrying `data-autofocus` wins over DOM order. Mark
   * the control the user actually came to use — otherwise focus lands on
   * whatever happens to be first, which in a titled dialog is the close button.
   * React's own `autoFocus` prop cannot be honoured here: React DOM focuses
   * imperatively without rendering the attribute, so there is nothing to find.
   */
  autoFocus?: boolean;
  /**
   * Restore focus to the element that had it before activation. Default true.
   * Pass false when the caller is about to focus something itself — otherwise
   * the two fight and the user lands somewhere neither intended.
   */
  restoreFocus?: boolean;
}

/**
 * Attach to a dialog's outermost node:
 *
 * ```tsx
 * const trapRef = useFocusTrap<HTMLDivElement>({ active: isOpen, onEscape: onClose });
 * return <div ref={trapRef} role="dialog" aria-modal="true">…</div>;
 * ```
 *
 * Focusable children are re-read on every Tab rather than cached at activation,
 * so a dialog whose contents arrive after a fetch — or whose footer button only
 * renders once a form validates — traps correctly instead of trapping the set
 * that happened to exist on the first frame.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  options: UseFocusTrapOptions,
): React.RefObject<T | null> {
  const { active, onEscape, autoFocus = true, restoreFocus = true } = options;
  const containerRef = useRef<T | null>(null);

  // Read through refs inside the listener so changing `onEscape` between
  // renders does not detach and reattach the handler — which would drop the
  // captured `previouslyFocused` and lose the return target.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  /**
   * Where focus goes on close, captured during render rather than read in the
   * activation effect.
   *
   * Reading `document.activeElement` in that effect looks obvious and is wrong
   * whenever a child uses React's `autoFocus` prop: React applies that during the
   * commit, and passive effects run after the commit, so focus is *already inside
   * the dialog* by the time the effect looks. The captured "return here" element
   * was then the dialog's own first field, whose node is gone once the dialog
   * unmounts — `document.contains` rejected it, the restore silently did nothing,
   * and focus fell to `<body>`. Measured on /workspaces: opening "New workspace"
   * and pressing Escape left a keyboard user at the top of the document.
   *
   * A render happens before the commit that moves focus, so this reads the truth.
   * Skipping targets already inside the container is what keeps the trap's own
   * moves from overwriting the answer, and it gets nesting right: a dialog opened
   * over another dialog records the control it was opened from, so closing it
   * returns there rather than to the page behind both.
   */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  if (typeof document !== 'undefined') {
    const focusedNow = document.activeElement as HTMLElement | null;
    if (focusedNow && focusedNow !== document.body && !containerRef.current?.contains(focusedNow)) {
      returnFocusRef.current = focusedNow;
    }
  }

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const focusedOnEntry = document.activeElement as HTMLElement | null;
    const previouslyFocused =
      focusedOnEntry && focusedOnEntry !== document.body && !container.contains(focusedOnEntry)
        ? focusedOnEntry
        : returnFocusRef.current;

    const focusable = (): HTMLElement[] =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) =>
          // Opted out of the tab order. See the note on FOCUSABLE: the selector
          // cannot express this for natively-focusable elements.
          el.getAttribute('tabindex') !== '-1' &&
          // `offsetParent` is null for `display: none` but also for `position:
          // fixed`, so the client-rect check is what keeps a fixed-position
          // control inside the trap.
          (el.offsetParent !== null ||
            el.getClientRects().length > 0 ||
            getComputedStyle(el).position === 'fixed'),
      );

    if (autoFocus) {
      const items = focusable();
      const preferred = items.find((el) => el.hasAttribute('data-autofocus'));
      const first = preferred ?? items[0];
      if (first) {
        first.focus();
      } else {
        // Nothing focusable yet (content still loading). Make the container
        // itself the target so focus is at least inside the dialog rather than
        // left on the page behind it, where Tab would walk the whole document.
        container.setAttribute('tabindex', '-1');
        container.focus();
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) {
        // Nothing to cycle through — swallow Tab rather than let it escape into
        // the page behind an `aria-modal` surface.
        event.preventDefault();
        return;
      }

      const first = items[0]!;
      const last = items[items.length - 1]!;
      const activeEl = document.activeElement;

      // Focus outside the container at all (portalled child, or the container
      // itself holding the -1 fallback) means the next Tab should re-enter at
      // the appropriate end rather than continue through the document.
      if (!activeEl || !container.contains(activeEl)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (event.shiftKey && activeEl === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture phase so the trap sees Tab before a child's own key handler can
    // stop propagation and quietly punch a hole in it.
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      if (restoreFocus && previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [active, autoFocus, restoreFocus]);

  return containerRef;
}
