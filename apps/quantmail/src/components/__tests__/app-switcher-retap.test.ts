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

// P1-B: mock navigator.vibrate so re-tap haptic is assertable in node.
const mockVibrate = vi.fn(() => true);
vi.stubGlobal('navigator', { vibrate: mockVibrate } as unknown as Navigator);

import { executePillarTileClick, PILLAR_TILES } from '../QuantPillarTopBar';
import { executeMobilePillarTap } from '../MobilePillarBottomNav';

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

  it('executeMobilePillarTap navigates when tapping a different pillar', () => {
    const push = vi.fn();
    executeMobilePillarTap('calendar', '/calendar', { pathname: '/', router: { push } });
    expect(push).toHaveBeenCalledWith('/calendar');
    // Should NOT dispatch refresh when switching apps
    expect(dispatchedEvents).not.toContain('quant:refresh');
  });

  it('executeMobilePillarTap dispatches quant:refresh on re-tap of the active pillar', () => {
    const push = vi.fn();
    executeMobilePillarTap('calendar', '/calendar', {
      pathname: '/calendar?tab=month',
      router: { push },
    });
    // Should NOT navigate when already on the pillar
    expect(push).not.toHaveBeenCalled();
    // Active-tab retap must refresh, never sit dead
    expect(dispatchedEvents).toContain('quant:refresh');
    expect(dispatchedEvents).toContain('quant:pillar-retap');
  });

  it('executeContextTabClick vibrates 10ms on re-tap of active sub-tab (P1-B haptic)', () => {
    const push = vi.fn();
    const pillarConfig = PILLAR_SUB_CONFIGS['calendar'];
    const tab = pillarConfig.tabs[0];
    const targetBase = tab.targetPath || '/calendar';
    if (!tab.queryParam) {
      executeContextTabClick(tab, 'calendar', { pathname: targetBase, router: { push } });
      expect(mockVibrate).toHaveBeenCalledWith(10);
    }
  });

  it('executeContextTabClick does NOT vibrate when switching sub-tabs', () => {
    const push = vi.fn();
    const pillarConfig = PILLAR_SUB_CONFIGS['calendar'];
    const tab = pillarConfig.tabs[1]; // not the first tab
    executeContextTabClick(tab, 'calendar', { pathname: '/other', router: { push } });
    expect(mockVibrate).not.toHaveBeenCalled();
  });
});
