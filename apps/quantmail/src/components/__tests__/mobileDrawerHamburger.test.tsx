// @vitest-environment jsdom
// ============================================================================
// Mobile navigation drawer — hamburger opener (mobile-inbox P1, 2026-10-11).
//
// Root cause: the drawer's only opener was the `quant:sidebar:toggle` event,
// dispatched solely by KeyboardProvider on the physical-keyboard `[` key.
// On phones there was no hamburger, no menu button, no swipe — the drawer
// (Compose, folders, Labels, Settings…) and the Labels page, which has no
// other mobile link, were unreachable on touch.
//
// The fix renders a real 44px hamburger button at the left of the pillar top
// bar's pinned search row (the row that never hides on scroll) when
// `onMenuClick` is wired, dispatching the same toggle event. AppShell attaches
// its `menuTriggerRef` to the button, which also resolves the queued P2 about
// the ref never being attached to a DOM node — focus now returns to the
// trigger on Escape / backdrop close instead of being stranded.
//
// These tests pin:
//   (1) the hamburger exists with an accessible name only when onMenuClick
//       is supplied (no dead button on standalone uses);
//   (2) it is a 44px touch target;
//   (3) menuTriggerRef is attached to the button's DOM node;
//   (4) tapping it calls the opener (AppShell's handler dispatches
//       quant:sidebar:toggle);
//   (5) aria-expanded tracks drawer open state;
//   (6) it precedes the search field in DOM order (first control in the bar);
//   (7) AppShell wires menuTriggerRef + onMenuClick (dispatching
//       quant:sidebar:toggle) into the pillar top bar;
//   (8) the drawer still carries inert + aria-hidden when not presented, so
//       the change introduces no new focus-stranding.
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React, { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

// Canvas-painted live marks and account chrome are irrelevant here — stub them.
vi.mock('../QuantMailLogo', () => ({ QuantMailLogo: () => null }));
vi.mock('../QuantCalendarLogo', () => ({ QuantCalendarLogo: () => null }));
vi.mock('../QuantDriveLogo', () => ({ QuantDriveLogo: () => null }));
vi.mock('../QuantContactsLogo', () => ({ QuantContactsLogo: () => null }));
vi.mock('../QuantGitLogo', () => ({ QuantGitLogo: () => null }));
vi.mock('../Quanty', () => ({ Quanty: () => null }));
vi.mock('../AccountBadge', () => ({ AccountBadge: () => null }));
vi.mock('../MoreAppsMenu', () => ({ MoreAppsMenu: () => null }));
vi.mock('../QuantGitUserIdModal', () => ({ QuantGitUserIdModal: () => null }));

import { QuantPillarTopBar } from '../QuantPillarTopBar';

const shellSrc = readFileSync(join(process.cwd(), 'src/components/AppShell.tsx'), 'utf8');

describe('mobile drawer hamburger', () => {
  it('renders a named hamburger button when the opener is wired', () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <QuantPillarTopBar
        onMenuClick={() => {}}
        menuTriggerRef={ref}
        menuExpanded={false}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('is a 44px minimum touch target', () => {
    const ref = createRef<HTMLButtonElement>();
    const { container } = render(
      <QuantPillarTopBar onMenuClick={() => {}} menuTriggerRef={ref} />,
    );
    const btn = screen.getByRole('button', { name: 'Open navigation menu' });
    const cls = btn.getAttribute('class') ?? '';
    // 44px floor, stated redundantly so a Tailwind `size-11` purge can never
    // silently shrink the hit target.
    expect(cls).toMatch(/min-h-\[44px\]/);
    expect(cls).toMatch(/min-w-\[44px\]/);
    expect(container.contains(btn)).toBe(true);
  });

  it('attaches menuTriggerRef to the button (drawer focus-return target)', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<QuantPillarTopBar onMenuClick={() => {}} menuTriggerRef={ref} />);
    const btn = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(ref.current).toBe(btn);
  });

  it('tapping it invokes the opener', () => {
    const onMenuClick = vi.fn();
    render(<QuantPillarTopBar onMenuClick={onMenuClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });

  it('aria-expanded follows the drawer state', () => {
    const { rerender } = render(<QuantPillarTopBar onMenuClick={() => {}} menuExpanded={false} />);
    expect(
      screen.getByRole('button', { name: 'Open navigation menu' }).getAttribute('aria-expanded'),
    ).toBe('false');
    rerender(<QuantPillarTopBar onMenuClick={() => {}} menuExpanded={true} />);
    expect(
      screen.getByRole('button', { name: 'Open navigation menu' }).getAttribute('aria-expanded'),
    ).toBe('true');
  });

  it('renders no hamburger when no opener is wired (no dead button)', () => {
    render(<QuantPillarTopBar />);
    expect(screen.queryByRole('button', { name: 'Open navigation menu' })).toBeNull();
  });

  it('precedes the search field in DOM order', () => {
    render(<QuantPillarTopBar onMenuClick={() => {}} />);
    const btn = screen.getByRole('button', { name: 'Open navigation menu' });
    const search = document.getElementById('quant-pillar-search-input');
    expect(search).not.toBeNull();
    // The button must come first in the document: screen readers and Tab meet
    // the drawer opener before the search field.
    expect(btn.compareDocumentPosition(search as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('AppShell drawer-opener wiring', () => {
  it('passes the opener, the trigger ref, and the open state to the top bar', () => {
    expect(shellSrc).toContain('menuTriggerRef={menuTriggerRef}');
    expect(shellSrc).toContain('menuExpanded={isSidebarOpen}');
    // The handler must dispatch the SAME event the drawer already listens for —
    // a second bespoke opener would fork the toggle logic (the isWide guard).
    expect(shellSrc).toMatch(/onMenuClick=\{\(\)\s*=>[\s\S]*?quant:sidebar:toggle/);
  });

  it('the drawer stays inert + aria-hidden while not presented (no focus-stranding)', () => {
    // The hamburger makes the drawer reachable; this pins that the drawer does
    // NOT become tabbable while hidden (the queued ContextBottomNavBar
    // aria-hidden concern is the same defect family).
    expect(shellSrc).toMatch(/aria-hidden=\{!isDrawerPresented\}/);
    expect(shellSrc).toMatch(/inert=\{!isDrawerPresented\}/);
  });

  it('drawer close returns focus to the trigger ref', () => {
    // closeSidebar is the single close path for Escape, backdrop, and nav-item
    // taps — focus must go back to the hamburger, not to <body>.
    expect(shellSrc).toMatch(/menuTriggerRef\.current\?\.focus\(\)/);
  });
});
