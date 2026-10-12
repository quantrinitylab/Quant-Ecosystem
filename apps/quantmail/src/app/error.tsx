'use client';

// ============================================================================
// Root error boundary — zero-JS animations.
//
// Perf (P0 perf-load, queue 2026-10-12): this boundary is bundled with every
// route. It used to import { motion, useReducedMotion } from 'framer-motion'
// directly — a whole extra copy of the ~114KB runtime in the route-independent
// payload — for a gentle enter animation and a hover/tap press scale on the
// "Try again" button. The shared-ui <Button> ALSO pulled framer-motion in
// (useReducedMotion for its loading spinner), so the button below is a plain
// <button> carrying the exact shared-Button primary/md class list — same
// pixels, zero animation runtime.
//
// Both animations are pure CSS (@keyframes qm-error-enter +
// .qm-error-press:hover/:active), compositor-only, and disabled under
// prefers-reduced-motion — the exact behavior useReducedMotion provided.
// Do NOT re-introduce framer-motion here, directly or transitively.
// ============================================================================

// Scoped to this file via the <style> element below, so the sibling
// framer-motion-removal PRs (#984 auth shell, #993 layout/OfflineBar/InboxToast)
// never collide on globals.css: this boundary owns its own animation CSS.
//
// spring.gentle { stiffness: 100, damping: 20, mass: 1 } (@quant/brand) is
// critically damped — no overshoot, ~0.5s settle — so the enter animation is
// 500ms with the brand ease-out curve. The press scale mirrors the old
// motion.div whileHover={{ scale: 1.02 }} / whileTap={{ scale: 0.98 }} pair
// (spring.snappy): hover 1.02 / active 0.98 over 180ms.
const ERROR_ANIMATION_CSS = `
@keyframes qm-error-enter {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1); }
}
.qm-error-enter {
  animation: qm-error-enter 500ms cubic-bezier(0.0, 0.0, 0.2, 1.0);
}
.qm-error-press {
  transition: transform 0.18s ease-out;
}
.qm-error-press:hover {
  transform: scale(1.02);
}
.qm-error-press:active {
  transform: scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  .qm-error-enter {
    animation: none;
  }
  .qm-error-press {
    transition: none;
  }
  .qm-error-press:hover,
  .qm-error-press:active {
    transform: none;
  }
}
`;

// The exact class list shared-ui <Button> renders for variant="primary"
// size="md" (its baseStyles + primary + md + touch floor), inlined so this
// boundary stays framer-motion-free. The button's own `active:scale-[0.98]`
// was never gated by reduced-motion in the original either (the shared
// Button's useReducedMotion only gated its loading spinner), so it stays
// ungated here — faithful to the shipped behavior.
const TRY_AGAIN_BUTTON_CLASS =
  'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]/50 ' +
  'focus-visible:ring-offset-1 focus-visible:ring-offset-[#090A0C] active:scale-[0.98] select-none ' +
  'bg-[#FF8C42] text-[#111111] font-semibold hover:bg-[#FF9B5A] active:bg-[#E8752F] shadow-sm ' +
  'h-9 px-3.5 text-sm gap-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      id="main-content"
      tabIndex={-1}
      className="flex h-screen flex-col items-center justify-center p-6 text-center"
      role="alert"
      aria-labelledby="global-error-title"
      aria-describedby="global-error-description"
    >
      <style>{ERROR_ANIMATION_CSS}</style>
      <div className="qm-error-enter flex flex-col items-center">
        {/* Was a 5xl `&#x26A0;` text glyph, which rendered in whatever emoji font
            the OS happened to supply — colour, weight and baseline all outside our
            control, and off-palette on Windows. */}
        <svg
          viewBox="0 0 24 24"
          className="mb-4 size-12 text-[var(--quant-destructive)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9.4v4.2M12 17.1h.01" />
        </svg>
        <h1
          id="global-error-title"
          className="mb-2 text-xl font-semibold text-[var(--quant-foreground)]"
        >
          QuantMail couldn&apos;t open this view
        </h1>
        <p
          id="global-error-description"
          className="mb-6 max-w-md text-[var(--quant-muted-foreground)]"
        >
          We couldn&apos;t finish loading this view. Try again. If the problem continues, report it
          with the reference below when available.
        </p>
        {error.digest ? (
          <p className="mb-4 font-mono text-xs text-[var(--quant-muted-foreground)]">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <div className="qm-error-press">
            <button type="button" onClick={reset} className={TRY_AGAIN_BUTTON_CLASS}>
              Try again
            </button>
          </div>
          <a
            href="/"
            className="inline-flex min-h-touch items-center gap-1 rounded-lg border border-[var(--quant-border)] px-4 py-2 text-sm font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] motion-reduce:transition-none"
          >
            Go to Inbox
          </a>
        </div>
        <p className="mt-6 text-xs text-[var(--quant-muted-foreground)]">
          If this keeps happening,{' '}
          <a
            href="mailto:support@quantrinity.in"
            className="text-[var(--brand-primary)] hover:underline"
          >
            contact support
          </a>
        </p>
      </div>
    </div>
  );
}
