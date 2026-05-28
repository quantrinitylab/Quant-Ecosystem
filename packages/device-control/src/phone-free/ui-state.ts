import type { UIVisibility, PhoneFreeState } from './types.js';

const ALL_ELEMENTS = [
  'quantLiveOrb',
  'emergencyButton',
  'clock',
  'battery',
  'appDrawer',
  'notifications',
  'settings',
];
const ENABLED_VISIBLE = ['quantLiveOrb', 'emergencyButton', 'clock', 'battery'];
const ENABLED_HIDDEN = ['appDrawer', 'notifications', 'settings'];
const ALL_CAPABILITIES = [
  'calls',
  'messages',
  'search',
  'navigation',
  'media',
  'settings',
  'emergency',
];

export class PhoneFreeUIState {
  getVisibility(state: PhoneFreeState): UIVisibility {
    if (state.enabled) {
      return {
        visibleElements: [...ENABLED_VISIBLE],
        hiddenElements: [...ENABLED_HIDDEN],
        voiceAccessible: [...ALL_CAPABILITIES],
      };
    }
    return {
      visibleElements: [...ALL_ELEMENTS],
      hiddenElements: [],
      voiceAccessible: [...ALL_CAPABILITIES],
    };
  }
}
