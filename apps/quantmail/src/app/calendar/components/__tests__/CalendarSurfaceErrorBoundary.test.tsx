// @vitest-environment jsdom
// ============================================================================
// fix/qm-calendar-firstload-error-boundary — regression tests.
//
// A 2026-10-13 live audit tripped the route-level error.tsx ("QuantMail
// couldn't open this view") exactly once on a /calendar first load; reload
// recovered and the throwing component was never identified. Before this fix
// there was no boundary between the calendar sub-views and the route error
// screen, so ANY render-time throw collapsed the whole view.
//
// These tests pin the new guarantee: a throwing sub-view degrades to an
// honest inline state that names the cause and offers a working retry —
// first paint can never be a full-view crash again. Real components, real
// error boundaries, observable behaviour only.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CalendarSurfaceErrorBoundary } from '../CalendarSurfaceErrorBoundary';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function Boom({ message = 'simulated first-paint render failure' }: { message?: string }) {
  throw new Error(message);
}

describe('CalendarSurfaceErrorBoundary', () => {
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
    // React logs the caught error via console.error; the boundary also logs
    // its own trace. Silence the noise, keep the spy for assertions.
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container as HTMLDivElement);
      root.render(ui);
    });
    return container as HTMLDivElement;
  }

  it('renders children untouched when nothing throws', () => {
    const el = render(
      <CalendarSurfaceErrorBoundary surfaceName="test surface">
        <div data-testid="day-content">Day view content</div>
      </CalendarSurfaceErrorBoundary>,
    );
    expect(el.querySelector('[data-testid="day-content"]')?.textContent).toBe(
      'Day view content',
    );
    expect(el.querySelector('[data-testid="calendar-surface-error"]')).toBeNull();
  });

  it('a first-paint render throw degrades to an honest inline state naming the cause — never the full-view crash screen', () => {
    const el = render(
      <CalendarSurfaceErrorBoundary surfaceName="calendar main view">
        <Boom />
      </CalendarSurfaceErrorBoundary>,
    );
    const fallback = el.querySelector('[data-testid="calendar-surface-error"]');
    expect(fallback).not.toBeNull();
    expect(fallback?.getAttribute('role')).toBe('alert');
    // The cause is named honestly — the real error message, not a generic line.
    expect(el.querySelector('[data-testid="calendar-surface-error-cause"]')?.textContent).toContain(
      'simulated first-paint render failure',
    );
    // And it is NOT the route-level crash screen.
    expect(el.textContent).not.toContain("couldn't open this view");
  });

  it('an empty error message degrades to an honest "unknown error" line, never a blank cause', () => {
    const el = render(
      <CalendarSurfaceErrorBoundary>
        <Boom message="   " />
      </CalendarSurfaceErrorBoundary>,
    );
    expect(
      el.querySelector('[data-testid="calendar-surface-error-cause"]')?.textContent,
    ).toContain('unknown error');
  });

  it('the boundary leaves a console trace naming the surface for debuggability', () => {
    render(
      <CalendarSurfaceErrorBoundary surfaceName="calendar main view">
        <Boom />
      </CalendarSurfaceErrorBoundary>,
    );
    const logged = (consoleSpy?.mock.calls ?? [])
      .map((c) => String(c[0]))
      .join('\n');
    expect(logged).toContain('calendar main view');
  });

  it('"Try again" performs a full-page reload — the honest recovery, not an inline re-mount', () => {
    const reload = vi.fn();
    const el = render(
      <CalendarSurfaceErrorBoundary onReload={reload}>
        <Boom message="persistent failure" />
      </CalendarSurfaceErrorBoundary>,
    );
    expect(el.querySelector('[data-testid="calendar-surface-error"]')).not.toBeNull();

    const retry = el.querySelector(
      '[data-testid="calendar-surface-error-retry"]',
    ) as HTMLButtonElement | null;
    expect(retry).not.toBeNull();
    act(() => {
      retry?.click();
    });
    expect(reload).toHaveBeenCalledTimes(1);
    // The inline fallback stays up until the reload happens — it never
    // claims to have recovered, and it never propagates to the full-view crash.
    expect(el.querySelector('[data-testid="calendar-surface-error"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="calendar-surface-error-cause"]')?.textContent).toContain(
      'persistent failure',
    );
    expect(el.textContent).not.toContain("couldn't open this view");
  });

});
