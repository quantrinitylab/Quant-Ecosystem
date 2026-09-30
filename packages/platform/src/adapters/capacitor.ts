/**
 * Capacitor adapter — routes to native plugins injected on `window.Capacitor.Plugins`.
 *
 * Every capability feature-detects its plugin (and the specific method) and
 * degrades to {@link CapabilityUnavailableError} when the plugin is not
 * registered in the running app, so a build that omits a plugin still loads.
 * The adapter never imports `@capacitor/*` packages directly — it reads them
 * off the injected bridge — so `@quant/platform` builds with no native SDKs
 * present and stays unit-testable against fakes.
 *
 * Plugin names are the conventional ones apps register:
 *   LocalNotifications (@capacitor/local-notifications), Share (@capacitor/share),
 *   Filesystem (@capacitor/filesystem), Haptics (@capacitor/haptics),
 *   Camera (@capacitor/camera), App (@capacitor/app, for deep links),
 *   SecureStoragePlugin (@capacitor-community/secure-storage-plugin),
 *   NativeBiometric (capacitor-native-biometric).
 */

import { currentEnv, type PlatformEnv } from '../env';
import {
  CapabilityUnavailableError,
  type HapticStyle,
  type PermissionStatus,
  type PlatformAdapter,
} from '../types';

const PLATFORM = 'capacitor' as const;
const SECURE_STORE_PREFIX = 'quant.secure.';

const HAPTIC_STYLE: Record<HapticStyle, string> = {
  light: 'LIGHT',
  medium: 'MEDIUM',
  heavy: 'HEAVY',
};

function unavailable(capability: string, detail: string): never {
  throw new CapabilityUnavailableError(capability, PLATFORM, detail);
}

/** Capacitor requires a 32-bit int notification id; derive one from the caller's string id. */
function toNumericId(id?: string): number {
  if (!id) {
    return Math.floor(Math.random() * 2_000_000_000) + 1;
  }
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

export function createCapacitorAdapter(env: PlatformEnv = currentEnv()): PlatformAdapter {
  const plugin = (name: string): any => env.Capacitor?.Plugins?.[name];

  return {
    name: PLATFORM,

    notifications: {
      isSupported: () => Boolean(plugin('LocalNotifications')),
      async requestPermission(): Promise<PermissionStatus> {
        const ln = plugin('LocalNotifications');
        if (!ln || typeof ln.requestPermissions !== 'function') {
          unavailable('notifications', 'LocalNotifications plugin not registered');
        }
        const result = await ln.requestPermissions();
        const display = result?.display;
        if (display === 'granted') return 'granted';
        if (display === 'denied') return 'denied';
        return 'prompt';
      },
      async show(notification): Promise<void> {
        const ln = plugin('LocalNotifications');
        if (!ln || typeof ln.schedule !== 'function') {
          unavailable('notifications', 'LocalNotifications plugin not registered');
        }
        await ln.schedule({
          notifications: [
            {
              id: toNumericId(notification.id),
              title: notification.title,
              body: notification.body ?? '',
            },
          ],
        });
      },
    },

    share: {
      isSupported: () => Boolean(plugin('Share')),
      async share(content): Promise<void> {
        const share = plugin('Share');
        if (!share || typeof share.share !== 'function') {
          unavailable('share', 'Share plugin not registered');
        }
        await share.share(content);
      },
    },

    filesystem: {
      isSupported: () => Boolean(plugin('Filesystem')),
      async readTextFile(path): Promise<string> {
        const fs = plugin('Filesystem');
        if (!fs || typeof fs.readFile !== 'function') {
          unavailable('filesystem', 'Filesystem plugin not registered');
        }
        const result = await fs.readFile({ path, encoding: 'utf8' });
        return String(result?.data ?? '');
      },
      async writeTextFile(path, contents): Promise<void> {
        const fs = plugin('Filesystem');
        if (!fs || typeof fs.writeFile !== 'function') {
          unavailable('filesystem', 'Filesystem plugin not registered');
        }
        await fs.writeFile({ path, data: contents, encoding: 'utf8' });
      },
      async deleteFile(path): Promise<void> {
        const fs = plugin('Filesystem');
        if (!fs || typeof fs.deleteFile !== 'function') {
          unavailable('filesystem', 'Filesystem plugin not registered');
        }
        await fs.deleteFile({ path });
      },
    },

    biometric: {
      async isAvailable(): Promise<boolean> {
        const nb = plugin('NativeBiometric');
        if (!nb || typeof nb.isAvailable !== 'function') {
          return false;
        }
        try {
          const result = await nb.isAvailable();
          return Boolean(result?.isAvailable);
        } catch {
          return false;
        }
      },
      async authenticate(reason): Promise<boolean> {
        const nb = plugin('NativeBiometric');
        if (!nb || typeof nb.verifyIdentity !== 'function') {
          unavailable('biometric', 'NativeBiometric plugin not registered');
        }
        try {
          await nb.verifyIdentity({ reason, title: reason });
          return true;
        } catch {
          return false;
        }
      },
    },

    haptics: {
      isSupported: () => Boolean(plugin('Haptics')),
      async impact(style = 'medium'): Promise<void> {
        const haptics = plugin('Haptics');
        if (!haptics || typeof haptics.impact !== 'function') {
          unavailable('haptics', 'Haptics plugin not registered');
        }
        await haptics.impact({ style: HAPTIC_STYLE[style] });
      },
    },

    camera: {
      isSupported: () => Boolean(plugin('Camera')),
      async capturePhoto() {
        const camera = plugin('Camera');
        if (!camera || typeof camera.getPhoto !== 'function') {
          unavailable('camera', 'Camera plugin not registered');
        }
        const result = await camera.getPhoto({ resultType: 'dataUrl', quality: 90 });
        const dataUrl = result?.dataUrl;
        if (typeof dataUrl !== 'string') {
          unavailable('camera', 'Camera returned no dataUrl');
        }
        return { dataUrl, format: String(result?.format ?? 'jpeg').toLowerCase() };
      },
    },

    secureStore: {
      isSupported: () => Boolean(plugin('SecureStoragePlugin')),
      async get(key): Promise<string | null> {
        const store = plugin('SecureStoragePlugin');
        if (!store || typeof store.get !== 'function') {
          unavailable('secureStore', 'SecureStoragePlugin not registered');
        }
        try {
          const result = await store.get({ key: SECURE_STORE_PREFIX + key });
          return result?.value ?? null;
        } catch {
          // Community plugin rejects on a missing key; treat as absent.
          return null;
        }
      },
      async set(key, value): Promise<void> {
        const store = plugin('SecureStoragePlugin');
        if (!store || typeof store.set !== 'function') {
          unavailable('secureStore', 'SecureStoragePlugin not registered');
        }
        await store.set({ key: SECURE_STORE_PREFIX + key, value });
      },
      async remove(key): Promise<void> {
        const store = plugin('SecureStoragePlugin');
        if (!store || typeof store.remove !== 'function') {
          unavailable('secureStore', 'SecureStoragePlugin not registered');
        }
        await store.remove({ key: SECURE_STORE_PREFIX + key });
      },
    },

    deepLink: {
      isSupported: () => Boolean(plugin('App')),
      async getLaunchUrl(): Promise<string | null> {
        const app = plugin('App');
        if (!app || typeof app.getLaunchUrl !== 'function') {
          return null;
        }
        const result = await app.getLaunchUrl();
        return result?.url ?? null;
      },
      addListener(listener): () => void {
        const app = plugin('App');
        if (!app || typeof app.addListener !== 'function') {
          return () => {};
        }
        const handlePromise = Promise.resolve(
          app.addListener('appUrlOpen', (data: { url?: string }) => {
            if (data?.url) {
              listener(data.url);
            }
          }),
        );
        return () => {
          handlePromise
            .then((handle) => {
              if (handle && typeof handle.remove === 'function') {
                handle.remove();
              }
            })
            .catch(() => {});
        };
      },
    },
  };
}
