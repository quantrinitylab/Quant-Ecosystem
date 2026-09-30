/**
 * @quant/platform — one capability seam for web, Capacitor (mobile) and Tauri
 * (desktop). Consumers import {@link getPlatform} and call capabilities; they
 * never branch on the host. See {@link PlatformAdapter} for the full surface.
 */

export * from './types';
export {
  type CapacitorBridge,
  type PlatformEnv,
  type TauriBridge,
  currentEnv,
  detectPlatform,
} from './env';
export { createWebAdapter } from './adapters/web';
export { createCapacitorAdapter } from './adapters/capacitor';
export { createTauriAdapter } from './adapters/tauri';
export { createPlatformAdapter, getPlatform, setPlatform, resetPlatform } from './registry';
