// @vitest-environment node
/**
 * QM-MOBILE-QUANTY-TAB — one-tap Quanty access on the mobile Mail bottom bar.
 *
 * Competitor-gap finding 2026-10-12: Gmail's 2026 mobile bottom bar gives its
 * AI inbox a first-class tab, while QuantMail's mobile Mail tabs were
 * Inbox/Sent/Drafts/Archive only — zero one-tap Quanty access on mobile, even
 * though `ContextBottomNavBar` shipped the `logoOnly` Quanty-tab slot
 * (interface + render path) and the desktop `DesktopContextSidebar` already
 * wired a Quanty tab via `opensQuanty`.
 *
 * The fix wires the slot into the mobile Mail pillar config: a logo-only
 * Quanty tab in the second slot (Gmail's AI-Inbox position). Tapping it calls
 * the `onQuantyOpen` prop — AppShell passes its real live-agent opener
 * (`liveAgentRef.current?.open()`), the same surface the header Quanty button
 * uses — and it never navigates, mirroring
 * `desktopContextTabs.executeContextTabClick`'s `opensQuanty` arm.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same window/navigator/document stubs as sent-folder-nav.test.ts:
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

import * as mobile from '../components/ContextBottomNavBar';

describe('QM-MOBILE-QUANTY-TAB — Quanty in the mobile Mail bottom bar', () => {
  beforeEach(() => {
    dispatchedEvents.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mobile Mail config wires the logoOnly Quanty slot in the second position', () => {
    const tabs = mobile.PILLAR_SUB_CONFIGS.mail.tabs;
    const ids = tabs.map((t) => t.id);
    // Search added after Archive by the Mail Search slice (Phase 1.3).
    expect(ids).toEqual([
      'inbox',
      'quanty',
      'sent',
      'scheduled',
      'drafts',
      'archive',
      'search',
      'spam',
      'important',
      'trash',
    ]);
    const quanty = tabs[1];
    expect(quanty.logoOnly).toBe(true);
    expect(quanty.opensQuanty).toBe(true);
  });

  it('Quanty tab is a cockpit opener, not a navigation target — no fake view', () => {
    const quanty = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'quanty')!;
    expect(quanty.targetPath).toBeUndefined();
    expect(quanty.queryParam).toBeUndefined();
    expect(quanty.badgeCount).toBeUndefined();
    expect(quanty.ariaLabel).toBe('Open Quanty AI');
    expect(typeof quanty.icon).toBe('function');
  });

  it('tapping Quanty calls onQuantyOpen and never navigates', () => {
    const push = vi.fn();
    const onQuantyOpen = vi.fn();
    const onTabChange = vi.fn();
    const quanty = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'quanty')!;
    mobile.executeContextTabClick(quanty, 'mail', {
      pathname: '/',
      router: { push },
      onTabChange,
      onQuantyOpen,
    });
    expect(onQuantyOpen).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    // A cockpit overlay is not a view: it must not fire the tab-change sync.
    expect(onTabChange).not.toHaveBeenCalled();
    expect(dispatchedEvents).toContain('quant:quanty:open');
    expect(dispatchedEvents).toContain('quant:copilot:open');
    expect(dispatchedEvents).not.toContain('quant:subtab-change');
  });

  it('tapping Quanty still opens the cockpit events when no onQuantyOpen is wired', () => {
    const push = vi.fn();
    const quanty = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'quanty')!;
    mobile.executeContextTabClick(quanty, 'mail', { pathname: '/', router: { push } });
    expect(push).not.toHaveBeenCalled();
    expect(dispatchedEvents).toContain('quant:quanty:open');
  });

  it('Quanty tap on the /sent route does not navigate away', () => {
    const push = vi.fn();
    const quanty = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'quanty')!;
    mobile.executeContextTabClick(quanty, 'mail', { pathname: '/sent', router: { push } });
    expect(push).not.toHaveBeenCalled();
  });

  it('ordinary tabs still navigate (no behavior change)', () => {
    const push = vi.fn();
    const sent = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'sent')!;
    mobile.executeContextTabClick(sent, 'mail', { pathname: '/', router: { push } });
    expect(push).toHaveBeenCalledWith('/sent');
    expect(dispatchedEvents).toContain('quant:subtab-change');
  });

  it('the resolver never parks the bar on a Quanty pseudo-view', () => {
    expect(mobile.resolveActiveTab('mail', '/', null)).toBe('inbox');
    expect(mobile.resolveActiveTab('mail', '/sent', null)).toBe('sent');
    expect(mobile.resolveActiveTab('mail', '/archive', null)).toBe('archive');
  });

  it('Quanty tab is a primary slot, not overflow — always one tap away', () => {
    const quanty = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'quanty')!;
    expect(quanty.mobileOverflow).toBeFalsy();
    const primary = mobile.PILLAR_SUB_CONFIGS.mail.tabs.filter((t) => !t.mobileOverflow);
    // Search joined the primary slots with the Mail Search slice (Phase 1.3).
    expect(primary.map((t) => t.id)).toEqual(['inbox', 'quanty', 'sent', 'drafts', 'archive', 'search']);
  });

  it('QM-FIX mobile-nav-quanty-dead: QuantGit pillar defines no quanty tab', () => {
    // User-approved 2026-10-09: Repositories + Overview only. The removed
    // `tab.id === 'quanty' && pillar === 'quantgit'` branch in
    // executeContextTabClick therefore had no config tab that could reach it.
    expect(mobile.PILLAR_SUB_CONFIGS.quantgit.tabs.map((t) => t.id)).toEqual([
      'repositories',
      'overview',
    ]);
  });

  it('QM-FIX mobile-nav-quanty-dead: an id-quanty tab without opensQuanty is NOT a cockpit opener', () => {
    // The dead branch fired copilot/quanty events for ANY tab with id
    // 'quanty' on quantgit, even one never wired as a Quanty tab — and then
    // fell through to navigation anyway. The only cockpit path is the
    // opensQuanty arm above: without it, the tab is an ordinary nav tab.
    const push = vi.fn();
    const onTabChange = vi.fn();
    const plainQuantyTab = {
      id: 'quanty',
      label: 'Quanty',
      icon: () => null,
      targetPath: '/quantgit/repositories',
    };
    mobile.executeContextTabClick(plainQuantyTab, 'quantgit', {
      pathname: '/quantgit',
      router: { push },
      onTabChange,
    });
    expect(dispatchedEvents).not.toContain('quant:copilot:open');
    expect(dispatchedEvents).not.toContain('quant:quanty:open');
    expect(dispatchedEvents).toContain('quant:subtab-change');
    expect(onTabChange).toHaveBeenCalledWith('quanty', 'quantgit');
    expect(push).toHaveBeenCalledWith('/quantgit/repositories');
  });
});
