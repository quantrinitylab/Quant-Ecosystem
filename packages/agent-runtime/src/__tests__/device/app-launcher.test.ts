import { describe, it, expect } from 'vitest';
import { AppLauncher } from '../../device/app-launcher.js';

describe('AppLauncher', () => {
  const testApps = [
    { name: 'Safari', bundleId: 'com.apple.safari', deepLink: 'safari://', installed: true },
    { name: 'Maps', bundleId: 'com.apple.maps', deepLink: 'maps://', installed: true },
    { name: 'TestApp', bundleId: 'com.test.app', deepLink: 'testapp://', installed: false },
  ];

  it('launches installed app by name', async () => {
    const launcher = new AppLauncher(testApps);
    const result = await launcher.launch('Safari');
    expect(result.success).toBe(true);
    expect(result.appName).toBe('Safari');
  });

  it('fails to launch uninstalled app', async () => {
    const launcher = new AppLauncher(testApps);
    const result = await launcher.launch('TestApp');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not installed');
  });

  it('fails to launch unknown app', async () => {
    const launcher = new AppLauncher(testApps);
    const result = await launcher.launch('Unknown');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('launches by deep link', async () => {
    const launcher = new AppLauncher(testApps);
    const result = await launcher.launchByDeepLink('maps://directions');
    expect(result.success).toBe(true);
    expect(result.appName).toBe('Maps');
    expect(result.method).toBe('deepLink');
  });

  it('fails deep link for unknown scheme', async () => {
    const launcher = new AppLauncher(testApps);
    const result = await launcher.launchByDeepLink('unknown://path');
    expect(result.success).toBe(false);
    expect(result.error).toContain('No app registered');
  });

  it('gets installed apps', () => {
    const launcher = new AppLauncher(testApps);
    const installed = launcher.getInstalledApps();
    expect(installed).toHaveLength(2);
    expect(installed.every((a) => a.installed)).toBe(true);
  });

  it('tracks running apps', async () => {
    const launcher = new AppLauncher(testApps);
    expect(launcher.isAppRunning('Safari')).toBe(false);

    await launcher.launch('Safari');
    expect(launcher.isAppRunning('Safari')).toBe(true);

    launcher.stopApp('Safari');
    expect(launcher.isAppRunning('Safari')).toBe(false);
  });

  it('registers new apps', () => {
    const launcher = new AppLauncher();
    launcher.registerApp({
      name: 'NewApp',
      bundleId: 'com.new.app',
      deepLink: 'newapp://',
      installed: true,
    });
    expect(launcher.getRegisteredApps()).toHaveLength(1);
  });
});
