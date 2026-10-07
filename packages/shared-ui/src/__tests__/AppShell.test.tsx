// @vitest-environment jsdom
// ============================================================================
// Shared UI - AppShell Mobile Drawer Tests
//
// Regression tests for the QuantAds P0-3 fix: below the md breakpoint the
// sidebar must always be an off-canvas drawer, even when the user pinned it
// docked on a desktop session (the pin persists in localStorage and would
// otherwise dock a fixed-width column on a 390px phone, clipping content).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { AppShell } from '../components/Layout/AppShell';

const PIN_KEY = 'quant.shell.sidebarPinned';

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event('resize'));
}

function renderShell() {
  return render(
    <AppShell sidebar={<div data-testid="sidebar-content">Nav items</div>}>
      <div data-testid="main-content">Main</div>
    </AppShell>,
  );
}

describe('AppShell mobile drawer (below md breakpoint)', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    setViewportWidth(originalInnerWidth);
    window.localStorage.clear();
  });

  it('keeps the sidebar docked on desktop when pinned', async () => {
    setViewportWidth(1280);
    window.localStorage.setItem(PIN_KEY, '1');
    await act(async () => {
      renderShell();
    });
    // Docked sidebar renders as an <aside>; the drawer panel is absent.
    expect(screen.getByLabelText('Sidebar')).toBeDefined();
    expect(screen.queryByLabelText('Show navigation')).toBeNull();
  });

  it('forces drawer mode on a 390px phone even when pinned in a prior session', async () => {
    setViewportWidth(390);
    window.localStorage.setItem(PIN_KEY, '1');
    await act(async () => {
      renderShell();
    });
    // No docked aside; the hamburger trigger is present instead.
    expect(screen.queryByLabelText('Sidebar')).toBeNull();
    expect(screen.getByLabelText('Show navigation')).toBeDefined();
    expect(screen.getByTestId('main-content')).toBeDefined();
  });

  it('opens the drawer panel when the hamburger is tapped on mobile', async () => {
    setViewportWidth(390);
    await act(async () => {
      renderShell();
    });
    const trigger = screen.getByLabelText('Show navigation');
    await act(async () => {
      fireEvent.click(trigger);
    });
    // The overlay panel contains the sidebar content and a close button.
    expect(screen.getByLabelText('Close navigation')).toBeDefined();
    expect(screen.getByTestId('sidebar-content')).toBeDefined();
  });

  it('pinning on desktop does not leak docked mode back to a resized mobile viewport', async () => {
    setViewportWidth(1280);
    window.localStorage.setItem(PIN_KEY, '1');
    const view = await act(async () => renderShell());
    expect(screen.getByLabelText('Sidebar')).toBeDefined();
    view.unmount();
    // Resize to a phone with the pin still stored.
    setViewportWidth(390);
    await act(async () => {
      renderShell();
    });
    expect(screen.queryByLabelText('Sidebar')).toBeNull();
    expect(screen.getByLabelText('Show navigation')).toBeDefined();
  });
});
