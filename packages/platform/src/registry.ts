/**
 * Platform selection. {@link getPlatform} lazily detects the host and caches a
 * single adapter for the session; {@link setPlatform}/{@link resetPlatform} let
 * tests (or a shell that already knows its host) override the choice.
 */

import { createCapacitorAdapter } from './adapters/capacitor';
import { createTauriAdapter } from './adapters/tauri';
import { createWebAdapter } from './adapters/web';
import { currentEnv, detectPlatform, type PlatformEnv } from './env';
import type { PlatformAdapter, PlatformName } from './types';

/** Build the adapter for an explicit platform, injecting an env for tests. */
export function createPlatformAdapter(
  name: PlatformName,
  env: PlatformEnv = currentEnv(),
): PlatformAdapter {
  switch (name) {
    case 'tauri':
      return createTauriAdapter(env);
    case 'capacitor':
      return createCapacitorAdapter(env);
    case 'web':
    default:
      return createWebAdapter(env);
  }
}

let active: PlatformAdapter | null = null;

/** The active adapter for this session, detected and cached on first call. */
export function getPlatform(env: PlatformEnv = currentEnv()): PlatformAdapter {
  if (!active) {
    active = createPlatformAdapter(detectPlatform(env), env);
  }
  return active;
}

/** Override the active adapter (dependency injection / tests). */
export function setPlatform(adapter: PlatformAdapter): void {
  active = adapter;
}

/** Clear the cached adapter so the next {@link getPlatform} re-detects. */
export function resetPlatform(): void {
  active = null;
}
