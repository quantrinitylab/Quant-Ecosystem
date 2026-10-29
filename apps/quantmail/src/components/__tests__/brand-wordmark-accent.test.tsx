import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import { BrandWordmark, appDisplayName } from '../BrandWordmark';
import { APP_THEMES } from '../../lib/app-theme';

/**
 * qm-brandwordmark-accent — per-app accent regression tests.
 *
 * Finding (2026-10-12, still on origin/main at fix time): BrandWordmark
 * rendered the app name ("Git" on /quantgit) in var(--quant-primary) —
 * Mail orange — instead of the per-app --app-accent, violating the
 * user-locked per-app accents (Mail orange, Calendar blue, Drive green,
 * Contacts amber, QuantGit purple #8B5CF6). AppShell sets --app-accent per
 * route and globals.css defaults it to Mail orange, so the wordmark must
 * resolve its name color through var(--app-accent): purple on /quantgit,
 * unchanged orange on mail/login surfaces.
 *
 * These tests pin:
 *  - every app variant renders its name span with text-[var(--app-accent)];
 *  - no rendered variant contains var(--quant-primary) anywhere;
 *  - the source file itself contains no var(--quant-primary) (guards the
 *    brand span and any future span from re-introducing the hardcode);
 *  - the brand half stays var(--quant-foreground) and the displayed names
 *    are unchanged (QuantMail / QuantCalendar / QuantDrive / QuantContacts
 *    / QuantGit);
 *  - the theme the wordmark resolves through is actually purple on
 *    /quantgit (APP_THEMES.quantgit.accent === #8B5CF6).
 */

const SOURCE = readFileSync(new URL('../BrandWordmark.tsx', import.meta.url), 'utf8');

const VARIANTS = [
  { app: 'mail' as const, name: 'Mail' },
  { app: 'calendar' as const, name: 'Calendar' },
  { app: 'drive' as const, name: 'Drive' },
  { app: 'contacts' as const, name: 'Contacts' },
  { app: 'code' as const, name: 'Git' },
];

describe('BrandWordmark per-app accent', () => {
  it.each(VARIANTS)(
    'app "$app" renders "$name" in var(--app-accent), never Mail-orange --quant-primary',
    ({ app, name }) => {
      const html = renderToStaticMarkup(<BrandWordmark app={app} />);
      expect(html).toContain(`text-[var(--app-accent)]`);
      expect(html).toContain(`>${name}<`);
      expect(html).not.toContain('var(--quant-primary)');
    },
  );

  it('brand half stays var(--quant-foreground) and names are unchanged', () => {
    const html = renderToStaticMarkup(<BrandWordmark app="code" />);
    expect(html).toContain('text-[var(--quant-foreground)]');
    expect(html).toContain('>Quant<');
    expect(html).toContain('>Git<');
    expect(appDisplayName('code')).toBe('QuantGit');
    expect(appDisplayName('calendar')).toBe('QuantCalendar');
    expect(appDisplayName('mail')).toBe('QuantMail');
  });

  it('source contains no var(--quant-primary) hardcode', () => {
    expect(SOURCE).not.toContain('var(--quant-primary)');
    expect(SOURCE).toContain('text-[var(--app-accent)]');
  });

  it('the accent the wordmark resolves through is QuantGit purple', () => {
    expect(APP_THEMES.quantgit.accent).toMatch(/^#8B5CF6$/i);
  });
});
