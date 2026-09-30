/**
 * @quant/platform — capability adapter seam.
 *
 * One web core (each app + `@quant/shared-ui`) runs on four surfaces: web,
 * mobile (Capacitor), desktop (Tauri) and — where a capability has no meaning —
 * degrades predictably. Consumers depend only on these interfaces and call
 * {@link getPlatform}; they never branch on the host directly.
 *
 * Every capability exposes an `isSupported()` (or `isAvailable()`) probe.
 * When a capability is absent on the active platform, its action methods reject
 * with {@link CapabilityUnavailableError} rather than throwing an opaque error,
 * so callers can offer a graceful fallback.
 */

export type PlatformName = 'web' | 'capacitor' | 'tauri';

/** Normalized permission state, mirroring the DOM `PermissionState` values. */
export type PermissionStatus = 'granted' | 'denied' | 'prompt';

/** Thrown when a capability method is invoked on a platform that lacks it. */
export class CapabilityUnavailableError extends Error {
  readonly capability: string;
  readonly platform: PlatformName;

  constructor(capability: string, platform: PlatformName, detail?: string) {
    super(
      `[@quant/platform] capability "${capability}" is not available on platform "${platform}"` +
        (detail ? `: ${detail}` : ''),
    );
    this.name = 'CapabilityUnavailableError';
    this.capability = capability;
    this.platform = platform;
  }
}

export interface LocalNotification {
  title: string;
  body?: string;
  /** Stable identifier; used for de-duplication / replacement where supported. */
  id?: string;
}

export interface NotificationsCapability {
  isSupported(): boolean;
  requestPermission(): Promise<PermissionStatus>;
  show(notification: LocalNotification): Promise<void>;
}

export interface ShareContent {
  title?: string;
  text?: string;
  url?: string;
}

export interface ShareCapability {
  isSupported(): boolean;
  share(content: ShareContent): Promise<void>;
}

export interface FileSystemCapability {
  isSupported(): boolean;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, contents: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

export interface BiometricCapability {
  /** Async because native platforms interrogate hardware/enrollment state. */
  isAvailable(): Promise<boolean>;
  /** Resolves `true` on successful auth, `false` on user cancel/failure. */
  authenticate(reason: string): Promise<boolean>;
}

export type HapticStyle = 'light' | 'medium' | 'heavy';

export interface HapticsCapability {
  isSupported(): boolean;
  impact(style?: HapticStyle): Promise<void>;
}

export interface CapturedImage {
  /** `data:` URL of the captured image. */
  dataUrl: string;
  /** Lower-cased image format, e.g. `"jpeg"` / `"png"`. */
  format: string;
}

export interface CameraCapability {
  isSupported(): boolean;
  capturePhoto(): Promise<CapturedImage>;
}

export interface SecureStoreCapability {
  isSupported(): boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export type DeepLinkListener = (url: string) => void;

export interface DeepLinkCapability {
  isSupported(): boolean;
  /** The URL that launched/opened the app this session, if any. */
  getLaunchUrl(): Promise<string | null>;
  /** Subscribe to subsequent deep links; returns an unsubscribe function. */
  addListener(listener: DeepLinkListener): () => void;
}

/** The full capability surface a platform provides to the shared web core. */
export interface PlatformAdapter {
  readonly name: PlatformName;
  readonly notifications: NotificationsCapability;
  readonly share: ShareCapability;
  readonly filesystem: FileSystemCapability;
  readonly biometric: BiometricCapability;
  readonly haptics: HapticsCapability;
  readonly camera: CameraCapability;
  readonly secureStore: SecureStoreCapability;
  readonly deepLink: DeepLinkCapability;
}
