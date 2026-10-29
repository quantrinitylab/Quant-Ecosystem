// ============================================================================
// QuantCooks — design upgrade Phase B (the measured polish pass).
//
// Pins for the Phase B build (plan quantcooks-design-upgrade-plan.md §3
// V1–V12, filled from quantcooks-mobbin-visual-study.md):
//  - The V tokens now carry the study's measured near-black scale and
//    text ramp; the accent stays Krish's QC Spring Green #2FE07A —
//    the reference's lime (#C6FF2E) and the retired ember hexes appear
//    NOWHERE in the stylesheet.
//  - Type/shape: page titles bold + tight; the primary Generate is a
//    radius-md rectangle (study rule 8); section labels uppercase +
//    tracked (the preset-kind label carries the accent).
//  - Two-tone headlines: the accent span wraps existing words — the
//    rendered headline TEXT is byte-identical to before.
//  - Generate labels already carry the real quote ("Generate · N
//    credits" / the honest "Generate · —") — pinned so the count is
//    never dropped or invented.
//  - Glows: Promo (warm coral) + Voice (soft rose) tokens exist and
//    are applied; every other surface keeps plain token backgrounds.
//  - Signature controls: the nav icon set renders (original stroke
//    SVGs keyed by nav id, unknown ids render nothing); the Voice
//    dial renders its face + needle and carries data-mode so the CSS
//    needle rests at the picked mode.
//  - States: the Phase B CSS separates empty / error / not-configured
//    treatments with three distinct data-URI icons.
//  - Login: the panel takes the study's modal radius token and the
//    canvas gains the dim layer (modal-over-backdrop anatomy, as far
//    as a routed page can go — see the Phase B report).
//  - Media-forward cards: photo/design cards key their full-bleed
//    treatment on :has(real media); the assets grid gets its video
//    play triangle.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NavIcon } from '../components/studio/NavIcons';
import { VoiceStudio } from '../components/studio/VoiceStudio';
import { generateButtonLabel } from '../lib/studio/pricing';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');

const read = (rel: string) => readFileSync(join(APP_ROOT, rel), 'utf8');
const css = read('src/pages/globals.css');
// Same :root slice as the Phase A pins: the (single) :root block holds
// the legacy theme vars AND the --qc-* tokens; it ends at '.dark {'.
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('.dark {', css.indexOf(':root {')));
const rootDecls = rootBlock.replace(/\/\*[\s\S]*?\*\//g, '');
const phaseB = css.slice(css.indexOf('Design upgrade Phase B'));
const stripTags = (s: string) => s.replace(/<[^>]+>/g, '');

describe('V1–V12 — the measured values land in the tokens', () => {
  it('the near-black scale and text ramp are the study values', () => {
    for (const decl of [
      '--qc-canvas: #0A0A0B',
      '--qc-nav: #101012',
      '--qc-topbar: #101012',
      '--qc-panel: #141416',
      '--qc-card: #17171A',
      '--qc-raised: #1B1B1E',
      '--qc-board: #0E0E0F',
      '--qc-line: #232326',
      '--qc-line-strong: #2A2A2E',
      '--qc-ink: #FFFFFF',
      '--qc-ink-2: #C9C9CE',
      '--qc-ink-3: #8A8A93',
      '--qc-ink-5: #6B6B72',
      '--qc-danger: #FF4D4D',
    ]) {
      expect(rootDecls, decl).toContain(decl);
    }
  });

  it('the Phase A stand-in values are gone from the declarations', () => {
    // (The legacy theme's own --destructive keeps its red — it is not
    // a --qc-* token and not Phase B's to move; the QC danger token
    // itself no longer carries the old value.)
    for (const old of ['#101014', '#2c2c3a', '#3a3a4c', '#a3a3b4', '#f2f1ec', '#1c1c24', '#17171d']) {
      expect(rootDecls.toLowerCase(), old).not.toContain(old);
    }
    expect(rootDecls).not.toContain('--qc-danger: #f87171');
  });

  it('the accent is still QC Spring Green — never the reference lime, never ember', () => {
    expect(rootDecls).toContain('--qc-accent: #2FE07A');
    expect(css.toLowerCase()).not.toContain('#c6ff2e');
    expect(css.toLowerCase()).not.toContain('#ff8a3d');
    expect(css.toLowerCase()).not.toContain('#ff8c42');
  });

  it('the swept stage/dot literals are token references now', () => {
    const studio = css.slice(css.indexOf('QuantCooks Studio (F-4)')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(studio).not.toContain('#101016');
    expect(studio).not.toContain('#23232f');
    expect(studio).toContain('background-color: var(--qc-stage)');
    expect(studio).toContain('radial-gradient(var(--qc-line) 1px, transparent 1px)');
  });
});

describe('Type + shape system', () => {
  it('page titles are bold and tight in the Phase B layer', () => {
    expect(phaseB).toContain('.studio-image-head h1');
    expect(phaseB).toContain('.studio-board-hero h1');
    expect(phaseB).toContain('font-weight: var(--qc-weight-bold)');
    expect(phaseB).toContain('letter-spacing: -0.015em');
  });

  it('the primary Generate is a rectangle, not a pill (study rule 8)', () => {
    const gen = css.slice(css.indexOf('.studio-generate {'), css.indexOf('.studio-generate {') + 700);
    expect(gen).toContain('border-radius: var(--qc-r-md)');
    expect(gen).not.toContain('border-radius: var(--qc-r-full)');
  });

  it('the preset-kind label is the accent, small and tracked', () => {
    const kind = css.slice(css.lastIndexOf('.studio-preset-kind {'), css.lastIndexOf('.studio-preset-kind {') + 300);
    expect(kind).toContain('color: var(--qc-accent)');
    expect(kind).toContain('letter-spacing: 0.08em');
  });
});

describe('Two-tone headlines — accent span, identical text', () => {
  const cases: Array<[string, string, string]> = [
    ['src/components/studio/ImageStudio.tsx', 'Image', 'Image Studio'],
    ['src/components/studio/VideoStudio.tsx', 'Video', 'Video Studio'],
    ['src/components/studio/PromoStudio.tsx', 'Promo', 'Promo Studio'],
    ['src/components/studio/FilmStudio.tsx', 'Recipe Film', 'Recipe Film Studio'],
    ['src/components/studio/VoiceStudio.tsx', 'Voice', 'Voice Studio'],
    ['src/components/studio/DesignStudioHome.tsx', 'Design', 'Design Studio'],
    ['src/components/studio/BoardHome.tsx', 'Canvas', 'Canvas Board'],
    ['src/components/studio/StoriesHome.tsx', 'Story', 'Story Series'],
    ['src/components/studio/QuickToolsDirectory.tsx', 'Quick', 'Quick Tools'],
    ['src/components/studio/PhotoEditor.tsx', 'Photo', 'Photo Editor'],
  ];

  it.each(cases)('%s wraps %s in the accent span and keeps its headline text', (rel, word, full) => {
    const src = read(rel);
    const h1 = src.match(/<h1>[\s\S]*?<\/h1>/)?.[0] ?? '';
    expect(h1).toContain(`<span className="studio-title-accent">${word}</span>`);
    expect(stripTags(h1)).toBe(full);
  });

  it('the Explore wizard headline accents its second phrase, text unchanged', () => {
    const src = read('src/components/studio/ExploreHome.tsx');
    const h2 = src.match(/<h2>Make your first clip[\s\S]*?<\/h2>/)?.[0] ?? '';
    expect(h2).toContain('<span className="studio-title-accent">in three steps</span>');
    expect(stripTags(h2)).toBe('Make your first clip in three steps');
  });
});

describe('Generate buttons carry the credit count', () => {
  it('a real quote renders "Generate · N credits"; no quote stays the honest dash', () => {
    const quote = { credits: 30, modelId: 'm', modelLabel: 'M', lines: [] };
    expect(generateButtonLabel(quote, true)).toBe('Generate · 30 credits');
    expect(generateButtonLabel({ ...quote, credits: 1 }, true)).toBe('Generate · 1 credit');
    expect(generateButtonLabel(null, true)).toBe('Generate · —');
    expect(generateButtonLabel(quote, false)).toBe('Generate · —');
  });
});

describe('Studio glows — our palette only', () => {
  it('Promo and Voice glow tokens exist and are applied as baked tints', () => {
    expect(rootDecls).toContain('--qc-glow-promo: #FF6E5A');
    expect(rootDecls).toContain('--qc-glow-voice: #E58AA5');
    expect(phaseB).toContain('rgba(255, 110, 90, 0.16)');
    expect(phaseB).toContain('rgba(229, 138, 165, 0.13)');
  });
});

describe('Nav icons — original stroke set, wired into the shell', () => {
  it('renders an 18px stroke SVG for known ids and nothing for unknown ones', () => {
    for (const id of ['explore', 'image', 'video', 'promo', 'film', 'board', 'voice', 'tools', 'credits', 'connect-quantai']) {
      const html = renderToStaticMarkup(React.createElement(NavIcon, { id }));
      expect(html, id).toContain('class="studio-nav-icon"');
      expect(html, id).toContain('stroke-width="1.7"');
      expect(html, id).toContain('aria-hidden="true"');
    }
    expect(renderToStaticMarkup(React.createElement(NavIcon, { id: 'nope' }))).toBe('');
  });

  it('the shell renders the icon beside the label in both nav branches', () => {
    const shell = read('src/components/studio/StudioShell.tsx');
    expect(shell.match(/<NavIcon id=\{item\.id\} \/>/g)).toHaveLength(2);
  });
});

describe('Voice dial — a real dial now', () => {
  it('renders the face, the needle and the mode the needle rests at', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceStudio, { assets: [], assetsState: 'ready', jobs: [] }),
    );
    expect(html).toContain('data-mode="voiceover"');
    expect(html).toContain('studio-voice-dial-face');
    expect(html).toContain('studio-voice-dial-needle');
    // The controls are unchanged: same testids, same mode buttons.
    expect(html).toContain('data-testid="voice-dial"');
    expect(html).toContain('data-testid="voice-dial-mode-voiceover"');
    expect(html).toContain('data-testid="voice-dial-mode-translate"');
  });

  it('the CSS rests the needle at each mode and segments the mode control', () => {
    expect(phaseB).toContain("[data-mode='voiceover'] .studio-voice-dial-needle");
    expect(phaseB).toContain('rotate(-52deg)');
    expect(phaseB).toContain("[data-mode='translate'] .studio-voice-dial-needle");
    expect(phaseB).toContain('rotate(52deg)');
    expect(phaseB).toContain(".studio-voice-dial-modes button[aria-pressed='true']");
    expect(phaseB).toContain('background-color: var(--qc-accent)');
  });
});

describe('State treatments — three kinds, three looks', () => {
  it('empty, error and not-configured each carry their own icon', () => {
    const icons = phaseB.match(/data:image\/svg\+xml/g) ?? [];
    expect(icons.length).toBeGreaterThanOrEqual(3);
    // plus-circle (empty) / warning triangle in the danger hex (error) / plug (not-configured)
    expect(phaseB).toContain("%3Ccircle cx='12' cy='12' r='8.5'/%3E");
    expect(phaseB).toContain("stroke='%23FF4D4D'");
    expect(phaseB).toContain("%3Cpath d='M9 3.8v4.2M15 3.8v4.2'/%3E");
  });

  it('error boxes share the danger frame; blocked outcomes take the warn frame', () => {
    expect(phaseB).toContain('border: 1px solid var(--qc-danger-line)');
    expect(phaseB).toContain('background-color: var(--qc-danger-bg)');
    expect(phaseB).toContain('.studio-tools-outcome-blocked');
    expect(phaseB).toContain('background-color: var(--qc-warn-bg)');
  });
});

describe('Login — modal anatomy as far as a routed page goes', () => {
  it('the panel takes the modal radius token and the canvas the dim layer', () => {
    expect(rootDecls).toContain('--qc-r-modal: 20px');
    const panel = css.slice(css.indexOf('.auth-panel {'), css.indexOf('.auth-panel {') + 500);
    expect(panel).toContain('border-radius: var(--qc-r-modal)');
    const canvas = css.slice(css.indexOf('.auth-canvas {'), css.indexOf('.auth-canvas {') + 900);
    expect(canvas).toContain('rgba(0, 0, 0, 0.45)');
    expect(canvas).toContain('rgba(47, 224, 122, 0.14)');
  });
});

describe('Assets page ground — the screenshot-run fix', () => {
  it('the page and its loading state carry the dark ground class; the library component does not', () => {
    const page = read('src/pages/assets.tsx');
    expect(page).toContain('className="asset-library assets-page"');
    expect(page).toContain('className="assets-page assets-loading"');
    expect(phaseB).toContain('.assets-page {');
    expect(phaseB).toContain('background-color: var(--qc-canvas)');
    expect(phaseB).toContain('min-height: 100vh');
  });

  it('the load-error panel spans the grid and its shared-ui text takes the QC ramp', () => {
    expect(phaseB).toContain('grid-column: 1 / -1');
    expect(phaseB).toContain("[data-testid='assets-load-error'] h3");
    expect(phaseB).toContain("[data-testid='assets-load-error'] p");
  });
});

describe('Media-forward cards — full-bleed only where real media exists', () => {
  it('photo and design cards key the gradient label on :has(real media)', () => {
    expect(phaseB).toContain('.studio-photo-card:has(> .studio-photo-thumb) .studio-photo-name');
    expect(phaseB).toContain('.studio-design-card:has(.studio-design-thumb-img) .studio-design-name');
    expect(phaseB).toContain('object-fit: cover');
    expect(phaseB).toContain('linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.66))');
  });

  it('assets video thumbnails get the centred play triangle', () => {
    expect(phaseB).toContain('.assets-grid .asset-thumbnail:has(> video)::after');
    expect(phaseB).toContain('border-left: 15px solid rgba(255, 255, 255, 0.92)');
  });
});
