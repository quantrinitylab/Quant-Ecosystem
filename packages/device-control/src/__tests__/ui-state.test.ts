import { describe, it, expect } from 'vitest';
import { PhoneFreeUIState } from '../phone-free/ui-state.js';
import type { PhoneFreeState } from '../phone-free/types.js';

describe('PhoneFreeUIState', () => {
  const ui = new PhoneFreeUIState();

  const enabledState: PhoneFreeState = {
    enabled: true,
    activatedAt: Date.now(),
    config: { timeout: 0, emergencyContacts: [], panicPhrase: 'Quant, emergency' },
    sessionId: 'test-session',
  };

  const disabledState: PhoneFreeState = {
    enabled: false,
    activatedAt: null,
    config: { timeout: 0, emergencyContacts: [], panicPhrase: 'Quant, emergency' },
    sessionId: null,
  };

  it('shows limited elements when enabled', () => {
    const v = ui.getVisibility(enabledState);
    expect(v.visibleElements).toEqual(['quantLiveOrb', 'emergencyButton', 'clock', 'battery']);
    expect(v.hiddenElements).toEqual(['appDrawer', 'notifications', 'settings']);
  });

  it('shows all elements when disabled', () => {
    const v = ui.getVisibility(disabledState);
    expect(v.visibleElements).toContain('appDrawer');
    expect(v.visibleElements).toContain('notifications');
    expect(v.hiddenElements).toEqual([]);
  });

  it('voice accessible includes all capabilities regardless of state', () => {
    const vEnabled = ui.getVisibility(enabledState);
    const vDisabled = ui.getVisibility(disabledState);
    expect(vEnabled.voiceAccessible.length).toBeGreaterThan(0);
    expect(vEnabled.voiceAccessible).toEqual(vDisabled.voiceAccessible);
  });
});
