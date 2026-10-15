// @vitest-environment jsdom
// ============================================================================
// fix/qm-calendar-firstload-error-boundary — regression tests.
//
// AuxSurfaceBoundary guards auxiliary/decorative shell surfaces that sit on
// the first paint of every AppShell route (the once-per-session
// QuantumSplashIntro and the next/dynamic QuantyLiveAgent). A render failure
// in either used to propagate to the route-level error.tsx and collapse the
// whole view — the exact shape of the 2026-10-13 /calendar first-load crash
// (observed once, reload recovered).
//
// Contract pinned here: children render normally when healthy; on a render
// failure the surface vanishes (honest absence — no invented fallback) while
// the rest of the view survives, and the real error is logged with the
// surface name for debuggability.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AuxSurfaceBoundary } from '../AuxSurfaceBoundary';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function Boom() {
  throw new Error('aux surface render failure');
}

describe('AuxSurfaceBoundary', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  let consoleSpy: ReturnType<typeof vi.spyOn> | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    consoleSpy?.mockRestore();
    consoleSpy = null;
  });

  function render(ui: React.ReactNode): HTMLDivElement {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container as HTMLDivElement);
      root.render(ui);
    });
    return container as HTMLDivElement;
  }

  it('renders children normally when nothing throws', () => {
    const el = render(
      <AuxSurfaceBoundary name="quantum-splash-intro">
        <div data-testid="splash">splash content</div>
      </AuxSurfaceBoundary>,
    );
    expect(el.querySelector('[data-testid="splash"]')?.textContent).toBe('splash content');
  });

  it('a render failure vanishes the auxiliary surface while the rest of the view survives', () => {
    const el = render(
      <div>
        <div data-testid="sibling">sibling content survives</div>
        <AuxSurfaceBoundary name="quantum-splash-intro">
          <Boom />
        </AuxSurfaceBoundary>
      </div>,
    );
    // The failed auxiliary surface renders nothing…
    expect(el.querySelector('[data-testid="sibling"]')?.textContent).toBe(
      'sibling content survives',
    );
    expect(el.textContent).not.toContain('aux surface render failure');
    // …and no error propagates past the boundary (the test itself would fail
    // if the throw escaped createRoot/act).
  });

  it('logs the real error with the surface name for debuggability', () => {
    render(
      <AuxSurfaceBoundary name="quanty-live-agent">
        <Boom />
      </AuxSurfaceBoundary>,
    );
    const logged = (consoleSpy?.mock.calls ?? [])
      .map((c) => String(c[0]))
      .join('\n');
    expect(logged).toContain('quanty-live-agent');
  });
});
