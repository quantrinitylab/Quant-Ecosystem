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
});
