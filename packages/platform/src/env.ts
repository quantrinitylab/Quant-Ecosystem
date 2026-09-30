/**
 * Structural description of the host globals the adapters read, plus platform
 * detection. Adapters take a {@link PlatformEnv} (defaulting to `globalThis`) so
 * they can be unit-tested against fakes with no DOM/native runtime.
 */

import type { PlatformName } from './types';

/** Capacitor's injected global (`window.Capacitor`). */
export interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  /** Registered native plugins, keyed by plugin name. */
  Plugins?: Record<string, any>;
}

/**
 * Tauri v2's injected global (`window.__TAURI__`), present when the app is built
 * with `withGlobalTauri: true`. Plugins hang off named keys (e.g. `.notification`,
 * `.fs`, `.dialog`, `.deepLink`); `core.invoke` is the low-level command bridge.
 */
export interface TauriBridge {
  core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  [namespace: string]: any;
}

/** The subset of host globals any adapter may read. All fields are optional. */
export interface PlatformEnv {
  Capacitor?: CapacitorBridge;
  __TAURI__?: TauriBridge;
  /** Tauri sets this even when `withGlobalTauri` is false; used only for detection. */
  __TAURI_INTERNALS__?: unknown;
  navigator?: Navigator;
  localStorage?: Storage;
  Notification?: typeof Notification;
  isSecureContext?: boolean;
  location?: { href: string };
  addEventListener?: (type: string, listener: (event: any) => void) => void;
  removeEventListener?: (type: string, listener: (event: any) => void) => void;
}

/** Read the ambient globals as a {@link PlatformEnv}. */
export function currentEnv(): PlatformEnv {
  return globalThis as unknown as PlatformEnv;
}

/**
 * Decide which platform we are running on. Tauri wins over Capacitor (a Tauri
 * webview never also injects Capacitor), and Capacitor is only claimed when it
 * reports a native (non-web) host — Capacitor also runs in a plain browser
 * during `vite dev`, where the web adapter is the correct choice.
 */
export function detectPlatform(env: PlatformEnv = currentEnv()): PlatformName {
  if (env.__TAURI__ !== undefined || env.__TAURI_INTERNALS__ !== undefined) {
    return 'tauri';
  }
  const cap = env.Capacitor;
  if (cap) {
    const native =
      typeof cap.isNativePlatform === 'function'
        ? cap.isNativePlatform()
        : typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web';
    if (native) {
      return 'capacitor';
    }
  }
  return 'web';
}
