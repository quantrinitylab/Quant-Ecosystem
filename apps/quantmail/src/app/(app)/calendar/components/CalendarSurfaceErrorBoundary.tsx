'use client';

/**
 * fix/qm-calendar-firstload-error-boundary — scoped error boundary for the
 * calendar's main content surface (the Day/Week/Feed/Month/Trackers/Schedule
 * sub-views rendered by apps/quantmail/src/app/calendar/page.tsx).
 *
 * Why this exists: the only boundary between a render-time throw anywhere in
 * the /calendar tree and the user was the route-level error.tsx ("QuantMail
 * couldn't open this view"). A 2026-10-13 live audit tripped it exactly once
 * on first load — reload recovered, and the throwing component was never
 * identified (transient candidates: the once-per-session QuantumSplashIntro
 * in AppShell, or a next/dynamic chunk-load failure on the first navigation).
 * With no boundary in between, ANY such throw collapses the whole view.
 *
 * This boundary contains the blast radius: a throwing sub-view degrades to an
 * honest inline state that names the cause and offers a full-page reload,
 * while the header, tab strip and shell stay alive. First paint can therefore
 * never become a full-view crash again, no matter which child throws.
 *
 * UI rules: pure-black surface, no divider lines, calendar-blue
 * (var(--app-accent)) primary action. The fallback never invents data — it
 * reports the real error message (or says the cause is unknown) and the retry
 * performs a full-page reload, the same recovery that resolved the
 * 2026-10-13 incident.
 */

import React from 'react';

interface CalendarSurfaceErrorBoundaryProps {
  children: React.ReactNode;
  /** Human label used in the console trace, e.g. "calendar main view". */
  surfaceName?: string;
  /**
   * Injected for tests. Production default performs a full-page reload —
   * the honest recovery path (option scope: honest error + Reload; no
   * fake recovery, and no inline re-mount that could mask a persistent
   * first-load failure).
   */
  onReload?: () => void;
}

interface CalendarSurfaceErrorBoundaryState {
  error: Error | null;
}

export class CalendarSurfaceErrorBoundary extends React.Component<
  CalendarSurfaceErrorBoundaryProps,
  CalendarSurfaceErrorBoundaryState
> {
  state: CalendarSurfaceErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): CalendarSurfaceErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Debuggability: a contained render failure must still leave a trace.
    // eslint-disable-next-line no-console
    console.error(
      `[calendar:surface-boundary] "${
        this.props.surfaceName ?? 'calendar surface'
      }" render failed:`,
      error,
      info.componentStack,
    );
  }

  private readonly handleRetry = (): void => {
    // The retry is a full-page reload: the only honest recovery for a
    // first-load render crash. An inline re-mount would merely re-render the
    // same throwing subtree inside the same (possibly poisoned) session
    // state; reload resets the session the way the 2026-10-13 incident
    // recovered.
    (this.props.onReload ?? (() => window.location.reload()))();
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (error) {
      const cause =
        error.message && error.message.trim()
          ? `Rendering failed: ${error.message}`
          : 'Rendering failed with an unknown error.';
      return (
        <div
          role="alert"
          data-testid="calendar-surface-error"
          className="flex flex-col items-center justify-center bg-[var(--quant-background)] px-6 py-16 text-center"
        >
          <p className="text-base font-semibold text-[var(--quant-foreground)]">
            This part of the calendar didn&apos;t load
          </p>
          <p
            data-testid="calendar-surface-error-cause"
            className="mt-2 max-w-md text-sm text-[var(--quant-muted-foreground)]"
          >
            {cause}
          </p>
          <button
            type="button"
            data-testid="calendar-surface-error-retry"
            onClick={this.handleRetry}
            className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[var(--app-accent)] px-5 text-sm font-semibold text-black transition-colors hover:bg-[var(--app-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
