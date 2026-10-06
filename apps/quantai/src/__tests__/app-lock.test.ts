import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isAppLockAvailable,
  isAppLockEnabled,
  isValidPinFormat,
  setAppLockPin,
  verifyAppLockPin,
  changeAppLockPin,
  disableAppLock,
} from '../lib/app-lock';

const KEY = 'quantai_app_lock';

beforeEach(() => {
  window.localStorage.removeItem(KEY);
  // jsdom's window.crypto may lack subtle — bridge Node's WebCrypto.
  const w = window as unknown as { crypto: Crypto };
  if (!w.crypto.subtle && typeof globalThis.crypto?.subtle !== 'undefined') {
    Object.defineProperty(w, 'crypto', {
      value: globalThis.crypto,
      configurable: true,
    });
  }
  vi.restoreAllMocks();
});

describe('app-lock', () => {
  it('validates PIN format (4–8 digits)', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('12345678')).toBe(true);
    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('123456789')).toBe(false);
    expect(isValidPinFormat('12ab')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
  });

  it('is disabled by default', () => {
    expect(isAppLockEnabled()).toBe(false);
  });

  it('sets a PIN and verifies it', async () => {
    expect(isAppLockAvailable()).toBe(true);
    await setAppLockPin('1234');
    expect(isAppLockEnabled()).toBe(true);
    expect(await verifyAppLockPin('1234')).toBe(true);
    expect(await verifyAppLockPin('0000')).toBe(false);
  });

  it('rejects invalid PINs on set', async () => {
    await expect(setAppLockPin('12')).rejects.toThrow(/4–8 digits/);
    await expect(setAppLockPin('abcd')).rejects.toThrow(/4–8 digits/);
    expect(isAppLockEnabled()).toBe(false);
  });

  it('never stores the raw PIN', async () => {
    await setAppLockPin('9876');
    const raw = window.localStorage.getItem(KEY) ?? '';
    expect(raw).not.toContain('9876');
    expect(raw).toContain('salt');
    expect(raw).toContain('hash');
  });

  it('changes the PIN only with the correct current PIN', async () => {
    await setAppLockPin('1111');
    await expect(changeAppLockPin('0000', '2222')).rejects.toThrow(/incorrect/i);
    expect(await verifyAppLockPin('1111')).toBe(true);

    await changeAppLockPin('1111', '2222');
    expect(await verifyAppLockPin('2222')).toBe(true);
    expect(await verifyAppLockPin('1111')).toBe(false);
  });

  it('disables and clears the stored hash', async () => {
    await setAppLockPin('1234');
    expect(isAppLockEnabled()).toBe(true);
    disableAppLock();
    expect(isAppLockEnabled()).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(await verifyAppLockPin('1234')).toBe(false);
  });
});
