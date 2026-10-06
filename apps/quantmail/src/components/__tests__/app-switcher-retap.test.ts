import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal window mock for event dispatch testing (no jsdom needed)
const dispatchedEvents: string[] = [];
const mockWindow = {
  dispatchEvent: (event: { type: string }) => {
    dispatchedEvents.push(event.type);
    return true;
  },
  scrollTo: vi.fn(),
};

vi.stubGlobal('window', mockWindow);

import { executePillarTileClick, PILLAR_TILES } from '../QuantPillarTopBar';
import { executeContextTabClick, PILLAR_SUB_CONFIGS } from '../ContextBottomNavBar';

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

  it('executeContextTabClick navigates when tapping a different sub-tab', () => {
    const push = vi.fn();
    const pillarConfig = PILLAR_SUB_CONFIGS['calendar'];
    const tab = pillarConfig.tabs[1]; // not the first tab
    executeContextTabClick(tab, 'calendar', { pathname: '/other', router: { push } });
    expect(push).toHaveBeenCalled();
    expect(dispatchedEvents).not.toContain('quant:refresh');
  });

  it('executeContextTabClick dispatches quant:refresh on re-tap of active sub-tab', () => {
    const push = vi.fn();
    const pillarConfig = PILLAR_SUB_CONFIGS['calendar'];
    const tab = pillarConfig.tabs[0];
    // Simulate being on the tab's target path already
    const targetBase = tab.targetPath || '/calendar';
    executeContextTabClick(tab, 'calendar', { pathname: targetBase, router: { push } });
    // Should NOT navigate when already on the tab (no queryParam)
    if (!tab.queryParam) {
      expect(push).not.toHaveBeenCalled();
      // Should dispatch refresh (P1 fix: was a no-op before)
      expect(dispatchedEvents).toContain('quant:refresh');
    }
  });
});
