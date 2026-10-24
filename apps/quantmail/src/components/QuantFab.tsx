'use client';

import { useShellChrome } from './ShellChromeContext';
import { useChromeVisible } from './useScrollChrome';

/**
 * The one mobile create button.
 *
 * History: there were two of these. `AppShell` shipped a 48px flat-orange
 * circle whose glyph changed per route, and `calendar/page.tsx` once shipped
 * a 56px gradient circle that opened a labelled column of four. Same corner,
 * same z-index, two different sizes, two different finishes, and a
 * route-prefix suppression list in the shell to stop them stacking. The
 * calendar copy is gone (no second `QuantFab` mount exists on origin/main),
 * so the finish, the geometry and the offset above `MobileBottomNav` live
 * here, once, and the glyph is always `+`.
 *
 * Single action, direct tap — by design, not by omission (2026-10-24):
 * `AppShell`'s fab table returns at most one action on every route (empty
 * on `/calendar`, `/compose`, `/thread`, `/quantgit` and settings screens;
 * exactly one elsewhere), and no other caller exists. The multi-action dial
 * branch this file used to carry (menu-role rows, arrow-key nav,
 * Escape/outside-press close, focus restore) therefore had zero callers:
 * dial mode needed `actions.length > 1`, which nothing ever passed, so it
 * shipped unexercised. It was deleted rather than left as dead code, along
 * with the dial-only `icon`/`tone` action fields. A mail app that made
 * Compose two taps to look symmetrical with a calendar dial would be
 * trading the most frequent action in the product for tidiness.
 *
 * If a real multi-action caller ever arrives, it must bring the dial back
 * WITH a test that renders it open (see `QuantFabDialRemoved.test.tsx`,
 * which pins that no dial markup exists today) — never re-add the branch
 * on the strength of a comment alone. That is exactly how the dead branch
 * survived: a stale AppShell comment kept claiming `/calendar` mounted its
 * own four-entry `QuantFab` long after that mount was gone.
 *
 * What a tap *means* is carried by the accessible name, not by a shape the
 * thumb has to identify at speed.
 */

export interface FabAction {
  /** Stable key. */
  id: string;
  /** Row text, and the trigger's accessible name. */
  label: string;
  onSelect: () => void;
}

export interface QuantFabProps {
  /** Empty renders nothing — that is how a route opts out. */
  actions: FabAction[];
  /**
   * Fallback trigger name when the single action has no label. Kept for
   * call-site compatibility; `AppShell` always passes a labelled action.
   */
  label?: string;
}

export function QuantFab({ actions, label = 'Create' }: QuantFabProps) {
  const { isDrawerPresented } = useShellChrome();
  const chromeVisible = useChromeVisible();

  /*
   * Two ways out, and both belong here rather than at the call sites. Empty
   * actions is how a route opts out. A presented drawer is modal: the FAB
   * must not stay hittable over the backdrop.
   */
  if (actions.length === 0 || isDrawerPresented) return null;

  return (
    <div
      // Marker for the toast stack (globals.css): while a FAB owns the
      // bottom-right corner, toasts keep out of it.
      data-quant-fab=""
      aria-hidden={!chromeVisible}
      // QM-A11Y-CHROME-HIDDEN-INERT (2026-10-19): a scroll-hidden trigger that
      // stays in the tab order is a focus trap for screen-reader users —
      // TalkBack/VoiceOver can land on an invisible control. `inert` pulls the
      // whole subtree out of the tab order and the accessibility tree while
      // the chrome is collapsed. Mirrors the drawer + mobile search row
      // pattern in AppShell (`inert={!isDrawerPresented}`).
      inert={!chromeVisible}
      // Sits above the bottom bar when the chrome is visible; drops to the
      // screen edge when the bar collapses (the bar is in-flow now, so the
      // offset follows the same visibility bit — no gap, no overlap).
      className={`fixed right-4 z-40 flex flex-col items-end gap-2.5 md:hidden ${
        chromeVisible
          ? 'bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+0.75rem)]'
          : 'bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]'
      }`}
      style={{
        // Scroll-hide: slide down + shrink + fade, spring back on reveal.
        // GPU-composited (transform/opacity only). pointer-events off while
        // hidden so it can never swallow a tap meant for content.
        transform: chromeVisible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.85)',
        opacity: chromeVisible ? 1 : 0,
        pointerEvents: chromeVisible ? 'auto' : 'none',
        transition: 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.25s ease-out',
      }}
    >
      <button
        type="button"
        onClick={() => actions[0]?.onSelect()}
        style={{
          background: 'linear-gradient(135deg, var(--app-accent-hover) 0%, var(--app-accent) 55%, var(--app-accent-pressed) 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
        className="flex size-14 items-center justify-center rounded-full font-black text-[#111111] transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-background)]"
        aria-label={actions[0]?.label ?? label}
      >
        <svg
          className="size-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
