/**
 * QuantMail quick-settings preferences — the SAME keys and values the full
 * settings page (`src/app/settings/page.tsx`) and the pre-paint bootstrap
 * (`src/app/layout.tsx`) already use. This module exists so the one-click
 * quick-settings panel cannot drift from them: a panel that wrote a new key
 * would look saved and change nothing, which is exactly the fake-control
 * defect the settings page was rebuilt to remove.
 *
 * Wired controls only:
 * - Theme (`quant-theme`): 'light' | 'dark' | 'system'. Painted onto
 *   `<html>` as `data-theme` + `dark` class + `colorScheme`, the same three
 *   attributes the bootstrap sets — `globals.css` keys its light palette on
 *   `data-theme='light'`, so toggling the class alone is not a theme change.
 * - Density (`quant-density`): 'comfortable' | 'cozy' | 'compact', applied
 *   as `data-density`, the attribute `globals.css` keys its row rules on.
 *
 * Deliberately NOT here: inbox type and reading pane. Gmail's quick panel
 * offers both; QuantMail has no such setting anywhere (no key, no reader,
 * no API), so the panel says so instead of rendering a control that does
 * nothing. Notification mode is server-backed and lives in
 * `lib/mail-notification-mode.ts` + `hooks/useMailNotificationMode.ts`; the
 * panel reuses that hook rather than duplicating the contract.
 *
 * Pure helpers take their inputs as arguments (storage, media query result)
 * so they are testable in the node-environment vitest suites without a DOM.
 */

export type QuickTheme = 'light' | 'dark' | 'system';
export type QuickDensity = 'comfortable' | 'cozy' | 'compact';

export const QUICK_THEME_STORAGE_KEY = 'quant-theme';
export const QUICK_DENSITY_STORAGE_KEY = 'quant-density';

/** Custom event any surface may dispatch to open the quick-settings panel. */
export const QUICK_SETTINGS_OPEN_EVENT = 'quant:quick-settings:open';

export function openQuickSettings(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUICK_SETTINGS_OPEN_EVENT));
  }
}

/** Fold legacy/unknown stored values to the default, never to nothing selected. */
export function normalizeQuickTheme(value: unknown): QuickTheme {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'dark';
}

export function normalizeQuickDensity(value: unknown): QuickDensity {
  return value === 'compact' || value === 'cozy' ? value : 'comfortable';
}

export function resolveQuickTheme(theme: QuickTheme, prefersDark: boolean): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return prefersDark ? 'dark' : 'light';
}

export interface QuickStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

export function readStoredQuickTheme(storage: QuickStorage | null): QuickTheme {
  if (!storage) return 'dark';
  try {
    return normalizeQuickTheme(storage.getItem(QUICK_THEME_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

export function readStoredQuickDensity(storage: QuickStorage | null): QuickDensity {
  if (!storage) return 'comfortable';
  try {
    return normalizeQuickDensity(storage.getItem(QUICK_DENSITY_STORAGE_KEY));
  } catch {
    return 'comfortable';
  }
}

/** The DOM half: paint the resolved theme exactly as the bootstrap does. */
export function paintQuickTheme(resolved: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function applyQuickDensity(density: QuickDensity): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-density', density);
}
