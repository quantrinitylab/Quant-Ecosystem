import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal window mock for event dispatch testing (no jsdom needed)
const dispatchedEvents: string[] = [];
const mockScrollTo = vi.fn();
const mockWindow = {
  dispatchEvent: (event: { type: string }) => {
    dispatchedEvents.push(event.type);
    return true;
  },
  scrollTo: mockScrollTo,
};

vi.stubGlobal('window', mockWindow);

// P1-B: mock navigator.vibrate so re-tap haptic is assertable in node.
const mockVibrate = vi.fn(() => true);
vi.stubGlobal('navigator', { vibrate: mockVibrate } as unknown as Navigator);

// Minimal document mock for the inner-container scroll sweep
const mockQuerySelectorAll = vi.fn(() => [] as HTMLElement[]);
vi.stubGlobal('document', { querySelectorAll: mockQuerySelectorAll } as unknown as Document);

import { executePillarTileClick, PILLAR_TILES } from '../QuantPillarTopBar';
import {
  executeContextTabClick,
  resolveActiveTab,
  PILLAR_SUB_CONFIGS,
} from '../ContextBottomNavBar';

describe('app-switcher re-tap refresh', () => {
  beforeEach(() => {
    dispatchedEvents.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executePillarTileClick navigates when tapping a different pillar', () => {
    const push = vi.fn();
    const tile = PILLAR_TILES.find((t) => t.id === 'drive')!;
    executePillarTileClick(tile, { pathname: '/', router: { push } });
    expect(push).toHaveBeenCalledWith('/drive');
    // Should NOT dispatch refresh when switching apps
    expect(dispatchedEvents).not.toContain('quant:refresh');
  });

  it('executePillarTileClick dispatches quant:refresh on re-tap of active pillar', () => {
    const push = vi.fn();
    const tile = PILLAR_TILES.find((t) => t.id === 'drive')!;
    executePillarTileClick(tile, { pathname: '/drive', router: { push } });
    // Should NOT navigate when already on the pillar
    expect(push).not.toHaveBeenCalled();
    // Should dispatch refresh events (P1 fix: was a no-op before)
    expect(dispatchedEvents).toContain('quant:refresh');
    expect(dispatchedEvents).toContain('quant:pillar-retap');
  });

  it('executeContextTabClick navigates when tapping a different tab', () => {
    const push = vi.fn();
    const tab = PILLAR_SUB_CONFIGS['mail'].tabs.find((t) => t.id === 'archive')!;
    executeContextTabClick(tab, 'mail', { pathname: '/', router: { push } });
    expect(push).toHaveBeenCalledWith('/archive');
    expect(dispatchedEvents).not.toContain('quant:refresh');
    expect(dispatchedEvents).toContain('quant:subtab-change');
  });

  it('executeContextTabClick scrolls to top + refreshes + vibrates on re-tap of the active tab', () => {
    const push = vi.fn();
    // Re-tap branch: pathname matches the tab's targetBase and the tab has no
    // queryParam (already on this exact destination).
    const plainTab = {
      id: 'home',
      label: 'Home',
      icon: () => null,
      targetPath: '/drive',
    };
    executeContextTabClick(plainTab, 'drive', { pathname: '/drive', router: { push } });
    expect(push).not.toHaveBeenCalled();
    expect(mockVibrate).toHaveBeenCalledWith(10);
    expect(mockScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(dispatchedEvents).toContain('quant:refresh');
  });

  it('executeContextTabClick navigates to the repositories route for the QuantGit tab', () => {
    const push = vi.fn();
    const tab = PILLAR_SUB_CONFIGS['quantgit'].tabs.find((t) => t.id === 'repositories')!;
    executeContextTabClick(tab, 'quantgit', { pathname: '/quantgit', router: { push } });
    expect(push).toHaveBeenCalledWith('/quantgit/repositories');
    expect(dispatchedEvents).toContain('quant:subtab-change');
  });

  it('resolveActiveTab maps quantgit paths to the right tab', () => {
    expect(resolveActiveTab('quantgit', '/quantgit/repositories', null)).toBe('repositories');
    expect(resolveActiveTab('quantgit', '/quantgit', null)).toBe('overview');
  });

  it('resolveActiveTab maps the calendar day tab', () => {
    expect(
      resolveActiveTab('calendar', '/calendar', { get: (k: string) => (k === 'tab' ? 'day' : null) }),
    ).toBe('day');
  });

  it('QuantGit bottom tabs are Repositories + Overview (user-approved 2026-10-09)', () => {
    const ids = PILLAR_SUB_CONFIGS['quantgit'].tabs.map((t) => t.id);
    expect(ids).toEqual(['repositories', 'overview']);
  });

  it('every bottom tab navigates to a real route (no fake tabs)', () => {
    for (const cfg of Object.values(PILLAR_SUB_CONFIGS)) {
      for (const tab of cfg.tabs) {
        expect(tab.targetPath).toMatch(/^\/(archive|calendar|drive|contacts|quantgit(\/repositories)?)?$/);
      }
    }
  });

  it('no tab config carries a hardcoded badge count', () => {
    for (const cfg of Object.values(PILLAR_SUB_CONFIGS)) {
      for (const tab of cfg.tabs) {
        expect(tab.badgeCount).toBeUndefined();
      }
    }
  });
});
