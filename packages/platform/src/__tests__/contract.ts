/**
 * Shared cross-platform contract. Every adapter, regardless of host, must:
 *   - report its platform name and expose the full capability shape;
 *   - reject each action method with {@link CapabilityUnavailableError} when the
 *     underlying bridge is absent (a "bare" env);
 *   - report `false`/`null`/no-op from probes rather than throwing.
 * Per-platform `*.test.ts` files add the wired behaviour on top of this.
 */

import { describe, expect, it } from 'vitest';

import type { PlatformEnv } from '../env';
import { CapabilityUnavailableError, type PlatformAdapter, type PlatformName } from '../types';

/** Assert the thunk's promise rejects with a CapabilityUnavailableError for `capability`. */
export async function expectUnavailable(
  capability: string,
  run: () => Promise<unknown>,
): Promise<void> {
  let error: unknown;
  try {
    await run();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(CapabilityUnavailableError);
  expect((error as CapabilityUnavailableError).capability).toBe(capability);
}

/** Assert every capability namespace and method exists with the right type. */
export function expectAdapterShape(adapter: PlatformAdapter, name: PlatformName): void {
  expect(adapter.name).toBe(name);

  expect(typeof adapter.notifications.isSupported).toBe('function');
  expect(typeof adapter.notifications.requestPermission).toBe('function');
  expect(typeof adapter.notifications.show).toBe('function');

  expect(typeof adapter.share.isSupported).toBe('function');
  expect(typeof adapter.share.share).toBe('function');

  expect(typeof adapter.filesystem.isSupported).toBe('function');
  expect(typeof adapter.filesystem.readTextFile).toBe('function');
  expect(typeof adapter.filesystem.writeTextFile).toBe('function');
  expect(typeof adapter.filesystem.deleteFile).toBe('function');

  expect(typeof adapter.biometric.isAvailable).toBe('function');
  expect(typeof adapter.biometric.authenticate).toBe('function');

  expect(typeof adapter.haptics.isSupported).toBe('function');
  expect(typeof adapter.haptics.impact).toBe('function');

  expect(typeof adapter.camera.isSupported).toBe('function');
  expect(typeof adapter.camera.capturePhoto).toBe('function');

  expect(typeof adapter.secureStore.isSupported).toBe('function');
  expect(typeof adapter.secureStore.get).toBe('function');
  expect(typeof adapter.secureStore.set).toBe('function');
  expect(typeof adapter.secureStore.remove).toBe('function');

  expect(typeof adapter.deepLink.isSupported).toBe('function');
  expect(typeof adapter.deepLink.getLaunchUrl).toBe('function');
  expect(typeof adapter.deepLink.addListener).toBe('function');
}

/** Run the bare-env contract for one adapter factory. */
export function runBareEnvContract(
  name: PlatformName,
  factory: (env: PlatformEnv) => PlatformAdapter,
): void {
  describe(`${name} adapter — bare-env contract`, () => {
    const adapter = factory({});

    it('reports its name and the full capability shape', () => {
      expectAdapterShape(adapter, name);
    });

    it('rejects every action method with CapabilityUnavailableError', async () => {
      await expectUnavailable('notifications', () => adapter.notifications.requestPermission());
      await expectUnavailable('notifications', () => adapter.notifications.show({ title: 't' }));
      await expectUnavailable('share', () => adapter.share.share({ title: 't' }));
      await expectUnavailable('filesystem', () => adapter.filesystem.readTextFile('p'));
      await expectUnavailable('filesystem', () => adapter.filesystem.writeTextFile('p', 'c'));
      await expectUnavailable('filesystem', () => adapter.filesystem.deleteFile('p'));
      await expectUnavailable('biometric', () => adapter.biometric.authenticate('r'));
      await expectUnavailable('haptics', () => adapter.haptics.impact());
      await expectUnavailable('camera', () => adapter.camera.capturePhoto());
      await expectUnavailable('secureStore', () => adapter.secureStore.get('k'));
      await expectUnavailable('secureStore', () => adapter.secureStore.set('k', 'v'));
      await expectUnavailable('secureStore', () => adapter.secureStore.remove('k'));
    });

    it('probes report unsupported, and safe fallbacks do not throw', async () => {
      expect(adapter.notifications.isSupported()).toBe(false);
      expect(adapter.share.isSupported()).toBe(false);
      expect(adapter.filesystem.isSupported()).toBe(false);
      expect(adapter.haptics.isSupported()).toBe(false);
      expect(adapter.camera.isSupported()).toBe(false);
      expect(adapter.secureStore.isSupported()).toBe(false);
      expect(adapter.deepLink.isSupported()).toBe(false);

      await expect(adapter.biometric.isAvailable()).resolves.toBe(false);
      await expect(adapter.deepLink.getLaunchUrl()).resolves.toBeNull();

      const unsubscribe = adapter.deepLink.addListener(() => {});
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
}
