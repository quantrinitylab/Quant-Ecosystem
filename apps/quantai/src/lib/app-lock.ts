// ============================================================================
// QuantAI — App Lock (device PIN gate).
//
// A client-side privacy screen: when enabled, QuantAI asks for a PIN before
// showing the app on this device. The PIN is stored as a salted SHA-256 hash
// in localStorage — it is a UX gate, NOT encryption, and does not protect
// data from anyone with device access. The UI must say so honestly.
//
// Enforcement at app launch (wrapping the app tree in a lock gate) is a
// separate integration step; this module owns the setting itself:
// enable / verify / change / disable.
// ============================================================================

const STORAGE_KEY = 'quantai_app_lock';
const PIN_PATTERN = /^\d{4,8}$/;

export interface AppLockRecord {
  version: 1;
  salt: string;
  hash: string;
  updatedAt: string;
}

export function isAppLockAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      typeof window.crypto !== 'undefined' &&
      typeof window.crypto.subtle !== 'undefined'
    );
  } catch {
    return false;
  }
}

export function isAppLockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function getAppLockUpdatedAt(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as AppLockRecord;
    return typeof record.updatedAt === 'string' ? record.updatedAt : null;
  } catch {
    return null;
  }
}

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${pin}`);
}

/**
 * Enables app lock with a new PIN. Throws on invalid format or when
 * WebCrypto/localStorage are unavailable.
 */
export async function setAppLockPin(pin: string): Promise<void> {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be 4–8 digits.');
  }
  if (!isAppLockAvailable()) {
    throw new Error('App lock is not available on this device/browser.');
  }
  const salt = randomSalt();
  const hash = await hashPin(pin, salt);
  const record: AppLockRecord = {
    version: 1,
    salt,
    hash,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

/** Returns true when the PIN matches the stored hash. */
export async function verifyAppLockPin(pin: string): Promise<boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const record = JSON.parse(raw) as AppLockRecord;
    if (!record.salt || !record.hash) return false;
    const hash = await hashPin(pin, record.salt);
    return hash === record.hash;
  } catch {
    return false;
  }
}

/**
 * Changes the PIN. Verifies the current PIN first; throws when it is wrong.
 */
export async function changeAppLockPin(currentPin: string, newPin: string): Promise<void> {
  const ok = await verifyAppLockPin(currentPin);
  if (!ok) {
    throw new Error('Current PIN is incorrect.');
  }
  await setAppLockPin(newPin);
}

/** Disables app lock and removes the stored hash. */
export function disableAppLock(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort — a missing key already means "disabled".
  }
}
