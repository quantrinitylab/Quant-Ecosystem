// @vitest-environment node
/**
 * Dead Quanty dispatch branch removal (finding 2026-10-12, mobile-nav).
 *
 * `executeContextTabClick` used to carry a second Quanty arm,
 * `tab.id === 'quanty' && pillar === 'quantgit'`, dispatching
 * `quant:copilot:open` + `quant:quanty:open`. That arm was dead and
 * contract-breaking:
 *   - No quantgit pillar tab has id 'quanty' (only 'repositories' and
 *     'overview'), and the bar only ever passes tabs from
 *     PILLAR_SUB_CONFIGS[pillar], so it could never fire through a
 *     rendered tab.
 *   - The only 'quanty' tab in any config (mail) carries `opensQuanty` and
 *     returns via the earlier arm, so the quantgit arm was unreachable
 *     even for a hypothetical id match.
 *   - Unlike the `opensQuanty` arm it did NOT return: had it ever fired it
 *     would have fallen through to `quant:subtab-change` + navigation,
 *     breaking the Quanty tab's never-navigates contract.
 *
 * The arm is removed; `opensQuanty` is the single Quanty path. These tests
 * pin that invariant: if a future config adds a Quanty tab without
 * `opensQuanty`, the config test fails and forces the `opensQuanty` pattern
 * instead of a new dispatch arm.
 *
 * NOTE on the finding's stale half: the finding also claimed the `logoOnly`
 * render branch was unreachable. That half is outdated — the mail pillar
 * wires a logoOnly Quanty tab (QM-MOBILE-QUANTY-TAB) and the render path
 * paints the Quanty mark for it. Only the dead dispatch arm is removed;
 * the live `logoOnly` render path stays.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Same window/navigator/document stubs as mobile-quanty-tab.test.ts:
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

import * as mobile from '../components/ContextBottomNavBar';

describe('Dead Quanty dispatch branch removal', () => {
  beforeEach(() => {
    dispatchedEvents.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('quantgit pillar has no quanty tab — the removed arm had no rendered input', () => {
    const ids = mobile.PILLAR_SUB_CONFIGS.quantgit.tabs.map((t) => t.id);
    expect(ids).toEqual(['repositories', 'overview']);
    expect(ids).not.toContain('quanty');
  });

  it('every quanty-id tab in every pillar carries opensQuanty (the single Quanty path)', () => {
    const quantyTabs = (Object.values(mobile.PILLAR_SUB_CONFIGS) as Array<{
      tabs: typeof mobile.PILLAR_SUB_CONFIGS.mail.tabs;
    }>).flatMap((config) => config.tabs.filter((t) => t.id === 'quanty'));
    // Exactly one Quanty tab exists, in mail — and it uses opensQuanty.
    expect(quantyTabs).toHaveLength(1);
    for (const tab of quantyTabs) {
      expect(tab.opensQuanty).toBe(true);
      expect(tab.logoOnly).toBe(true);
      expect(tab.targetPath).toBeUndefined();
    }
  });

  it('a non-opensQuanty quanty-id tab under quantgit no longer fires the phantom cockpit events', () => {
    const push = vi.fn();
    const onQuantyOpen = vi.fn();
    // A bare tab object with id 'quanty' but no opensQuanty: before the fix
    // the removed arm dispatched both cockpit events for it under quantgit.
    mobile.executeContextTabClick(
      { id: 'quanty', label: 'Quanty', icon: () => null },
      'quantgit',
      { pathname: '/', router: { push }, onQuantyOpen },
    );
    expect(dispatchedEvents).not.toContain('quant:copilot:open');
    expect(dispatchedEvents).not.toContain('quant:quanty:open');
    expect(onQuantyOpen).not.toHaveBeenCalled();
    // It is treated as an ordinary nav tab instead: subtab-change + navigate.
    expect(dispatchedEvents).toContain('quant:subtab-change');
    expect(push).toHaveBeenCalledWith('/quantgit');
  });

  it('the real mail Quanty tab still opens the cockpit and never navigates', () => {
    const push = vi.fn();
    const onQuantyOpen = vi.fn();
    const quanty = mobile.PILLAR_SUB_CONFIGS.mail.tabs.find((t) => t.id === 'quanty')!;
    mobile.executeContextTabClick(quanty, 'mail', {
      pathname: '/',
      router: { push },
      onQuantyOpen,
    });
    expect(onQuantyOpen).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(dispatchedEvents).toContain('quant:quanty:open');
    expect(dispatchedEvents).toContain('quant:copilot:open');
    expect(dispatchedEvents).not.toContain('quant:subtab-change');
  });
});
