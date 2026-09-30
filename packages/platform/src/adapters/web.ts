/**
 * Web adapter — browser APIs only, no native bridges.
 *
 * Supported here: notifications, share, haptics, secureStore, deepLink.
 * Not meaningful in a plain browser and therefore surfaced as unsupported
 * (their action methods reject with {@link CapabilityUnavailableError}):
 *   - filesystem: the browser has no path-addressable file system.
 *   - camera: headless promise-based capture needs app-owned UI (`<input capture>`).
 *   - biometric: a credential-less prompt is not a web capability (WebAuthn is
 *     app/server-specific).
 */

import { currentEnv, type PlatformEnv } from '../env';
import { CapabilityUnavailableError, type PermissionStatus, type PlatformAdapter } from '../types';

const PLATFORM = 'web' as const;
const SECURE_STORE_PREFIX = 'quant.secure.';

const HAPTIC_DURATION_MS: Record<'light' | 'medium' | 'heavy', number> = {
  light: 10,
  medium: 20,
  heavy: 30,
};

function unavailable(capability: string, detail: string): never {
  throw new CapabilityUnavailableError(capability, PLATFORM, detail);
}

export function createWebAdapter(env: PlatformEnv = currentEnv()): PlatformAdapter {
  return {
    name: PLATFORM,

    notifications: {
      isSupported: () => typeof env.Notification !== 'undefined',
      async requestPermission(): Promise<PermissionStatus> {
        const Notif = env.Notification;
        if (typeof Notif === 'undefined') {
          unavailable('notifications', 'Notification API absent');
        }
        const result = await Notif.requestPermission();
        return result === 'default' ? 'prompt' : result;
      },
      async show(notification): Promise<void> {
        const Notif = env.Notification;
        if (typeof Notif === 'undefined') {
          unavailable('notifications', 'Notification API absent');
        }
        new Notif(notification.title, { body: notification.body });
      },
    },

    share: {
      isSupported: () => typeof env.navigator?.share === 'function',
      async share(content): Promise<void> {
        const nav = env.navigator;
        if (!nav || typeof nav.share !== 'function') {
          unavailable('share', 'navigator.share absent');
        }
        await nav.share(content);
      },
    },

    filesystem: {
      isSupported: () => false,
      readTextFile: async () =>
        unavailable('filesystem', 'no path-based file system in the browser'),
      writeTextFile: async () =>
        unavailable('filesystem', 'no path-based file system in the browser'),
      deleteFile: async () => unavailable('filesystem', 'no path-based file system in the browser'),
    },

    biometric: {
      isAvailable: async () => false,
      authenticate: async () =>
        unavailable('biometric', 'web biometric requires an app/server WebAuthn flow'),
    },

    haptics: {
      isSupported: () => typeof env.navigator?.vibrate === 'function',
      async impact(style = 'medium'): Promise<void> {
        const nav = env.navigator;
        if (!nav || typeof nav.vibrate !== 'function') {
          unavailable('haptics', 'navigator.vibrate absent');
        }
        nav.vibrate(HAPTIC_DURATION_MS[style]);
      },
    },

    camera: {
      isSupported: () => false,
      capturePhoto: async () =>
        unavailable('camera', 'browser capture needs app-owned <input capture> UI'),
    },

    // NOTE: web secureStore is localStorage-backed and is NOT hardware-secured or
    // encrypted. It provides persistence parity only; never treat it as a vault
    // for high-value secrets on the web surface.
    secureStore: {
      isSupported: () => typeof env.localStorage !== 'undefined',
      async get(key): Promise<string | null> {
        const ls = env.localStorage;
        if (typeof ls === 'undefined') {
          unavailable('secureStore', 'localStorage absent');
        }
        return ls.getItem(SECURE_STORE_PREFIX + key);
      },
      async set(key, value): Promise<void> {
        const ls = env.localStorage;
        if (typeof ls === 'undefined') {
          unavailable('secureStore', 'localStorage absent');
        }
        ls.setItem(SECURE_STORE_PREFIX + key, value);
      },
      async remove(key): Promise<void> {
        const ls = env.localStorage;
        if (typeof ls === 'undefined') {
          unavailable('secureStore', 'localStorage absent');
        }
        ls.removeItem(SECURE_STORE_PREFIX + key);
      },
    },

    deepLink: {
      isSupported: () =>
        typeof env.addEventListener === 'function' && typeof env.location?.href === 'string',
      async getLaunchUrl(): Promise<string | null> {
        return env.location?.href ?? null;
      },
      addListener(listener): () => void {
        const add = env.addEventListener;
        const remove = env.removeEventListener;
        if (typeof add !== 'function') {
          return () => {};
        }
        const handler = (): void => {
          const href = env.location?.href;
          if (href) {
            listener(href);
          }
        };
        add('popstate', handler);
        add('hashchange', handler);
        return () => {
          if (typeof remove === 'function') {
            remove('popstate', handler);
            remove('hashchange', handler);
          }
        };
      },
    },
  };
}
