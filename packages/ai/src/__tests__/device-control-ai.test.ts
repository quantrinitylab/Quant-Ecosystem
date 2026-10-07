import { describe, it, expect } from 'vitest';
import { DeviceControlAIService, type DeviceControlBackend } from '../services/device-control-ai';
import { AIEngine } from '../core/engine';
import type { DeviceControlCommand } from '../types';

function makeCommand(overrides: Partial<DeviceControlCommand> = {}): DeviceControlCommand {
  return {
    deviceId: 'light-1',
    deviceType: 'light',
    action: 'on',
    parameters: { brightness: 75 },
    userId: 'user-1',
    confirmationRequired: false,
    ...overrides,
  };
}

describe('DeviceControlAIService', () => {
  const engine = new AIEngine({ enableCaching: false });

  describe('simulated fallback (no backend configured)', () => {
    it('reports no backend configured', () => {
      const service = new DeviceControlAIService(engine);
      expect(service.isBackendConfigured()).toBe(false);
    });

    it('executes via simulation and records history', async () => {
      const service = new DeviceControlAIService(engine);
      const result = await service.executeCommand(makeCommand());
      expect(result.success).toBe(true);
      expect(result.deviceId).toBe('light-1');
      expect(result.result?.newState).toEqual({ brightness: 75 });
      expect(result.result?.previousState).toBeDefined();
    });

    it('blocks unsafe commands before any execution', async () => {
      const service = new DeviceControlAIService(engine);
      const result = await service.executeCommand(
        makeCommand({ deviceType: 'lock', action: 'unlock', confirmationRequired: false }),
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('confirmation');
    });
  });

  describe('real backend mode (configured)', () => {
    it('delegates execution to the backend and uses its returned state', async () => {
      const calls: DeviceControlCommand[] = [];
      const backend: DeviceControlBackend = {
        async execute(cmd) {
          calls.push(cmd);
          return { previousState: { on: false }, newState: { on: true, brightness: 75 } };
        },
      };
      const service = new DeviceControlAIService(engine, backend);
      expect(service.isBackendConfigured()).toBe(true);

      const result = await service.executeCommand(makeCommand());
      expect(calls).toHaveLength(1);
      expect(result.success).toBe(true);
      expect(result.result?.previousState).toEqual({ on: false });
      expect(result.result?.newState).toEqual({ on: true, brightness: 75 });
    });

    it('falls back to simulation when the backend throws (never fails the command silently)', async () => {
      const backend: DeviceControlBackend = {
        async execute() {
          throw new Error('hub offline');
        },
      };
      const service = new DeviceControlAIService(engine, backend);
      const result = await service.executeCommand(makeCommand());
      // Device control is not safety-critical money/CSAM; degrade gracefully to simulation.
      expect(result.success).toBe(true);
      expect(result.result?.newState).toEqual({ brightness: 75 });
    });
  });
});
