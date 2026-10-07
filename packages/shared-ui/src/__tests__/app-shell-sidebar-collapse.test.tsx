// @vitest-environment jsdom
// ============================================================================
// Shared UI — AppShell forced off-canvas drawer below the md breakpoint.
// Below md the sidebar must be an off-canvas drawer that can never be
// docked — even when the user previously pinned it on desktop. At md and
// above the pinned/overlay behaviour is unchanged.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppShell } from '../components/Layout/AppShell';
import { Sidebar } from '../components/Layout/Sidebar';
import type { SidebarItem } from '../components/Layout/Sidebar';

const PIN_KEY = 'quant.shell.sidebarPinned';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

function installMatchMedia() {
  // jsdom has no matchMedia; framer-motion (useReducedMotion) needs one.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  installMatchMedia();
  setViewportWidth(1280);
});

afterEach(() => {
  cleanup();
});

const sidebar = <nav aria-label="test-sidebar">nav items</nav>;

describe('AppShell forced drawer below md', () => {
  it('docks nothing and shows the hamburger below md, even when pinned', () => {
    setViewportWidth(390);
    window.localStorage.setItem(PIN_KEY, '1');

    render(
      <AppShell sidebar={sidebar}>
        <div>content</div>
      </AppShell>,
    );

    // No docked sidebar: the nav only exists inside the off-canvas panel.
    expect(screen.queryByLabelText('Sidebar')).toBeNull();
    expect(screen.getByLabelText('Show navigation')).toBeDefined();
    expect(screen.getByText('content')).toBeDefined();
  });

  it('restores the pinned docked sidebar at md and above', () => {
    setViewportWidth(1280);
    window.localStorage.setItem(PIN_KEY, '1');

    render(
      <AppShell sidebar={sidebar}>
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByLabelText('Sidebar')).toBeDefined();
    expect(screen.queryByLabelText('Show navigation')).toBeNull();
  });

  it('keeps the default overlay behaviour at desktop widths without a pin', () => {
    setViewportWidth(1280);

    render(
      <AppShell sidebar={sidebar}>
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByLabelText('Show navigation')).toBeDefined();
    expect(screen.queryByLabelText('Sidebar')).toBeNull();
  });

  it('opens the drawer from the hamburger and closes it after tapping a real Sidebar nav item', () => {
    setViewportWidth(390);
    const onFeed = vi.fn();
    const items: SidebarItem[] = [{ id: 'feed', label: 'Feed', href: '/', onClick: onFeed }];

    const { container } = render(
      <AppShell sidebar={<Sidebar items={items} />}>
        <div>content</div>
      </AppShell>,
    );

    const panel = container.querySelector('.quant-shell-panel');
    expect(panel?.classList.contains('is-open')).toBe(false);

    fireEvent.click(screen.getByLabelText('Show navigation'));
    expect(panel?.classList.contains('is-open')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Feed' }));
    expect(onFeed).toHaveBeenCalledTimes(1);
    expect(panel?.classList.contains('is-open')).toBe(false);
  });
});
