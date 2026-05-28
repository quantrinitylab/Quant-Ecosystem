import { VoiceFirstMode } from '../mode/voice-first-mode.js';
import { CommandRegistry } from '../commands/command-registry.js';
import { ElderMode } from '../elder/elder-mode.js';
describe('VoiceFirstMode', () => {
  it('enable/disable, lock screen, ambient context, routing', () => {
    const m = new VoiceFirstMode();
    expect(m.isEnabled()).toBe(false);
    m.enable();
    expect(m.routeInteraction('hi')).toBe('voice');
    m.disable();
    expect(m.routeInteraction('hi')).toBe('standard');
    expect(m.activateFromLockScreen()).toBe(true);
    m.setAmbientContext({ type: 'driving', confidence: 0.9 });
    expect(m.getAmbientContext()?.type).toBe('driving');
  });
});
describe('CommandRegistry', () => {
  it('100 commands, 10 categories, execute', () => {
    const r = new CommandRegistry();
    expect(r.getCoverage()).toEqual({ total: 100, categories: 10 });
    expect(r.getByCategory('communication').length).toBe(10);
    expect(r.execute('call mom')).toBe('cmd-0-0');
    expect(r.execute('unknown')).toBeNull();
  });
});
describe('ElderMode', () => {
  it('enable/disable, emergency, family config, fallback UI', () => {
    const e = new ElderMode();
    // prettier-ignore
    e.enable({ enabled: true, fontSize: 'xlarge', emergencyContact: '911', familyRemoteEnabled: false });
    expect(e.triggerEmergency()).toBe('911');
    e.updateFamilyConfig({ familyRemoteEnabled: true });
    expect(e.getConfig()?.familyRemoteEnabled).toBe(true);
    expect(e.getFallbackUI()).toEqual({ mode: 'large-buttons', fontSize: 'xlarge' });
    e.disable();
    expect(e.isEnabled()).toBe(false);
  });
});
