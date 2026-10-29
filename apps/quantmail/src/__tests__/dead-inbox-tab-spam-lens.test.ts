// @vitest-environment node
/**
 * QM-DEAD-INBOX-TAB-SPAM-LENS (2026-10-16, P1 [mobile-nav]):
 * On `/?lens=spam`, tapping the Inbox tab never navigated back to the inbox
 * view. executeContextTabClick's nav decision compared the target tab's
 * queryParam against the current query — the mobile Inbox tab has NO
 * queryParam, so the equality held and it took the re-tap branch (scroll-top
 * + refresh of the spam view) while the bar lied about the active view.
 *
 * The decision now compares the FULL current URL (path + query, via the new
 * optional `search` option) against the target URL: a queryParam-less tab is
 * a different view whenever the current query string is non-empty, so it
 * pushes; re-tapping the actually-active tab still scrolls to top + refreshes.
 *
 * The same fix landed in both copies: mobile (`ContextBottomNavBar`, Inbox
 * tab → `/` with no queryParam) and desktop (`desktopContextTabs`, Inbox tab
 * → `/?lens=all`), so desktop re-taps of the already-active Inbox now also
 * take the scroll + refresh branch instead of re-pushing the same URL.
 *
 * QM-INBOX-NAV-SPAM-VIEW (2026-10-27, P1 [inbox-nav]) supersedes the Spam
 * target pinned below: RootPage renders PeopleHome unless `?view=inbox` is
 * present, so the Spam tab now targets `/?view=inbox&lens=spam` (via the
 * `queryParams` array). Tapping Spam from the OLD `/?lens=spam` URL is
 * therefore a navigation, not a re-tap; only re-tapping the NEW target
 * takes the scroll + refresh branch.
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

import * as desktop from '../components/desktopContextTabs';
import * as mobile from '../components/ContextBottomNavBar';

type CtxModule = typeof desktop | typeof mobile;

describe.each([['mobile', mobile], ['desktop', desktop]] as const)(
  'QM-DEAD-INBOX-TAB-SPAM-LENS — %s context nav',
  (_name, ctx) => {
    const mod = ctx as unknown as CtxModule;

    beforeEach(() => {
      dispatchedEvents.length = 0;
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const tabById = (id: string) => mod.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === id)!;
    const tabTargetUrl = (id: string) => {
      const t = tabById(id);
      const base = t.targetPath || '/';
      // QM-INBOX-NAV-SPAM-VIEW: tabs may carry `queryParams` (Spam needs two).
      const params = t.queryParams?.length
        ? t.queryParams
        : t.queryParam
          ? [t.queryParam]
          : [];
      return params.length
        ? `${base}?${params.map((p: { key: string; value: string }) => `${p.key}=${p.value}`).join('&')}`
        : base;
    };
    const inboxTarget = () => tabTargetUrl('inbox');
    const inboxSearch = () => {
      const t = inboxTarget();
      const q = t.indexOf('?');
      return q >= 0 ? t.slice(q) : undefined;
    };

    it('tapping Inbox from the Spam lens view navigates to the Inbox view', () => {
      const push = vi.fn();
      mod.executeContextTabClick(tabById('inbox'), 'mail', {
        pathname: '/',
        search: '?lens=spam',
        router: { push },
      });
      expect(push).toHaveBeenCalledWith(inboxTarget());
    });

    it('tapping Inbox from any query-ful same-path URL navigates (not just lens=spam)', () => {
      const push = vi.fn();
      mod.executeContextTabClick(tabById('inbox'), 'mail', {
        pathname: '/',
        search: '?q=hello',
        router: { push },
      });
      expect(push).toHaveBeenCalledWith(inboxTarget());
    });

    it('tapping Spam from the OLD People spam URL (/?lens=spam) navigates to the inbox spam lens', () => {
      const push = vi.fn();
      mod.executeContextTabClick(tabById('spam'), 'mail', {
        pathname: '/',
        search: '?lens=spam',
        router: { push },
      });
      expect(push).toHaveBeenCalledWith('/?view=inbox&lens=spam');
    });

    it('tapping Spam while already on the inbox spam lens does NOT navigate (re-tap: scroll + refresh)', () => {
      const push = vi.fn();
      mod.executeContextTabClick(tabById('spam'), 'mail', {
        pathname: '/',
        search: '?view=inbox&lens=spam',
        router: { push },
      });
      expect(push).not.toHaveBeenCalled();
    });

    it('tapping Inbox while already on the Inbox view does NOT navigate (active re-tap preserved)', () => {
      const push = vi.fn();
      mod.executeContextTabClick(tabById('inbox'), 'mail', {
        pathname: '/',
        search: inboxSearch(),
        router: { push },
      });
      expect(push).not.toHaveBeenCalled();
    });

    it('tapping Spam from the plain inbox navigates to the inbox spam lens', () => {
      const push = vi.fn();
      mod.executeContextTabClick(tabById('spam'), 'mail', {
        pathname: '/',
        search: inboxSearch(),
        router: { push },
      });
      expect(push).toHaveBeenCalledWith('/?view=inbox&lens=spam');
    });

    it('tapping a different-path tab (Trash) from the Spam lens view still navigates', () => {
      const push = vi.fn();
      mod.executeContextTabClick(tabById('trash'), 'mail', {
        pathname: '/',
        search: '?lens=spam',
        router: { push },
      });
      expect(push).toHaveBeenCalledWith('/trash');
    });

    it('omitting `search` keeps the legacy pathname-only decision (backward compatible)', () => {
      const push = vi.fn();
      mod.executeContextTabClick(tabById('spam'), 'mail', { pathname: '/', router: { push } });
      expect(push).toHaveBeenCalledWith('/?view=inbox&lens=spam');

      push.mockClear();
      mod.executeContextTabClick(tabById('inbox'), 'mail', { pathname: '/', router: { push } });
      // QM-INBOX-NAV-VIEW: Inbox now targets `/?view=inbox&lens=all` on
      // BOTH viewports, so a bare `/` (People view) always pushes.
      expect(push).toHaveBeenCalledWith(inboxTarget());
    });
  },
);
