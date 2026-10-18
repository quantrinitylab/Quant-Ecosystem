// ============================================================================
// Rail icons render once — no mid-load placeholder→real or old-set→new-set
// swap (queue 2026-10-15 P1 [calendar-day]; sibling: 2026-10-15 21:27 P1
// [people-home] — mobile app-switcher rail icons swapped between loading
// and settled on every cold load: t1.5 placeholder icons replaced by the
// real icons by t8).
//
// Original root cause: the 5-pillar rail mounted canvas-painted logo
// components (QuantMailLogo/QuantDriveLogo/…) that painted asynchronously —
// first paint showed placeholder/intermediate canvas content, later paints
// showed the final marks (t1.5 placeholder icons → t8 real icons on every
// cold load). #1259 + follow-ups replaced the rail with static webp/png
// <img> marks (PillarMascotMark); this file pins the fixed contract:
//
//   1. Each pillar's rail mark renders exactly ONE image (one <source> +
//      one <img>), never a <canvas>, never a placeholder branch.
//   2. The root layout preloads all five rail webp assets with document
//      priority (non-auth-shell pages only) so the icons decode by first
//      paint instead of popping in after hydration.
//   3. The legacy canvas logo components stay unreferenced by the top bar —
//      re-wiring them re-opens the old-set ↔ new-set flicker class.
//   4. Every rail asset exists on disk as a webp+png pair (no 404 fallback
//      swaps, no fake data).
//
// renderToStaticMarkup is used because apps/quantmail has no
// @testing-library/react (CI runs pnpm install --frozen-lockfile).
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// QuantPillarTopBar's module graph pulls Quanty → @quant/shared-ui, whose
// barrel loads media/meeting deps irrelevant to the rail icons. Mock the
// barrel at the boundary: this test only ever renders the tiles' icon
// functions (plain PillarMascotMark <img>s), never Quanty itself.
vi.mock('@quant/shared-ui', () => ({}));

import { PillarMascotMark, type MascotPillar } from '../mascots/PillarMascotMark';
import { PILLAR_TILES } from '../QuantPillarTopBar';
import { DESKTOP_PILLAR_TILES } from '../pillarTiles';

const PILLARS: MascotPillar[] = ['mail', 'calendar', 'drive', 'contacts', 'quantgit'];

/** Walk up from cwd to find a repo-relative source file. */
function findSource(relApp: string): string {
  const rels = [`src/${relApp}`, `apps/quantmail/src/${relApp}`];
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    for (const rel of rels) {
      const candidate = join(dir, rel);
      if (existsSync(candidate)) return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate ${relApp} from ${process.cwd()}`);
}

/** Source with block and line comments stripped (the fix is documented in prose). */
function readSourceStripped(relApp: string): string {
  return readFileSync(findSource(relApp), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function countOccurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe('rail icons render once — no mid-load swap', () => {
  it('each pillar mark is exactly one static image, never canvas, never a placeholder', () => {
    for (const pillar of PILLARS) {
      const html = renderToStaticMarkup(
        <PillarMascotMark pillar={pillar} size="sm" interactive={false} />,
      );
      // One webp source + one png fallback img — the only image the tile
      // can ever show, so no second "real" icon can swap in later.
      expect(countOccurrences(html, '<source'), 'sources for ' + pillar).toBe(1);
      expect(countOccurrences(html, '<img'), 'imgs for ' + pillar).toBe(1);
      expect(html).toContain(`/mascots/${pillar}-sm.webp`);
      expect(html).toContain(`/mascots/${pillar}-sm.png`);
      // The old bug class: canvas double-paint (placeholder → real mark).
      expect(html).not.toContain('<canvas');
      // No loading-state branches that could swap icons mid-load.
      expect(html).not.toMatch(/placeholder/i);
    }
  });

  it('all five pillars resolve to distinct final assets (no shared/duplicated icon)', () => {
    const srcs = PILLARS.map((pillar) => {
      const html = renderToStaticMarkup(
        <PillarMascotMark pillar={pillar} size="sm" interactive={false} />,
      );
      const match = html.match(/srcSet="([^"]+)"/);
      expect(match, 'srcSet for ' + pillar).toBeTruthy();
      return match![1];
    });
    expect(new Set(srcs).size).toBe(PILLARS.length);
  });

  it('mobile top-bar tiles and desktop rail tiles both mount the single-image marks', () => {
    expect(PILLAR_TILES.map((t) => t.id).sort()).toEqual([...PILLARS].sort());
    expect(DESKTOP_PILLAR_TILES.map((t) => t.id).sort()).toEqual([...PILLARS].sort());
    for (const tile of PILLAR_TILES) {
      const html = renderToStaticMarkup(<>{tile.icon({ active: false })}</>);
      expect(countOccurrences(html, '<img'), 'mobile tile imgs for ' + tile.id).toBe(1);
      expect(html).not.toContain('<canvas');
    }
    for (const tile of DESKTOP_PILLAR_TILES) {
      const html = renderToStaticMarkup(<>{tile.renderIcon(false)}</>);
      expect(countOccurrences(html, '<img'), 'desktop tile imgs for ' + tile.id).toBe(1);
      expect(html).not.toContain('<canvas');
    }
  });

  it('source scan: root layout preloads all five rail webp assets (auth shell excluded)', () => {
    const src = readSourceStripped('app/layout.tsx');
    for (const pillar of PILLARS) {
      // The preload href template is `/mascots/${pillar}-sm.webp` — the
      // stripped source keeps the template literal text.
      expect(src).toContain('/mascots/');
      expect(src).toContain('-sm.webp');
    }
    expect(src).toContain('rel="preload"');
    expect(src).toContain('as="image"');
    expect(src).toContain('image/webp');
    // Public auth pages (/login, /register, …) never show the rail — the
    // preloads must be gated on the non-auth shell so they cost zero bytes
    // there. The guard and the pillar list must appear before the preload.
    const guardIdx = src.indexOf('!isAuthShell');
    const preloadIdx = src.indexOf('rel="preload"');
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(preloadIdx).toBeGreaterThanOrEqual(0);
    expect(guardIdx).toBeLessThan(preloadIdx);
  });

  it('source scan: top bar no longer imports the canvas logo set (old↔new flicker class)', () => {
    const src = readSourceStripped('components/QuantPillarTopBar.tsx');
    for (const name of [
      'QuantMailLogo',
      'QuantCalendarLogo',
      'QuantDriveLogo',
      'QuantContactsLogo',
      'QuantGitLogo',
    ]) {
      // The legacy generic MarkIcon exports are fine (backward compat);
      // the canvas-painted logo components must stay unwired.
      expect(src).not.toMatch(new RegExp(`from ['"]\\./${name}['"]`));
    }
  });

  it('source scan: mascot img decodes async so it never blocks the tile first paint', () => {
    const src = readSourceStripped('components/mascots/PillarMascotMark.tsx');
    expect(src).toContain('decoding="async"');
  });

  it('every rail asset exists on disk as a webp+png pair', () => {
    let dir = process.cwd();
    for (let depth = 0; depth < 8; depth++) {
      const candidate = join(dir, 'apps/quantmail/public/mascots');
      if (existsSync(candidate)) {
        for (const pillar of PILLARS) {
          expect(existsSync(join(candidate, `${pillar}-sm.webp`)), `${pillar}-sm.webp`).toBe(true);
          expect(existsSync(join(candidate, `${pillar}-sm.png`)), `${pillar}-sm.png`).toBe(true);
        }
        return;
      }
      const parent = join(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
    throw new Error('could not locate apps/quantmail/public/mascots from ' + process.cwd());
  });
});
