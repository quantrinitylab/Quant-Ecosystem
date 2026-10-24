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

    it('single-param tabs are unaffected: Spam still targets /?lens=spam', () => {
      const push = vi.fn();
      const spamTab = mod.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'spam')!;
      mod.executeContextTabClick(spamTab, 'mail', {
        pathname: '/',
        search: '?view=inbox&lens=all',
        router: { push },
      });
      expect(push).toHaveBeenCalledWith('/?lens=spam');
    });
  },
);
