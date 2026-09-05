// @vitest-environment jsdom
// ============================================================================
// Shared UI - OfflineIndicator Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { OfflineIndicator } from '../components/Shell/OfflineIndicator';

// AnimatePresence has to stay a passthrough for `{cond && child}` to behave, and
// motion.div has to drop the animation props before they reach the DOM.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }: any) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const OFFLINE_TEXT = 'You are offline. Changes will be synced when connection is restored.';
const BACK_TEXT = 'Back online. Your changes have been synced.';

function setOnLine(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

function goOffline() {
  setOnLine(false);
  fireEvent(window, new Event('offline'));
}

function goOnline() {
  setOnLine(true);
  fireEvent(window, new Event('online'));
}

describe('OfflineIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setOnLine(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The defect this file exists for: `role="status"` sat on the banner, one line
  // below `if (status === 'online') return null`, so the region was created at the
  // same instant it first had text — the case screen readers most often miss — and
  // it stopped existing the moment the connection came back, so the recovery was
  // announced by nothing at all.
  it('keeps the live region mounted and quiet while online', () => {
    render(<OfflineIndicator />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.textContent).toBe('');
  });

  it('announces going offline into the region that was already there', () => {
    render(<OfflineIndicator />);
    const region = screen.getByRole('status');

    goOffline();

    // Same node, new text: that identity IS the fix.
    expect(screen.getByRole('status')).toBe(region);
    expect(region.textContent).toContain(OFFLINE_TEXT);
  });

  it('announces coming back, which used to have no words at all', () => {
    vi.useFakeTimers();
    render(<OfflineIndicator />);
    const region = screen.getByRole('status');

    goOffline();
    goOnline();
    expect(region.textContent).toContain('Syncing changes...');

    // The 2s fallback the component uses when `isSyncing` is not supplied.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(region.textContent).toContain(BACK_TEXT);
  });

  it('reports nothing on a load that was online the whole time', () => {
    render(<OfflineIndicator />);
    expect(screen.queryByText(BACK_TEXT)).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  // `navigator.onLine` used to be read in the state initializer, which is a
  // hydration mismatch on a component that also renders on the server — and it put
  // the region's first text in place at mount, where it goes unannounced.
  it('picks up a browser that is already offline, from an effect', () => {
    setOnLine(false);
    render(<OfflineIndicator />);
    expect(screen.getByRole('status').textContent).toContain(OFFLINE_TEXT);
  });

  it('tells the consumer about every transition', () => {
    vi.useFakeTimers();
    const onStatusChange = vi.fn();
    render(<OfflineIndicator onStatusChange={onStatusChange} />);

    goOffline();
    expect(onStatusChange).toHaveBeenCalledWith('offline');

    goOnline();
    expect(onStatusChange).toHaveBeenCalledWith('syncing');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onStatusChange).toHaveBeenCalledWith('online');
  });

  it('lets an external isSyncing own the syncing state', () => {
    const { rerender } = render(<OfflineIndicator isSyncing syncMessage="Catching up…" />);
    expect(screen.getByRole('status').textContent).toContain('Catching up…');

    rerender(<OfflineIndicator isSyncing={false} syncMessage="Catching up…" />);
    expect(screen.getByRole('status').textContent).not.toContain('Catching up…');
  });

  // The wrapper is fixed and full-width now that it outlives the banner, so it has
  // to be transparent to the pointer — including while a ghost bar is animating out.
  it('does not eat clicks at the top of the page', () => {
    render(<OfflineIndicator />);
    expect(screen.getByRole('status').className).toContain('pointer-events-none');
  });

  it('paints nothing while online', () => {
    const { container } = render(<OfflineIndicator />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('hides the decorative icon from the accessible tree', () => {
    const { container } = render(<OfflineIndicator />);
    goOffline();
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });
});
