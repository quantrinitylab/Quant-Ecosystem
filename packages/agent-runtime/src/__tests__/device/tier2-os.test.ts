import { describe, it, expect } from 'vitest';
import { Tier2OsController } from '../../device/tier2-os.js';

describe('Tier2OsController', () => {
  it('detects platform', () => {
    const controller = new Tier2OsController('ios');
    expect(controller.getPlatform()).toBe('ios');
  });

  it('defaults to desktop platform', () => {
    const controller = new Tier2OsController();
    expect(controller.getPlatform()).toBe('desktop');
  });

  it('executes OS command', async () => {
    const controller = new Tier2OsController('desktop');
    const result = await controller.executeOsCommand('ls -la');
    expect(result.success).toBe(true);
    expect(result.platform).toBe('desktop');
    expect(result.exitCode).toBe(0);
  });

  it('returns system info for ios', () => {
    const controller = new Tier2OsController('ios');
    const info = controller.getSystemInfo();
    expect(info.platform).toBe('ios');
    expect(info.osVersion).toBe('17.0');
    expect(info.deviceModel).toBe('iPhone 15');
    expect(info.availableMemoryMb).toBeGreaterThan(0);
    expect(info.batteryLevel).toBeGreaterThan(0);
  });

  it('returns system info for android', () => {
    const controller = new Tier2OsController('android');
    const info = controller.getSystemInfo();
    expect(info.platform).toBe('android');
    expect(info.deviceModel).toBe('Pixel 8');
  });

  it('opens a URL', async () => {
    const controller = new Tier2OsController('desktop');
    const result = await controller.openUrl('https://example.com');
    expect(result.success).toBe(true);
    expect(result.output).toContain('xdg-open');
  });

  it('opens URL with platform-specific commands', async () => {
    const iosController = new Tier2OsController('ios');
    const result = await iosController.openUrl('https://example.com');
    expect(result.output).toContain('Safari');
  });

  it('sets and gets clipboard', async () => {
    const controller = new Tier2OsController('desktop');
    await controller.setClipboard('Hello World');
    expect(controller.getClipboard()).toBe('Hello World');
  });
});
