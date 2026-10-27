// @vitest-environment node
/**
 * QM-ARCHIVE-TAB-VIEW-INBOX (2026-10-27, P1 [inbox-nav]):
 * Desktop Archive tab (`/?tab=archive`) opened the People view even from
 * inside the inbox. Root cause was a double push: page.tsx's
 * `quant:subtab-change` handler correctly pushed
 * `/?view=inbox&tab=archive`, but desktopContextTabs.executeContextTabClick
 * then pushed its own generically-built `/?tab=archive`, overwriting it —
 * and the page wrapper renders PeopleHome whenever `view` is not `inbox`
 * (page.tsx: `isInbox = searchParams?.get('view') === 'inbox'`), so the
 * archived view was unreachable from the desktop sidebar.
 *
 * The fix: the desktop Archive tab targets the canonical archived view
 * `/?view=inbox&tab=archive` — the same URL the drawer entry, the `/archive`
 * shim, and the page.tsx handler all use. Other tabs are untouched (the
 * desktop Inbox/Spam view-preservation work is a sibling fix; this suite
 * deliberately asserts nothing about their targets).
 *
 * Window stub mirrors dead-inbox-tab-spam-lens.test.ts: the click handler
 * dispatches events on window.
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

import { PILLAR_SUB_CONFIGS, executeContextTabClick } from '../components/desktopContextTabs';

describe('QM-ARCHIVE-TAB-VIEW-INBOX — desktop Archive tab', () => {
  const archiveTab = PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'archive')!;

  beforeEach(() => {
    dispatchedEvents.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('from the inbox view (/?view=inbox) pushes /?view=inbox&tab=archive, not bare /?tab=archive', () => {
    const push = vi.fn();
    executeContextTabClick(archiveTab, 'mail', {
      pathname: '/',
      search: '?view=inbox',
      router: { push },
    });
    expect(push).toHaveBeenCalledWith('/?view=inbox&tab=archive');
  });

  it('from the People view (bare /) also lands on /?view=inbox&tab=archive (converges with the page handler and the /archive shim)', () => {
    const push = vi.fn();
    executeContextTabClick(archiveTab, 'mail', {
      pathname: '/',
      search: '',
      router: { push },
    });
    expect(push).toHaveBeenCalledWith('/?view=inbox&tab=archive');
  });

  it('re-tapping Archive while already on /?view=inbox&tab=archive does NOT re-push (refresh branch)', () => {
    const push = vi.fn();
    executeContextTabClick(archiveTab, 'mail', {
      pathname: '/',
      search: '?view=inbox&tab=archive',
      router: { push },
    });
    expect(push).not.toHaveBeenCalled();
    expect(dispatchedEvents).toContain('quant:refresh');
  });

  it('still dispatches quant:subtab-change so page.tsx and the sidebar stay in sync', () => {
    const push = vi.fn();
    executeContextTabClick(archiveTab, 'mail', {
      pathname: '/',
      search: '?view=inbox',
      router: { push },
    });
    expect(dispatchedEvents).toContain('quant:subtab-change');
  });

  it('path-based mail tabs are untouched (Trash still targets /trash)', () => {
    const trashTab = PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'trash')!;
    const push = vi.fn();
    executeContextTabClick(trashTab, 'mail', {
      pathname: '/',
      search: '?view=inbox',
      router: { push },
    });
    expect(push).toHaveBeenCalledWith('/trash');
  });
});
