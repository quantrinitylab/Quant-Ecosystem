// @vitest-environment node
/**
 * QM-INBOX-NAV-VIEW (2026-10-24, P1 [inbox-nav]):
 * Sidebar "Inbox" (desktop) and the mobile bottom-nav Inbox tab had NO
 * working click path to the classic inbox view. RootPage (app/page.tsx)
 * renders PeopleHome unless `?view=inbox` is present, but the desktop tab
 * targeted `/?lens=all` and the mobile tab targeted `/` — both render the
 * People view. A single `queryParam` cannot carry both `view=inbox` AND
 * `lens=all`, so both configs gained a `queryParams` array and both click
 * handlers build the target from it.
 *
 * These tests pin the contract on BOTH viewports:
 * - Inbox click target is exactly `/?view=inbox&lens=all`.
 * - Clicking Inbox from the People view (`/`), from the old broken desktop
 *   target (`/?lens=all`), and from the spam lens all navigate there.
 * - Re-tapping Inbox while already on `/?view=inbox&lens=all` does NOT
 *   navigate (active re-tap: scroll + refresh, unchanged).
 * - Single-param tabs (Spam) are unaffected by the `queryParams` change.
 *
 * ACK CORRECTIVE (2026-10-25, deep-fix): payload = effective param set.
 * The first block pins the Inbox config + its built target. This second
 * block pins the HANDLER contract itself, identically on both viewports,
 * with synthetic tabs (so a fix in one handler cannot hide behind the
 * other handler's config):
 * - A tab declaring BOTH `queryParam` and `queryParams` builds ONLY the
 *   `queryParams` target — the stale single param must not leak into the
 *   URL (no duplicated keys, stale value absent).
 * - Param order is the declaration order, not sorted/canonicalised.
 * - A single-param synthetic tab builds exactly its old target, and a
 *   param-less tab builds its bare targetPath (byte-identical compat).
 * - An explicitly EMPTY `queryParams` array falls back to `queryParam`
 *   (the `?.length` guard both handlers share) — pinned so a one-sided
 *   edit to either handler breaks parity visibly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same window/navigator/document stubs as dead-inbox-tab-spam-lens.test.ts.
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

const INBOX_TARGET = '/?view=inbox&lens=all';

describe.each([['mobile', mobile], ['desktop', desktop]] as const)(
  'QM-INBOX-NAV-VIEW — %s context nav',
  (_name, ctx) => {
    const mod = ctx as unknown as CtxModule;

    beforeEach(() => {
      dispatchedEvents.length = 0;
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const inboxTab = () => mod.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'inbox')!;
    const clickInbox = (pathname: string, search: string | undefined) => {
      const push = vi.fn();
      mod.executeContextTabClick(inboxTab(), 'mail', {
        pathname,
        search,
        router: { push },
      });
      return push;
    };

    it('the Inbox tab carries view=inbox AND lens=all (not one or the other)', () => {
      const tab = inboxTab();
      expect(tab.queryParams).toEqual([
        { key: 'view', value: 'inbox' },
        { key: 'lens', value: 'all' },
      ]);
    });

    it('clicking Inbox from the People view (/) navigates to the classic inbox', () => {
      expect(clickInbox('/', undefined)).toHaveBeenCalledWith(INBOX_TARGET);
    });

    it('clicking Inbox from the old broken desktop target (/?lens=all) navigates', () => {
      expect(clickInbox('/', '?lens=all')).toHaveBeenCalledWith(INBOX_TARGET);
    });

    it('clicking Inbox from the spam lens view navigates and resets the lens to all', () => {
      expect(clickInbox('/', '?lens=spam')).toHaveBeenCalledWith(INBOX_TARGET);
    });

    it('re-tapping Inbox while already on the classic inbox does NOT navigate', () => {
      expect(clickInbox('/', '?view=inbox&lens=all')).not.toHaveBeenCalled();
    });

    // Adapted for current main: Spam is itself a queryParams tab since
    // #1717 (/?view=inbox&lens=spam), so the old /?lens=spam expectation
    // no longer holds; single-param behaviour is covered by the synthetic
    // tabs in the payload describe below.
    it('Spam (queryParams tab) still targets its inbox spam lens', () => {
      const push = vi.fn();
      const spamTab = mod.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'spam')!;
      mod.executeContextTabClick(spamTab, 'mail', {
        pathname: '/',
        search: '?view=inbox&lens=all',
        router: { push },
      });
      expect(push).toHaveBeenCalledWith('/?view=inbox&lens=spam');
    });
  },
);

describe.each([['mobile', mobile], ['desktop', desktop]] as const)(
  'QM-INBOX-NAV-VIEW payload=effective-set — %s handler',
  (_name, ctx) => {
    const mod = ctx as unknown as CtxModule;

    beforeEach(() => {
      dispatchedEvents.length = 0;
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const clickTab = (tab: Parameters<CtxModule['executeContextTabClick']>[0]) => {
      const push = vi.fn();
      mod.executeContextTabClick(tab, 'mail', {
        pathname: '/',
        search: undefined,
        router: { push },
      });
      return push;
    };
    const tabById = (id: string) => mod.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === id)!;
    const pushedUrl = (push: ReturnType<typeof vi.fn>) => {
      expect(push).toHaveBeenCalledTimes(1);
      return (push.mock.calls[0] as unknown as [string])[0];
    };
    const keyCounts = (url: string) => {
      const q = url.split('?')[1] ?? '';
      const counts = new Map<string, number>();
      for (const pair of q.split('&').filter(Boolean)) {
        const key = pair.split('=')[0];
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return counts;
    };

    it('both-declared tab: queryParams wins, stale queryParam does not leak', () => {
      // The pre-fix defect shape: a tab that still carries a legacy single
      // param (lens=spam) alongside the new array must build ONLY the array
      // target — lens=spam must not appear, and lens must appear once.
      const tab = {
        ...tabById('inbox'),
        queryParam: { key: 'lens', value: 'spam' },
      };
      const url = pushedUrl(clickTab(tab));
      expect(url).toBe(INBOX_TARGET);
      const counts = keyCounts(url);
      expect(counts.get('lens')).toBe(1);
      expect(counts.get('view')).toBe(1);
      expect(url).not.toContain('spam');
    });

    it('param order is the declaration order, not sorted', () => {
      const tab = {
        ...tabById('inbox'),
        queryParams: [
          { key: 'lens', value: 'all' },
          { key: 'view', value: 'inbox' },
        ],
      };
      expect(pushedUrl(clickTab(tab))).toBe('/?lens=all&view=inbox');
    });

    it('Inbox config target has no duplicated keys', () => {
      const push = vi.fn();
      mod.executeContextTabClick(tabById('inbox'), 'mail', {
        pathname: '/',
        search: undefined,
        router: { push },
      });
      const counts = keyCounts(pushedUrl(push));
      expect(counts.get('view')).toBe(1);
      expect(counts.get('lens')).toBe(1);
    });

    it('single-param synthetic tab builds exactly its old target', () => {
      const tab = {
        ...tabById('spam'),
        targetPath: '/calendar',
        queryParam: { key: 'tab', value: 'day' },
      };
      expect(pushedUrl(clickTab(tab))).toBe('/calendar?tab=day');
    });

    it('param-less tab builds its bare targetPath unchanged', () => {
      expect(pushedUrl(clickTab(tabById('sent')))).toBe('/sent');
    });

    it('empty queryParams falls back to queryParam (shared ?.length guard)', () => {
      // Adapted for current main: the real Spam tab carries no queryParam
      // since #1717, so the fallback is exercised with a synthetic tab.
      const tab = {
        ...tabById('spam'),
        queryParam: { key: 'lens', value: 'spam' },
        queryParams: [] as Array<{ key: string; value: string }>,
      };
      expect(pushedUrl(clickTab(tab))).toBe('/?lens=spam');
    });
  },
);
