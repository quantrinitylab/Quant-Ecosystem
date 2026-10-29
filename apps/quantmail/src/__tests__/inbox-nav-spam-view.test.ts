// @vitest-environment node
/**
 * QM-INBOX-NAV-SPAM-VIEW (2026-10-27, P1 [inbox-nav]):
 * The context-nav Spam tab targeted `/?lens=spam`, but RootPage
 * (app/page.tsx) renders PeopleHome unless `?view=inbox` is present — so
 * "Spam" opened the People spam list, not the inbox spam lens. A single
 * `queryParam` cannot carry both params, so both configs gained a
 * `queryParams` array (Spam: `view=inbox` + `lens=spam`) and both click
 * handlers build the target from it.
 *
 * These tests pin the contract on BOTH viewports plus the drawer entry:
 * - Spam click target is exactly `/?view=inbox&lens=spam`.
 * - Clicking Spam from the People view (`/`), from the old broken target
 *   (`/?lens=spam`), and from the classic inbox (`/?view=inbox&lens=all`)
 *   all navigate there.
 * - Re-tapping Spam while already on `/?view=inbox&lens=spam` does NOT
 *   navigate (active re-tap: scroll + refresh, unchanged).
 * - Single-param tabs (Trash) are unaffected by the `queryParams` change.
 * - The drawer entry (AppSidebar NAV_GROUPS) points at the same target.
 * - Active-tab resolution still keys off `lens=spam` regardless of `view`
 *   (resolvers are unchanged by this fix).
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

// AppSidebar pulls next/navigation + sibling components at import time.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({ quota: null, known: false, usedPct: 0 }),
}));
vi.mock('../components/QuantMailLogo', () => ({
  QuantMailLogo: () => null,
}));
vi.mock('../components/BrandWordmark', () => ({
  BrandWordmark: () => null,
}));
vi.mock('../components/AccountBadge', () => ({
  AccountBadge: () => null,
}));
vi.mock('../hooks/useMail', () => ({
  useInbox: () => ({ data: [] }),
}));

import * as desktop from '../components/desktopContextTabs';
import * as mobile from '../components/ContextBottomNavBar';
import { NAV_GROUPS } from '../components/AppSidebar';

type CtxModule = typeof desktop | typeof mobile;

const SPAM_TARGET = '/?view=inbox&lens=spam';

describe.each([['mobile', mobile], ['desktop', desktop]] as const)(
  'QM-INBOX-NAV-SPAM-VIEW — %s context nav',
  (_name, ctx) => {
    const mod = ctx as unknown as CtxModule;

    beforeEach(() => {
      dispatchedEvents.length = 0;
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    const spamTab = () => mod.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'spam')!;
    const clickSpam = (pathname: string, search: string | undefined) => {
      const push = vi.fn();
      mod.executeContextTabClick(spamTab(), 'mail', {
        pathname,
        search,
        router: { push },
      });
      return push;
    };

    it('the Spam tab carries view=inbox AND lens=spam (not one or the other)', () => {
      const tab = spamTab();
      expect(tab.queryParams).toEqual([
        { key: 'view', value: 'inbox' },
        { key: 'lens', value: 'spam' },
      ]);
    });

    it('clicking Spam from the People view (/) navigates to the inbox spam lens', () => {
      expect(clickSpam('/', undefined)).toHaveBeenCalledWith(SPAM_TARGET);
    });

    it('clicking Spam from the old broken target (/?lens=spam) navigates to the inbox spam lens', () => {
      expect(clickSpam('/', '?lens=spam')).toHaveBeenCalledWith(SPAM_TARGET);
    });

    it('clicking Spam from the classic inbox (/?view=inbox&lens=all) navigates to the spam lens', () => {
      expect(clickSpam('/', '?view=inbox&lens=all')).toHaveBeenCalledWith(SPAM_TARGET);
    });

    it('re-tapping Spam while already on the inbox spam lens does NOT navigate', () => {
      expect(clickSpam('/', '?view=inbox&lens=spam')).not.toHaveBeenCalled();
    });

    it('single-param tabs are unaffected: Trash still targets /trash', () => {
      const push = vi.fn();
      const trashTab = mod.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'trash')!;
      mod.executeContextTabClick(trashTab, 'mail', {
        pathname: '/',
        search: '?view=inbox&lens=all',
        router: { push },
      });
      expect(push).toHaveBeenCalledWith('/trash');
    });

    it('active-tab resolution still keys off lens=spam on the new target', () => {
      const resolver = (mod as unknown as {
        resolveContextTab?: CtxModule['resolveContextTab'];
        resolveActiveTab?: (pillar: string, pathname: string, params: { get: (k: string) => string | null } | null) => string;
      }).resolveContextTab ?? (mod as unknown as { resolveActiveTab: (pillar: string, pathname: string, params: { get: (k: string) => string | null } | null) => string }).resolveActiveTab;
      const params = {
        get: (k: string) => (k === 'view' ? 'inbox' : k === 'lens' ? 'spam' : null),
      };
      expect(resolver('mail', '/', params)).toBe('spam');
    });
  },
);

describe('QM-INBOX-NAV-SPAM-VIEW — drawer entry', () => {
  it('the AppSidebar Spam entry points at the inbox spam lens', () => {
    const mailGroup = NAV_GROUPS.find((g) => g.label === 'Mail')!;
    const spam = mailGroup.items.find((i) => i.id === 'spam')!;
    expect(spam.path).toBe(SPAM_TARGET);
    // Active detection still keys off the lens field, not the full path.
    expect(spam.lens).toBe('spam');
  });
});
