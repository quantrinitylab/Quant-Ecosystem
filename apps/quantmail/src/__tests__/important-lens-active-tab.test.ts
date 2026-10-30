// @vitest-environment node
/**
 * QM-IMPORTANT-LENS-ACTIVE-TAB — `/?lens=important` is a real inbox view
 * (page.tsx `important` lens: high-priority or starred mail), but both
 * context-nav resolvers mapped it to phantom tab id 'priority', which no
 * mail tab carried. Consequence: the desktop sidebar (exact
 * `tab.id === activeTabId` match, no fallback) highlighted nothing and
 * rendered zero aria-current on a real view, while the mobile bar fell
 * back to index 0 and falsely highlighted Inbox.
 *
 * The fix (mirroring the Spam lens tab): a real 'important' tab in both
 * mail configs — mobileOverflow on mobile (so the primary bar is
 * unchanged; it joins the bar only while Important is active, exactly
 * like Spam), a regular tab on desktop — and both resolvers return
 * 'important'. The legacy ?tab=priority alias collapses onto the new
 * tab instead of stranding the nav.
 *
 * Invariant locked here: every id either mail resolver can return for a
 * real lens/tab value exists in BOTH mail configs, so there is always a
 * highlightable tab in every real mail view.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same window/navigator/document stubs as sent-folder-nav.test.ts:
// the click handlers fire a haptic and dispatch events.
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

const lensParams = (lens: string | null) => ({
  get: (k: string) => (k === 'lens' ? lens : null),
});
const tabParams = (tab: string | null) => ({
  get: (k: string) => (k === 'tab' ? tab : null),
});

describe('QM-IMPORTANT-LENS-ACTIVE-TAB — Important lens highlights a real tab', () => {
  beforeEach(() => {
    dispatchedEvents.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mobile resolver maps lens=important to the real important tab, never to phantom priority', () => {
    expect(mobile.resolveActiveTab('mail', '/', lensParams('important'))).toBe('important');
    // Legacy ?tab=priority alias collapses onto the same real tab.
    expect(mobile.resolveActiveTab('mail', '/', tabParams('priority'))).toBe('important');
    // Neighboring lenses are untouched.
    expect(mobile.resolveActiveTab('mail', '/', lensParams('spam'))).toBe('spam');
    expect(mobile.resolveActiveTab('mail', '/', lensParams('all'))).toBe('inbox');
    expect(mobile.resolveActiveTab('mail', '/', null)).toBe('inbox');
  });

  it('desktop resolver maps lens=important to the real important tab, never to phantom priority', () => {
    expect(desktop.resolveContextTab('mail', '/', lensParams('important'))).toBe('important');
    expect(desktop.resolveContextTab('mail', '/', tabParams('priority'))).toBe('important');
    expect(desktop.resolveContextTab('mail', '/', lensParams('spam'))).toBe('spam');
    expect(desktop.resolveContextTab('mail', '/', lensParams('all'))).toBe('inbox');
    expect(desktop.resolveContextTab('mail', '/', null)).toBe('inbox');
  });

  it('neither mail resolver ever returns the phantom priority id for any real lens/tab value', () => {
    const lenses = ['all', 'unread', 'contacts', 'spam', 'important', 'teams', 'updates', null];
    const tabs = ['sent', 'archive', 'drafts', 'trash', 'priority', null];
    for (const lens of lenses) {
      expect(mobile.resolveActiveTab('mail', '/', lensParams(lens))).not.toBe('priority');
      expect(desktop.resolveContextTab('mail', '/', lensParams(lens))).not.toBe('priority');
    }
    for (const tab of tabs) {
      expect(mobile.resolveActiveTab('mail', '/', tabParams(tab))).not.toBe('priority');
      expect(desktop.resolveContextTab('mail', '/', tabParams(tab))).not.toBe('priority');
    }
  });

  it('both mail configs carry a real Important tab pointing at the real lens view', () => {
    for (const mod of [mobile, desktop]) {
      const tab = mod.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'important')!;
      expect(tab, 'important tab exists').toBeDefined();
      expect(tab.label).toBe('Important');
      expect(tab.targetPath).toBe('/');
      expect(tab.queryParam).toEqual({ key: 'lens', value: 'important' });
      expect(typeof tab.icon).toBe('function');
    }
  });

  it('mobile Important is an overflow slot (primary bar unchanged, joins only while active)', () => {
    const tab = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'important')!;
    expect(tab.mobileOverflow).toBe(true);
    const primary = mobile.PILLAR_SUB_CONFIGS.mail.tabs.filter((t) => !t.mobileOverflow);
    // Wave-9 slice A4: 'search' IS a primary slot — the Mail Search slice (Phase 1.3)
    // made /search a primary one-tap tab ("Primary, not mobileOverflow" in
    // ContextBottomNavBar.tsx), pinned by search-bottom-nav-u13.test.ts
    // (mobileOverflow falsy) and mobile-quanty-tab.test.ts (primary list already
    // includes 'search'). This list was stale without it; the invariant this test
    // locks — Important stays overflow and joins only while active — is unchanged.
    expect(primary.map((t) => t.id)).toEqual(['inbox', 'quanty', 'sent', 'drafts', 'archive', 'search']);
  });

  it('tapping Important navigates to the real lens view; re-tapping it does not navigate', () => {
    for (const mod of [mobile, desktop]) {
      const tab = mod.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'important')!;
      const push = vi.fn();
      mod.executeContextTabClick(tab, 'mail', { pathname: '/', router: { push } });
      expect(push).toHaveBeenCalledWith('/?lens=important');
      const retap = vi.fn();
      mod.executeContextTabClick(tab, 'mail', {
        pathname: '/',
        search: '?lens=important',
        router: { push: retap },
      });
      expect(retap).not.toHaveBeenCalled();
    }
  });
});
