// @vitest-environment node
/**
 * Mail Search slice (rebuild plan Phase 1.3) — search as a bottom-nav
 * destination. The /search page is the mail pillar's search surface, so
 * the mobile Mail bar carries a primary Search tab pointing at the real
 * /search route, and the resolver parks the bar on it while searching —
 * instead of leaving the bar on Inbox while the user is on /search.
 * Same window/navigator/document stubs as sent-folder-nav.test.ts.
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

import * as mobile from '../components/ContextBottomNavBar';

describe('Mail Search slice — Search tab in the mobile Mail bottom bar', () => {
  beforeEach(() => {
    dispatchedEvents.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('the Mail config has a primary Search tab targeting the real /search route', () => {
    const search = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'search')!;
    expect(search.label).toBe('Search');
    expect(search.targetPath).toBe('/search');
    expect(search.queryParam).toBeUndefined();
    expect(search.badgeCount).toBeUndefined();
    expect(search.mobileOverflow).toBeFalsy();
    expect(typeof search.icon).toBe('function');
  });

  it('the resolver parks the bar on Search for /search (with or without ?q=)', () => {
    expect(mobile.resolveActiveTab('mail', '/search', null)).toBe('search');
    expect(
      mobile.resolveActiveTab('mail', '/search', { get: (k: string) => (k === 'q' ? 'invoice' : null) }),
    ).toBe('search');
  });

  it('tapping Search navigates to /search', () => {
    const push = vi.fn();
    const search = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'search')!;
    mobile.executeContextTabClick(search, 'mail', { pathname: '/', router: { push } });
    expect(push).toHaveBeenCalledWith('/search');
    expect(dispatchedEvents).toContain('quant:subtab-change');
  });
});
