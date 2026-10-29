// ============================================================================
// QuantCooks Studio — shared-file batch #5 (micro-batch). Pins:
//
//  - Credits nav flip (Unit 10's follow-up): the STUDIO_NAV credits
//    entry links to /account, so NO STUDIO_NAV entry remains in build.
//    The workspace group's Connect QuantAI entry stays disabled — a
//    separate, deliberate state (the unbuilt CP-5 connect surface),
//    not a studio nav entry.
//  - Stale copy (spotted by batch #4): the persona notes in Video
//    Studio and the Film workspace no longer claim personas are
//    created in a Voice Studio that is "still in build" — Voice
//    Studio is a live route, /studio/voice.
//  - Photo page active state: /studio/photo marks its own nav entry
//    active ('photo'), not 'assets'.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioShell, STUDIO_NAV } from '../components/studio/StudioShell';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');

describe('batch #5 — credits nav flip', () => {
  it('credits links to /account; no STUDIO_NAV entry remains in build', () => {
    const byId = new Map(STUDIO_NAV.map((n) => [n.id, n.href]));
    expect(byId.get('credits')).toBe('/account');
    // The in-build pin has nowhere to move: every studio entry is a link.
    expect(STUDIO_NAV.filter((n) => n.href === null)).toEqual([]);
    const html = renderToStaticMarkup(
      React.createElement(StudioShell, {
        active: 'explore',
        children: React.createElement('p', null, 'body'),
      }),
    );
    expect(html).toContain('href="/account"');
    expect(html).not.toContain('data-testid="nav-in-build-credits"');
    // The distinction stays accurate: Connect QuantAI (workspace group,
    // CP-5) is still a deliberate disabled entry, not a studio nav item.
    expect(html).toContain('data-testid="nav-in-build-connect-quantai"');
  });
});

describe('batch #5 — stale Voice Studio copy corrected', () => {
  it('Video Studio’s persona note points at the Voice Studio that exists', () => {
    const src = readFileSync(
      join(APP_ROOT, 'src', 'components', 'studio', 'VideoStudio.tsx'),
      'utf8',
    );
    expect(src).not.toContain('Voice Studio unit');
    expect(src).not.toContain('which is still in');
    expect(src).toContain('personas are created in Voice Studio (which lives at');
    expect(src).toContain('/studio/voice) — so this chip stays empty');
  });

  it('the Film workspace’s presenter note points at the Voice Studio that exists', () => {
    const src = readFileSync(
      join(APP_ROOT, 'src', 'components', 'studio', 'FilmWorkspace.tsx'),
      'utf8',
    );
    expect(src).not.toContain('Voice Studio unit');
    expect(src).toContain('Voice Studio (which lives at /studio/voice) with an own-likeness consent gate');
  });
});

describe('batch #5 — photo page active state', () => {
  it('/studio/photo marks the photo nav entry active, not assets', () => {
    const src = readFileSync(join(APP_ROOT, 'src', 'pages', 'studio', 'photo.tsx'), 'utf8');
    expect(src).toContain('<StudioShell active="photo">');
    expect(src).not.toContain('<StudioShell active="assets">');
  });
});
