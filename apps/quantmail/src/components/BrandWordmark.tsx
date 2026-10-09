'use client';

import React from 'react';

export type BrandWordmarkProps = {
  app?: 'mail' | 'calendar' | 'drive' | 'contacts' | 'code';
  size?: 'text-sm' | 'text-base' | 'text-lg' | 'text-xl' | 'text-2xl' | 'text-4xl';
  className?: string;
};

const APP_TITLES: Record<string, { brand: string; name: string }> = {
  mail: { brand: 'Quant', name: 'Mail' },
  calendar: { brand: 'Quant', name: 'Calendar' },
  drive: { brand: 'Quant', name: 'Drive' },
  contacts: { brand: 'Quant', name: 'Contacts' },
  // The app *id* stays `code` (it owns the `/codehub` route); only the
  // user-visible name is QuantGit — rendered as one word (no gap between
  // "Quant" and "Git") to match the switcher label (SIA-P2-11).
  code: { brand: 'Quant', name: 'Git' },
};

/**
 * The one place an app's user-visible name is spelled out.
 *
 * The header tooltip in `AppShell` used to build this itself, by upper-casing the
 * app id (`Quant${app.charAt(0).toUpperCase() + app.slice(1)}`). That silently
 * produced "QuantCode" for the `code` app while the wordmark rendered directly
 * beside it read "QuantGit" — a name can't live in two places.
 */
export function appDisplayName(app: string): string {
  const item = APP_TITLES[app] || APP_TITLES.mail;
  return `${item.brand}${item.name}`;
}

/**
 * World-Class Instagram-Style Signature Wordmark.
 *
 * The app name follows the per-app accent (`--app-accent`: Mail orange,
 * Calendar blue, Drive green, Contacts amber, QuantGit purple) so the
 * wordmark always matches the active app's theme (SIA-P2-9).
 */
export function BrandWordmark({
  app = 'mail',
  size = 'text-xl',
  className = '',
}: BrandWordmarkProps) {
  const item = APP_TITLES[app] || APP_TITLES.mail;

  const fontSizes = {
    'text-sm': 'text-[14px]',
    'text-base': 'text-[16px]',
    'text-lg': 'text-[18px]',
    'text-xl': 'text-[20px]',
    'text-2xl': 'text-[24px]',
    'text-4xl': 'text-[36px]',
  };

  const chosenSize = fontSizes[size] || 'text-[20px]';
  // QuantGit reads as one word like the switcher label (SIA-P2-11).
  const tight = app === 'code' ? 'gap-0' : 'gap-1.5';

  return (
    <span
      className={`inline-flex items-center whitespace-nowrap select-none font-semibold tracking-tight ${chosenSize} ${tight} ${className}`}
    >
      <span className="text-[var(--quant-foreground)] font-bold tracking-tight">{item.brand}</span>
      <span className="text-[var(--app-accent)] font-semibold tracking-tight">{item.name}</span>
    </span>
  );
}

export default BrandWordmark;
