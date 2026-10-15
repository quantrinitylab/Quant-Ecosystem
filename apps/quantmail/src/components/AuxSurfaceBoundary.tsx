'use client';

/**
 * fix/qm-calendar-firstload-error-boundary — quiet error boundary for
 * auxiliary/decorative shell surfaces that must NEVER take down the view.
 *
 * Two such surfaces render on the first paint of every AppShell route:
 * - QuantumSplashIntro: renders once per session (sessionStorage gate), so a
 *   throw inside it can only ever happen on first load — exactly the shape of
 *   the 2026-10-13 /calendar first-load crash (reload skips the splash and
 *   "recovers").
 * - QuantyLiveAgent: loaded via next/dynamic({ ssr: false }) with no error
 *   containment, so a chunk-load failure on the first navigation throws
 *   during render and the route-level error.tsx turns it into a full-view
 *   "couldn't open this view" screen.
 *
 * On a render failure this boundary logs the real error (debuggability) and
 * renders nothing — the primary surface stays fully usable. It never invents
 * fallback content for an auxiliary surface; absence is the honest state.
 */

import React from 'react';

interface AuxSurfaceBoundaryProps {
  children: React.ReactNode;
  /** Short label for the console trace, e.g. "quantum-splash-intro". */
  name: string;
}

interface AuxSurfaceBoundaryState {
  failed: boolean;
}

export class AuxSurfaceBoundary extends React.Component<
  AuxSurfaceBoundaryProps,
  AuxSurfaceBoundaryState
> {
  state: AuxSurfaceBoundaryState = { failed: false };

  static getDerivedStateFromError(): AuxSurfaceBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(
      `[aux-surface:${this.props.name}] suppressed render failure:`,
      error,
      info.componentStack,
    );
  }

  render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}
