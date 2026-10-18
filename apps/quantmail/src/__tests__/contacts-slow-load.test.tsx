// @vitest-environment jsdom
// ============================================================================
// contacts-slow-load — QM 2026-10-15 P1 (mobile /contacts): on a slow cold
// load the list sat on skeleton placeholders indefinitely ("2 big dashed
// cards" at t8, content never arriving). Past 10s of continuous loading the
// page now swaps skeletons for an honest notice with Retry.
//
// Asserts, with the REAL hook and the REAL component:
//  - the notice trips only after the full threshold of CONTINUOUS loading;
//  - it resets the moment loading resolves (no stuck notice);
//  - the timer restarts on a fresh loading spell;
//  - the notice copy is honest (no contact counts, no fake data) and the
//    Retry button actually calls onRetry.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSlowLoadNotice } from '../lib/use-slow-load';
import { ContactsSlowLoadNotice } from '../app/(app)/contacts/components/ContactsSlowLoadNotice';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SLOW_MS = 10_000;

function Harness({ loading, timeoutMs }: { loading: boolean; timeoutMs?: number }) {
  const slow = useSlowLoadNotice(loading, timeoutMs);
  return <div data-testid="slow">{slow ? 'slow' : 'fast'}</div>;
}

function readSlow(container: HTMLElement): boolean {
  const el = container.querySelector('[data-testid="slow"]');
  if (!el) throw new Error('harness output missing');
  return el.textContent === 'slow';
}

describe('useSlowLoadNotice', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('stays false before the threshold, trips after continuous loading', () => {
    act(() => {
      root.render(<Harness loading={true} timeoutMs={SLOW_MS} />);
    });
    expect(readSlow(container)).toBe(false);

    act(() => {
      vi.advanceTimersByTime(SLOW_MS - 1);
    });
    expect(readSlow(container)).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(readSlow(container)).toBe(true);
  });

  it('never trips when loading resolves before the threshold', () => {
    act(() => {
      root.render(<Harness loading={true} timeoutMs={SLOW_MS} />);
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    // Data arrives: loading flips false, timer cleared.
    act(() => {
      root.render(<Harness loading={false} timeoutMs={SLOW_MS} />);
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(readSlow(container)).toBe(false);
  });

  it('resets when loading resolves after tripping', () => {
    act(() => {
      root.render(<Harness loading={true} timeoutMs={SLOW_MS} />);
    });
    act(() => {
      vi.advanceTimersByTime(SLOW_MS);
    });
    expect(readSlow(container)).toBe(true);

    act(() => {
      root.render(<Harness loading={false} timeoutMs={SLOW_MS} />);
    });
    expect(readSlow(container)).toBe(false);
  });

  it('restarts the timer on a fresh loading spell', () => {
    act(() => {
      root.render(<Harness loading={true} timeoutMs={SLOW_MS} />);
    });
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(readSlow(container)).toBe(false);

    // Brief resolve then a new loading spell: the clock restarts.
    act(() => {
      root.render(<Harness loading={false} timeoutMs={SLOW_MS} />);
    });
    act(() => {
      root.render(<Harness loading={true} timeoutMs={SLOW_MS} />);
    });
    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(readSlow(container)).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(readSlow(container)).toBe(true);
  });

  it('uses the 10s product default', () => {
    act(() => {
      root.render(<Harness loading={true} />);
    });
    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(readSlow(container)).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(readSlow(container)).toBe(true);
  });
});

describe('ContactsSlowLoadNotice', () => {
  it('renders honest copy with no invented contact data', () => {
    const html = renderToStaticMarkup(<ContactsSlowLoadNotice onRetry={() => undefined} />);
    expect(html).toContain('Taking longer than usual');
    expect(html).toContain('still loading');
    expect(html).toContain('Retry');
    // Honesty: never claims a count, a total, or that anything loaded.
    expect(html).not.toMatch(/\d+ contacts/);
    expect(html).not.toContain('No contacts found');
  });

  it('exposes role=status for assistive tech', () => {
    const html = renderToStaticMarkup(<ContactsSlowLoadNotice onRetry={() => undefined} />);
    expect(html).toContain('role="status"');
  });

  it('Retry invokes onRetry', () => {
    const onRetry = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => {
        root.render(<ContactsSlowLoadNotice onRetry={onRetry} />);
      });
      const button = container.querySelector('button');
      if (!button) throw new Error('retry button missing');
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(onRetry).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
