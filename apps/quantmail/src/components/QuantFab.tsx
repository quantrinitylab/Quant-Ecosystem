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
 * Single action, direct tap — by type, not by convention (2026-10-25):
 * `AppShell`'s fab table returns at most one action on every route (null
 * on `/calendar`, `/compose`, `/thread`, `/quantgit` and settings screens;
 * exactly one elsewhere), and no other caller exists. The multi-action dial
 * branch this file used to carry (menu-role rows, arrow-key nav,
 * Escape/outside-press close, focus restore) therefore had zero callers:
 * dial mode needed more than one action, which nothing ever passed, so it
 * shipped unexercised. It was deleted on 2026-10-24 rather than left as
 * dead code, along with the dial-only `icon`/`tone` action fields.
 *
 * The 2026-10-24 deletion left a contract hole, closed here: the prop was
 * still an array of actions, so a caller could pass two actions while
 * the button fired only the first — a silently dropped second action, with
 * a test pinning that drop as if it were intended behaviour. An array prop
 * on a single button is a lie about what the button does. So the prop is
 * now a single action, `action: FabAction | null`: more than one action
 * is unrepresentable, not merely unrendered. `null` is how a route opts
 * out. There is no `label` fallback prop either: the action's own label
 * is the trigger's accessible name, and `AppShell` always supplies one.
 * A mail app that made Compose two taps to look symmetrical with a
 * calendar dial would be trading the most frequent action in the product
 * for tidiness.
 *
 * If a real multi-action caller ever arrives, it must bring the dial back
 * WITH a test that renders it open — never re-add the branch on the
 * strength of a comment alone. That is exactly how the dead branch
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
  /**
   * The single action this button fires, or `null` to render nothing
   * (how a route opts out). Deliberately NOT an array: a second action
   * has nowhere to go on a direct-tap button, so it must not be passable.
   */
  action: FabAction | null;
}

export function QuantFab(props: QuantFabProps) {
  const { isDrawerPresented } = useShellChrome();
  const chromeVisible = useChromeVisible();

  /*
   * Migration guard, not a feature: the pre-2026-10-25 prop was an array
   * of actions. A stale caller passing that shape (or an array
   * as `action` through plain JS) must fail loudly here, never render a
   * button that quietly ignores everything past the first action. The
   * TypeScript type already rejects both shapes; this is the runtime
   * backstop for untyped callers.
   */
  const legacy = (props as unknown as { actions?: unknown }).actions;
  if (legacy !== undefined || Array.isArray(props.action)) {
    throw new Error(
      'QuantFab takes a single `action` (or null) — it no longer accepts an `actions` array. ' +
        'A second action cannot be honoured by a direct-tap button; bring the dial back with a test if a multi-action caller ever arrives.',
    );
  }
  const { action } = props;

  /*
   * Two ways out, and both belong here rather than at the call sites. Null
   * action is how a route opts out. A presented drawer is modal: the FAB
   * must not stay hittable over the backdrop.
   */
  if (action === null || isDrawerPresented) return null;

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
        onClick={() => action.onSelect()}
        style={{
          background: 'linear-gradient(135deg, var(--app-accent-hover) 0%, var(--app-accent) 55%, var(--app-accent-pressed) 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.18)',
        }}
        className="flex size-14 items-center justify-center rounded-full font-black text-[#111111] transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-background)]"
        aria-label={action.label}
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
