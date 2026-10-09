// @vitest-environment node
/**
 * QM-UIUX-082 — the Sent folder must be reachable from the live navigation.
 *
 * Personal deep audit 2026-10-09: the left nav had only Inbox/Archive, so
 * sent mail could not be browsed and the Sent copy of the compose-send flow
 * could not be verified by the user.
 *
 * The nav the shipped shell actually renders is NOT `AppSidebar` (that one
 * already listed Sent): `AppShell` renders `DesktopContextSidebar` on
 * desktop — driven by `PILLAR_SUB_CONFIGS` in `desktopContextTabs.tsx` —
 * and `ContextBottomNavBar` on mobile. Both Mail tab sets listed only
 * Inbox + Archive; both files even defined a `SentIcon` and a resolver arm
 * (`/sent` → 'sent') that were dead because no tab existed.
 *
 * The tab must point at the REAL Sent view: `/sent`, the page backed by
 * `useInbox({ folderType: 'SENT' })` → `GET /emails?folderType=SENT`,
 * which the backend filters on `isSent = true` (backend/routes/emails.ts;
 * proven by backend/__tests__/send-persists-sent-copy.test.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same window/navigator/document stubs as app-switcher-retap.test.ts:
// ContextBottomNavBar's click handler fires a haptic and dispatches events.
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

describe('QM-UIUX-082 — Sent folder in the live navigation', () => {
  beforeEach(() => {
    dispatchedEvents.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('desktop left nav (desktopContextTabs) lists Inbox, Sent, Archive in order', () => {
    const ids = desktop.PILLAR_SUB_CONFIGS.mail.tabs.map((t) => t.id);
    expect(ids).toEqual(['inbox', 'sent', 'archive']);
  });

  it('desktop Sent tab targets the real /sent route with no fake badge', () => {
    const sent = desktop.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'sent')!;
    expect(sent.label).toBe('Sent');
    expect(sent.targetPath).toBe('/sent');
    expect(sent.queryParam).toBeUndefined();
    expect(sent.badgeCount).toBeUndefined();
    expect(typeof sent.icon).toBe('function');
  });

  it('desktop Sent tab click navigates to /sent', () => {
    const push = vi.fn();
    const sent = desktop.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'sent')!;
    desktop.executeContextTabClick(sent, 'mail', { pathname: '/', router: { push } });
    expect(push).toHaveBeenCalledWith('/sent');
  });

  it('desktop resolver marks Sent active on the /sent route', () => {
    expect(desktop.resolveContextTab('mail', '/sent', null)).toBe('sent');
    expect(desktop.resolveContextTab('mail', '/', null)).toBe('inbox');
  });

  it('mobile bottom nav (ContextBottomNavBar) lists Inbox, Sent, Archive in order', () => {
    const ids = mobile.PILLAR_SUB_CONFIGS.mail.tabs.map((t) => t.id);
    expect(ids).toEqual(['inbox', 'sent', 'archive']);
  });

  it('mobile Sent tab targets the real /sent route with no fake badge', () => {
    const sent = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'sent')!;
    expect(sent.label).toBe('Sent');
    expect(sent.targetPath).toBe('/sent');
    expect(sent.badgeCount).toBeUndefined();
    expect(typeof sent.icon).toBe('function');
  });

  it('mobile Sent tab click navigates to /sent', () => {
    const push = vi.fn();
    const sent = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'sent')!;
    mobile.executeContextTabClick(sent, 'mail', { pathname: '/', router: { push } });
    expect(push).toHaveBeenCalledWith('/sent');
    expect(dispatchedEvents).toContain('quant:subtab-change');
  });

  it('mobile resolver marks Sent active on the /sent route', () => {
    expect(mobile.resolveActiveTab('mail', '/sent', null)).toBe('sent');
    expect(mobile.resolveActiveTab('mail', '/', null)).toBe('inbox');
  });
});
