/**
 * Tauri v2 adapter — routes to plugins hung off `window.__TAURI__.<namespace>`
 * (present when the app is built with `withGlobalTauri: true`).
 *
 * Each capability feature-detects its namespace (and method) and degrades to
 * {@link CapabilityUnavailableError} when absent, so a desktop build that omits
 * a plugin still loads. No `@tauri-apps/*` package is imported directly — the
 * adapter reads the injected bridge — so `@quant/platform` builds with no Tauri
 * runtime and stays unit-testable against fakes.
 *
 * First-class desktop namespaces: notification, fs, biometric, deepLink, store.
 * share / haptics / camera are feature-detected (desktop hosts usually lack
 * them; Tauri mobile may provide them) and otherwise surfaced as unsupported.
 */

import { currentEnv, type PlatformEnv } from '../env';
import {
  CapabilityUnavailableError,
  type HapticStyle,
  type PermissionStatus,
  type PlatformAdapter,
} from '../types';

const PLATFORM = 'tauri' as const;
const SECURE_STORE_PREFIX = 'quant.secure.';
const SECURE_STORE_FILE = 'quant-secure.store';

const HAPTIC_STYLE: Record<HapticStyle, string> = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
};

function unavailable(capability: string, detail: string): never {
  throw new CapabilityUnavailableError(capability, PLATFORM, detail);
}

export function createTauriAdapter(env: PlatformEnv = currentEnv()): PlatformAdapter {
  const ns = (name: string): any => env.__TAURI__?.[name];

  return {
    name: PLATFORM,

    notifications: {
      isSupported: () => Boolean(ns('notification')),
      async requestPermission(): Promise<PermissionStatus> {
        const notif = ns('notification');
        if (!notif) {
          unavailable('notifications', 'notification plugin not present');
        }
        if (
          typeof notif.isPermissionGranted === 'function' &&
          (await notif.isPermissionGranted())
        ) {
          return 'granted';
        }
        if (typeof notif.requestPermission !== 'function') {
          unavailable('notifications', 'notification plugin cannot request permission');
        }
        const result = await notif.requestPermission();
        if (result === 'granted') return 'granted';
        if (result === 'denied') return 'denied';
        return 'prompt';
      },
      async show(notification): Promise<void> {
        const notif = ns('notification');
        if (!notif || typeof notif.sendNotification !== 'function') {
          unavailable('notifications', 'notification plugin not present');
        }
        notif.sendNotification({ title: notification.title, body: notification.body });
      },
    },

    share: {
      isSupported: () => typeof ns('share')?.share === 'function',
      async share(content): Promise<void> {
        const share = ns('share');
        if (!share || typeof share.share !== 'function') {
          unavailable('share', 'no share plugin on the Tauri host');
        }
        await share.share(content);
      },
    },

    filesystem: {
      isSupported: () => Boolean(ns('fs')),
      async readTextFile(path): Promise<string> {
        const fs = ns('fs');
        if (!fs || typeof fs.readTextFile !== 'function') {
          unavailable('filesystem', 'fs plugin not present');
        }
        return String(await fs.readTextFile(path));
      },
      async writeTextFile(path, contents): Promise<void> {
        const fs = ns('fs');
        if (!fs || typeof fs.writeTextFile !== 'function') {
          unavailable('filesystem', 'fs plugin not present');
        }
        await fs.writeTextFile(path, contents);
      },
      async deleteFile(path): Promise<void> {
        const fs = ns('fs');
        if (!fs || typeof fs.remove !== 'function') {
          unavailable('filesystem', 'fs plugin not present');
        }
        await fs.remove(path);
      },
    },

    biometric: {
      async isAvailable(): Promise<boolean> {
        const bio = ns('biometric');
        if (!bio || typeof bio.checkStatus !== 'function') {
          return false;
        }
        try {
          const status = await bio.checkStatus();
          return Boolean(status?.isAvailable);
        } catch {
          return false;
        }
      },
      async authenticate(reason): Promise<boolean> {
        const bio = ns('biometric');
        if (!bio || typeof bio.authenticate !== 'function') {
          unavailable('biometric', 'biometric plugin not present');
        }
        try {
          await bio.authenticate(reason);
          return true;
        } catch {
          return false;
        }
      },
    },

    haptics: {
      isSupported: () => typeof ns('haptics')?.impact === 'function',
      async impact(style = 'medium'): Promise<void> {
        const haptics = ns('haptics');
        if (!haptics || typeof haptics.impact !== 'function') {
          unavailable('haptics', 'no haptics on the Tauri host');
        }
        await haptics.impact({ style: HAPTIC_STYLE[style] });
      },
    },

    camera: {
      isSupported: () => typeof ns('camera')?.getPhoto === 'function',
      async capturePhoto() {
        const camera = ns('camera');
        if (!camera || typeof camera.getPhoto !== 'function') {
          unavailable('camera', 'no camera plugin on the Tauri host');
        }
        const result = await camera.getPhoto({ resultType: 'dataUrl' });
        const dataUrl = result?.dataUrl;
        if (typeof dataUrl !== 'string') {
          unavailable('camera', 'camera returned no dataUrl');
        }
        return { dataUrl, format: String(result?.format ?? 'jpeg').toLowerCase() };
      },
    },

    // NOTE: the Tauri store plugin persists to a plain on-disk file and is NOT
    // encrypted or OS-keychain-backed. It provides persistence parity only;
    // never treat it as a vault for high-value secrets on the desktop surface.
    secureStore: {
      isSupported: () => typeof ns('store')?.load === 'function',
      async get(key): Promise<string | null> {
        const store = ns('store');
        if (!store || typeof store.load !== 'function') {
          unavailable('secureStore', 'store plugin not present');
        }
        const handle = await store.load(SECURE_STORE_FILE);
        const value = await handle.get(SECURE_STORE_PREFIX + key);
        return value ?? null;
      },
      async set(key, value): Promise<void> {
        const store = ns('store');
        if (!store || typeof store.load !== 'function') {
          unavailable('secureStore', 'store plugin not present');
        }
        const handle = await store.load(SECURE_STORE_FILE);
        await handle.set(SECURE_STORE_PREFIX + key, value);
        if (typeof handle.save === 'function') {
          await handle.save();
        }
      },
      async remove(key): Promise<void> {
        const store = ns('store');
        if (!store || typeof store.load !== 'function') {
          unavailable('secureStore', 'store plugin not present');
        }
        const handle = await store.load(SECURE_STORE_FILE);
        if (typeof handle.delete === 'function') {
          await handle.delete(SECURE_STORE_PREFIX + key);
        }
        if (typeof handle.save === 'function') {
          await handle.save();
        }
      },
    },

    deepLink: {
      isSupported: () => Boolean(ns('deepLink')),
      async getLaunchUrl(): Promise<string | null> {
        const dl = ns('deepLink');
        if (!dl || typeof dl.getCurrent !== 'function') {
          return null;
        }
        const urls = await dl.getCurrent();
        if (!Array.isArray(urls) || urls.length === 0) {
          return null;
        }
        return urls[0] ?? null;
      },
      addListener(listener): () => void {
        const dl = ns('deepLink');
        if (!dl || typeof dl.onOpenUrl !== 'function') {
          return () => {};
        }
        const unlistenPromise = Promise.resolve(
          dl.onOpenUrl((urls: string[]) => {
            if (Array.isArray(urls)) {
              for (const url of urls) {
                if (url) {
                  listener(url);
                }
              }
            }
          }),
        );
        return () => {
          unlistenPromise
            .then((unlisten) => {
              if (typeof unlisten === 'function') {
                unlisten();
              }
            })
            .catch(() => {});
        };
      },
    },
  };
}
