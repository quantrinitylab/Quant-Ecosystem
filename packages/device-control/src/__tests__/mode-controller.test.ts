import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhoneFreeModeController } from '../phone-free/mode-controller.js';
import type { BiometricAuthProvider, PhoneFreeConfig } from '../phone-free/types.js';

function mockBiometric(result: boolean): BiometricAuthProvider {
  return { authenticate: async () => result };
}

const defaultConfig: PhoneFreeConfig = {
  timeout: 0,
  emergencyContacts: [{ id: '1', name: 'Mom', phone: '+15551234567', relationship: 'parent' }],
  panicPhrase: 'Quant, emergency',
};

describe('PhoneFreeModeController', () => {
  let controller: PhoneFreeModeController;

  beforeEach(() => {
    controller = new PhoneFreeModeController(defaultConfig);
  });

  it('starts disabled', () => {
    expect(controller.getState().enabled).toBe(false);
  });

  it('enables with biometric success', async () => {
    const ok = await controller.enable(mockBiometric(true));
    expect(ok).toBe(true);
    expect(controller.getState().enabled).toBe(true);
    expect(controller.getState().sessionId).toBeTruthy();
  });

  it('rejects enable with biometric failure', async () => {
    const ok = await controller.enable(mockBiometric(false));
    expect(ok).toBe(false);
    expect(controller.getState().enabled).toBe(false);
  });

  it('disables with biometric success', async () => {
    await controller.enable(mockBiometric(true));
    const ok = await controller.disable(mockBiometric(true));
    expect(ok).toBe(true);
    expect(controller.getState().enabled).toBe(false);
  });

  it('rejects disable with biometric failure', async () => {
    await controller.enable(mockBiometric(true));
    const ok = await controller.disable(mockBiometric(false));
    expect(ok).toBe(false);
    expect(controller.getState().enabled).toBe(true);
  });

  it('emits enabled/disabled events', async () => {
    const events: string[] = [];
    controller.on('enabled', () => events.push('enabled'));
    controller.on('disabled', () => events.push('disabled'));
    await controller.enable(mockBiometric(true));
    await controller.disable(mockBiometric(true));
    expect(events).toEqual(['enabled', 'disabled']);
  });

  it('auto-timeout disables mode', async () => {
    vi.useFakeTimers();
    const timedConfig = { ...defaultConfig, timeout: 1000 };
    const ctrl = new PhoneFreeModeController(timedConfig);
    const events: string[] = [];
    ctrl.on('timeout', () => events.push('timeout'));
    await ctrl.enable(mockBiometric(true));
    expect(ctrl.getState().enabled).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(ctrl.getState().enabled).toBe(false);
    expect(events).toEqual(['timeout']);
    vi.useRealTimers();
  });

  it('returns false if already enabled (double-enable guard)', async () => {
    await controller.enable(mockBiometric(true));
    expect(controller.getState().enabled).toBe(true);
    const second = await controller.enable(mockBiometric(true));
    expect(second).toBe(false);
  });

  it('removes listener with off', async () => {
    const events: string[] = [];
    const listener = () => events.push('enabled');
    controller.on('enabled', listener);
    controller.off('enabled', listener);
    await controller.enable(mockBiometric(true));
    expect(events).toEqual([]);
  });
});
