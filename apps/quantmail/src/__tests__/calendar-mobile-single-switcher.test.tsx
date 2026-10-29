// @vitest-environment node
/**
 * fix/qm-calendar-switcher-dup — ONE view switcher per viewport on calendar.
 *
 * Findings-queue 2026-10-12 [P2] [mobile-nav]: the calendar page rendered
 * its own md:hidden pill strip (Feed, Month, Week, Trackers, Schedule) AND
 * the shell bottom bar showed Day/Week/Month — Week and Month appeared
 * twice doing the same ?tab= navigation, and the two sets disagreed.
 *
 * The fix: the page strip is deleted; the shell bottom bar
 * (ContextBottomNavBar, md:hidden) is the single mobile view switcher, so
 * its calendar tabs are ALL primary slots (Feed/Trackers/Schedule promoted
 * out of mobileOverflow — an overflow slot only appears while already
 * active, so it could never be the way INTO those views). Desktop keeps
 * its single CalendarContextSubTabs row (hidden md:flex).
 *
 * Guards here:
 *  1. The bottom bar on /calendar renders all six views at once (behavioral
 *     — no second strip needed to reach any view).
 *  2. The calendar page no longer references the deleted strip component,
 *     but still renders the desktop tab row.
 *  3. The strip component file is gone (no dead code left behind).
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AppShell } from '../components/AppShell';
import { PILLAR_SUB_CONFIGS } from '../components/ContextBottomNavBar';

vi.mock('../components/DesktopContextSidebar', () => ({
  DesktopContextSidebar: () => <div data-testid="desktop-context-sidebar-mock" />,
}));

class MockWindow {
  listeners: Record<string, Function[]> = {};
  addEventListener(type: string, callback: Function) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(callback);
  }
  removeEventListener(type: string, callback: Function) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((cb) => cb !== callback);
    }
  }
  dispatchEvent(event: any) {
    const list = this.listeners[event.type] || [];
    for (const cb of list) cb(event);
    return true;
  }
}
(globalThis as any).window = new MockWindow() as any;

const mockPush = vi.fn();
let mockCurrentPathname = '/calendar';
let mockCurrentSearchParams = new URLSearchParams('tab=feed');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockCurrentPathname,
  useSearchParams: () => mockCurrentSearchParams,
}));

vi.mock('../hooks/useInbox', () => ({
  useInbox: () => ({ data: [], refetch: vi.fn() }),
}));

vi.mock('../hooks/useNewMailDesktopAlerts', () => ({
  useNewMailDesktopAlerts: () => {},
}));

vi.mock('@quant/shared-ui', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => (
    <div className="page-transition">{children}</div>
  ),
  useFocusTrap: () => ({ current: null }),
  BubbleAvatar: () => <div className="bubble-avatar" />,
}));

const CALENDAR_PAGE_SRC = fs.readFileSync(
  path.resolve(__dirname, '../app/calendar/page.tsx'),
  'utf8',
);

describe('fix/qm-calendar-switcher-dup — one mobile view switcher', () => {
  it('the shell bottom bar on /calendar shows all six views at once', () => {
    const html = renderToStaticMarkup(
      <AppShell sidebar={<div id="sidebar-test">Sidebar</div>}>
        <div>Calendar Content</div>
      </AppShell>,
    );

    expect(html).toContain('Calendar contextual navigation');
    for (const label of ['Day', 'Week', 'Month', 'Feed', 'Trackers', 'Schedule']) {
      expect(html, `bottom bar must show ${label}`).toContain(`>${label}<`);
    }
    // Exactly one bottom bar — no second mobile switcher in the shell.
    expect(html.match(/contextual navigation/g)?.length).toBe(1);
  });

  it('calendar bottom-bar config has six primary slots, none overflow', () => {
    const tabs = PILLAR_SUB_CONFIGS.calendar.tabs;
    expect(tabs.map((t) => t.id)).toEqual([
      'day',
      'week',
      'month',
      'feed',
      'events',
      'schedule',
    ]);
    for (const tab of tabs) {
      expect(tab.mobileOverflow, `${tab.id} must be always visible`).toBeFalsy();
      expect(tab.targetPath).toBe('/calendar');
      expect(tab.queryParam?.key).toBe('tab');
    }
  });

  it('the calendar page renders no mobile strip, but keeps the desktop tab row', () => {
    expect(CALENDAR_PAGE_SRC).not.toContain('CalendarMobileTabStrip');
    expect(CALENDAR_PAGE_SRC).toContain('<CalendarContextSubTabs');
  });

  it('the deleted mobile strip component file is gone', () => {
    expect(
      fs.existsSync(
        path.resolve(__dirname, '../app/calendar/components/CalendarMobileTabStrip.tsx'),
      ),
    ).toBe(false);
  });
});
