// @vitest-environment node
/**
 * QM-SCHEDULED — the Scheduled folder must be reachable from the live
 * navigation on every surface.
 *
 * Scheduled sends were invisible: the backend queued them
 * (`deliveryStatus = 'queued'`, fire time in `sentAt`) but no UI fetched or
 * displayed them. The fix adds a real Scheduled mailbox
 * (`/scheduled`, backed by `GET /emails?folderType=SCHEDULED` with per-row
 * cancel/edit). These tests pin the tab on every nav that lists mail
 * folders, mirroring the QM-UIUX-082 Sent-tab coverage:
 *
 * - desktop left nav (`desktopContextTabs.PILLAR_SUB_CONFIGS.mail.tabs`)
 * - mobile bottom nav (`ContextBottomNavBar.PILLAR_SUB_CONFIGS.mail.tabs`)
 * - the drawer's Mail group (`AppSidebar`'s exported nav items)
 * - both active-tab resolvers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dispatchedEvents: string[] = [];
vi.stubGlobal('window', {
  dispatchEvent: (event: { type: string }) => {
    dispatchedEvents.push(event.type);
    return true;
  },
  scrollTo: vi.fn(),
});
vi.stubGlobal('navigator', { vibrate: vi.fn(() => true) } as unknown as Navigator);
vi.stubGlobal('document', { querySelectorAll: vi.fn(() => []) } as unknown as Document);

import * as desktop from '../components/desktopContextTabs';
import * as mobile from '../components/ContextBottomNavBar';
import { NAV_GROUPS } from '../components/AppSidebar';

describe('QM-SCHEDULED — Scheduled folder in the live navigation', () => {
  beforeEach(() => {
    dispatchedEvents.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('desktop left nav lists Scheduled right after Sent', () => {
    const ids = desktop.PILLAR_SUB_CONFIGS.mail.tabs.map((t) => t.id);
    const sentIdx = ids.indexOf('sent');
    expect(sentIdx).toBeGreaterThanOrEqual(0);
    expect(ids[sentIdx + 1]).toBe('scheduled');
  });

  it('desktop Scheduled tab targets the real /scheduled route with no fake badge', () => {
    const tab = desktop.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'scheduled')!;
    expect(tab.label).toBe('Scheduled');
    expect(tab.targetPath).toBe('/scheduled');
    expect(tab.queryParam).toBeUndefined();
    expect(tab.badgeCount).toBeUndefined();
    expect(typeof tab.icon).toBe('function');
  });

  it('desktop Scheduled tab click navigates to /scheduled', () => {
    const push = vi.fn();
    const tab = desktop.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'scheduled')!;
    desktop.executeContextTabClick(tab, 'mail', { pathname: '/', router: { push } });
    expect(push).toHaveBeenCalledWith('/scheduled');
  });

  it('desktop resolver marks Scheduled active on the /scheduled route', () => {
    expect(desktop.resolveContextTab('mail', '/scheduled', null)).toBe('scheduled');
    expect(desktop.resolveContextTab('mail', '/', null)).toBe('inbox');
  });

  it('mobile bottom nav lists Scheduled right after Sent', () => {
    const ids = mobile.PILLAR_SUB_CONFIGS.mail.tabs.map((t) => t.id);
    const sentIdx = ids.indexOf('sent');
    expect(sentIdx).toBeGreaterThanOrEqual(0);
    expect(ids[sentIdx + 1]).toBe('scheduled');
  });

  it('mobile Scheduled tab targets the real /scheduled route with no fake badge', () => {
    const tab = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'scheduled')!;
    expect(tab.label).toBe('Scheduled');
    expect(tab.targetPath).toBe('/scheduled');
    expect(tab.badgeCount).toBeUndefined();
    expect(typeof tab.icon).toBe('function');
  });

  it('mobile resolver marks Scheduled active on the /scheduled route', () => {
    expect(mobile.resolveActiveTab('mail', '/scheduled', null)).toBe('scheduled');
    expect(mobile.resolveActiveTab('mail', '/', null)).toBe('inbox');
  });

  it("drawer Mail group lists Scheduled with the clock icon on '/scheduled'", () => {
    const mailGroup = NAV_GROUPS.find((g) => g.label === 'Mail')!;
    const item = mailGroup.items.find((i) => i.id === 'scheduled')!;
    expect(item.label).toBe('Scheduled');
    expect(item.icon).toBe('clock');
    expect(item.path).toBe('/scheduled');
  });
});
