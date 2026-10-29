// ============================================================================
// QuantCooks — design upgrade Phase A (structure, identity, defects).
//
// Pins for the Phase A build (plan quantcooks-design-upgrade-plan.md):
//  - D-0: the original Ember Q logo — BrandMark component, public brand
//    assets carrying the SAME hand-authored path data, favicon wired
//    into _app.tsx's <Head> (there was none).
//  - D-1: the --qc-* token layer exists in :root with today's values;
//    the studio section consumes it (the mapped literals are gone from
//    that section — tokenisation was value-identical, so this is a
//    structure pin, not a colour pin); :root --brand-primary is the
//    QC Spring Green #2FE07A, no longer the light-theme indigo.
//  - D-2: the login page is rebuilt on the auth-* dark treatment —
//    no emerald→cyan gradient, no indigo, no ⚡ glyph; its copy, SSO
//    href and submit labels are the strings the page always had.
//  - Defects: color-scheme: dark declared (white-box native controls);
//    Board hero CTA is inline-block and template cards are flex
//    columns (the overlap + run-on paragraph); Promo has its own
//    two-track layout (the ~360px centre collapse).
//  - Assets: every class used by src/pages/assets.tsx has a rule in
//    globals.css (the page shipped with zero; it sits outside the F-4
//    scan, so this test closes the same discipline for it here).
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BrandMark,
  BRAND_MARK_RING_PATH,
  BRAND_MARK_LEAF_PATH,
} from '../components/BrandMark';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');

const read = (rel: string) => readFileSync(join(APP_ROOT, rel), 'utf8');
const css = read('src/pages/globals.css');
const studioSection = css.slice(css.indexOf('QuantCooks Studio (F-4)'));
const collapseWs = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('D-0 — the Spring Q brand mark', () => {
  it('renders as an inline SVG carrying both hand-authored paths', () => {
    const html = renderToStaticMarkup(React.createElement(BrandMark, { size: 44 }));
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain(BRAND_MARK_RING_PATH);
    expect(html).toContain(BRAND_MARK_LEAF_PATH);
    expect(html).toContain('aria-hidden="true"');
  });

  it('accent variant paints the QC Spring Green gradient; mono is currentColor only', () => {
    const accent = renderToStaticMarkup(React.createElement(BrandMark, { variant: 'accent' }));
    expect(accent).toContain('stop-color="#2FE07A"');
    expect(accent).toContain('stop-color="#97F0BC"');
    const mono = renderToStaticMarkup(React.createElement(BrandMark, { variant: 'mono' }));
    expect(mono).toContain('fill="currentColor"');
    expect(mono).not.toContain('linearGradient');
  });

  it('the public brand assets carry the same path data as the component', () => {
    for (const rel of ['public/logo.svg', 'public/favicon.svg']) {
      expect(existsSync(join(APP_ROOT, rel)), `${rel} missing`).toBe(true);
      const svg = collapseWs(read(rel));
      expect(svg).toContain(collapseWs(BRAND_MARK_RING_PATH));
      expect(svg).toContain(collapseWs(BRAND_MARK_LEAF_PATH));
      expect(svg).toContain('#2FE07A');
    }
    expect(existsSync(join(APP_ROOT, 'public/favicon.ico'))).toBe(true);
    expect(existsSync(join(APP_ROOT, 'public/apple-touch-icon.png'))).toBe(true);
  });

  it('_app.tsx wires the favicon set into <Head> (there was none)', () => {
    const app = read('src/pages/_app.tsx');
    expect(app).toContain('rel="icon"');
    expect(app).toContain('href="/favicon.svg"');
    expect(app).toContain('href="/favicon.ico"');
    expect(app).toContain('href="/apple-touch-icon.png"');
    expect(app).toContain('name="theme-color" content="#0A0A0B"');
  });

  it('the shell wordmark is a lockup: the mark beside the kept text', () => {
    const shell = read('src/components/studio/StudioShell.tsx');
    expect(shell).toContain('BrandMark');
    expect(shell).toContain('QuantCooks Studio');
    expect(css).toMatch(/\.studio-shell-wordmark \{[^}]*display: flex/);
  });
});

describe('D-1 — token layer + one brand primary', () => {
  // The :root slice ends at the '.dark {' rule (the brace matters: the
  // word ".dark" also appears inside :root's own comments).
  const rootBlock = () =>
    css.slice(css.indexOf(':root {'), css.indexOf('.dark {', css.indexOf(':root {')));

  it('defines the --qc-* tokens in :root with the mapped current values', () => {
    const root = rootBlock();
    expect(root).toContain('--qc-canvas: #0A0A0B');
    expect(root).toContain('--qc-accent: #2FE07A');
    expect(root).toContain('--qc-accent-soft: #8DEEB6');
    expect(root).toContain('--qc-line: #232326');
    expect(root).toContain('--qc-text-2xl: 24px');
    expect(root).toContain('--qc-shadow-modal:');
  });

  it(':root --brand-primary is QC Spring Green, not the retired indigo', () => {
    const root = rootBlock();
    expect(root).toContain('--brand-primary: #2FE07A');
    // No declaration in :root may still carry the indigo value (the
    // hex may survive only inside the comment explaining its removal).
    expect(root).not.toMatch(/--[\w-]+:\s*#4f46e5/);
  });

  it("Krish's brand correction: the accent is his green; the ember tokens are gone", () => {
    // The #2FE07A decision (2026-10-29) superseded Phase A's ember
    // direction: the token is renamed, its value is the green, text on
    // the accent is black, and neither ember hex survives anywhere in
    // the stylesheet (the last #ff8a3d was the old token default).
    expect(css).toContain('--qc-on-accent: #000000');
    expect(css).not.toContain('--qc-ember');
    expect(css).not.toContain('#ff8a3d');
    expect(css).not.toContain('#ff8c42');
  });

  it('the studio section consumes the tokens (mapped literals are gone from it)', () => {
    for (const hex of ['#ff8a3d', '#2c2c3a', '#3a3a4c', '#a3a3b4', '#f2f1ec', '#1c1c24', '#17171d']) {
      expect(studioSection).not.toContain(hex);
    }
    expect(studioSection.split('var(--qc-accent)').length - 1).toBeGreaterThanOrEqual(30);
  });
});

describe('D-2 — login + sign-in gate on the dark auth treatment', () => {
  const login = read('src/pages/login.tsx');

  it('login renders the auth canvas/panel with the lockup and one accent SSO action', () => {
    expect(login).toContain('className="auth-canvas"');
    expect(login).toContain('className="auth-panel"');
    expect(login).toContain('className="auth-lockup"');
    expect(login).toContain('className="auth-sso"');
    expect(login).toContain('className="auth-submit"');
    expect(login).toContain('BrandMark');
  });

  it('the clashing colour languages are gone from the login page', () => {
    expect(login).not.toContain('from-emerald-500');
    expect(login).not.toContain('to-cyan-500');
    expect(login).not.toContain('#4f46e5');
    expect(login).not.toContain('⚡');
    expect(login).not.toContain('bg-[var(--quant-background)]');
  });

  it('copy, SSO target and submit labels are the strings the page always had', () => {
    expect(login).toContain('Sign in to QuantCooks');
    expect(login).toContain('Use your QuantID — one account for the whole ecosystem.');
    expect(login).toContain('Continue with Quant Account');
    expect(login).toContain('OR WITH QUANT ID / EMAIL');
    expect(login).toContain('https://quantmail.in/sso?returnTo=');
    expect(login).toContain('https://quantmail.in/register');
    expect(login).toContain('Create a QuantID');
    expect(login).toContain("'Signing in…' : 'Sign in'");
  });

  it('SignInRequired wears the same treatment (no light-brand flash)', () => {
    const gate = read('src/components/SignInRequired.tsx');
    expect(gate).toContain('className="auth-canvas"');
    expect(gate).toContain('auth-panel');
    expect(gate).not.toContain('bg-[var(--quant-background)]');
  });

  it('the auth rules exist and declare the dark colour scheme', () => {
    expect(css).toMatch(/\.auth-canvas \{[^}]*color-scheme: dark/);
    expect(css).toMatch(/\.auth-panel \{[^}]*background-color: var\(--qc-panel\)/);
    expect(css).toMatch(/\.auth-sso \{[^}]*background-color: var\(--brand-primary\)/);
    expect(css).toMatch(/\.studio-shell \{[^}]*color-scheme: dark/);
  });
});

describe('defect fixes — board, promo, page titles', () => {
  it('the Board hero CTA can no longer overlap the hero text', () => {
    expect(css).toMatch(/\.studio-board-create \{[^}]*display: inline-block/);
    expect(css).toMatch(/\.studio-board-hero \{[^}]*flex-direction: column/);
  });

  it('Board template cards lay their children out as a column', () => {
    expect(css).toMatch(/\.studio-board-template \{[^}]*display: flex;[^}]*flex-direction: column/);
    expect(css).toContain('.studio-board-template strong');
    expect(css).toContain('.studio-board-template a');
  });

  it('Promo has its own two-track layout (no shared 280px first track)', () => {
    expect(css).toMatch(
      /\.studio-promo-layout \{\s*display: grid;\s*grid-template-columns: minmax\(0, 1fr\) 300px;/,
    );
  });

  it('every screen head carries the studio page-title rule', () => {
    for (const head of [
      '.studio-voice-head h1',
      '.studio-photo-head h1',
      '.studio-design-head h1',
      '.studio-stories-header h1',
      '.studio-tools-hero h1',
      '.studio-tools-flow-head h1',
      '.studio-board-hero h1',
      '.studio-profile-header h1',
    ]) {
      expect(css).toContain(head);
    }
    const titleRule = css.match(
      /\.studio-voice-head h1[\s\S]{0,600}?font-size: var\(--qc-text-2xl\)/,
    );
    expect(titleRule).not.toBeNull();
  });
});

describe('assets library — the zero-rule classes now have rules', () => {
  const assetsSrc = read('src/pages/assets.tsx');

  const usedClasses = (): Set<string> => {
    const classes = new Set<string>();
    const addChunk = (chunk: string) => {
      for (const token of chunk.split(/\s+/)) {
        if (token && /^[a-z][a-z0-9-]*$/.test(token)) classes.add(token);
      }
    };
    for (const m of assetsSrc.matchAll(/className="([^"]*)"/g)) addChunk(m[1]!);
    for (const m of assetsSrc.matchAll(/className=\{`([^`]*)`\}/g)) {
      addChunk(m[1]!.replace(/\$\{[^}]*\}/g, ' '));
    }
    for (const m of assetsSrc.matchAll(/className=\{([^}]*)\}/g)) {
      for (const s of m[1]!.matchAll(/'([^']+)'/g)) addChunk(s[1]!);
    }
    return classes;
  };

  it('every class used by the page has a rule in globals.css', () => {
    const classes = usedClasses();
    expect(classes.size).toBeGreaterThan(30);
    const missing = [...classes].filter(
      (c) => !new RegExp(`\\.${c.replace(/-/g, '\\-')}(?![a-zA-Z0-9_-])`).test(css),
    );
    expect(missing).toEqual([]);
  });
});
