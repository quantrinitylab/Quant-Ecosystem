// ============================================================================
// QuantCooks Studio — shared-file follow-up batch (F-1, F-2, F-4, nav
// flips, F-U3-2). This batch is the first unit allowed to edit shared
// studio files, so these tests pin what it changed:
//
//  - Nav flips: Image/Video/Promo are links now; Recipe Film Studio
//    flipped later, by the small-fixes unit, once Unit 5 had landed.
//    Voice Studio flipped by shared-file batch #2, once Unit 7 landed.
//    Quick Tools flipped by shared-file batch #3, once Unit 8 landed
//    /tools. Photo Editor and Story Series were added as entries by
//    shared-file batch #4, once C-3 and Unit 9 had landed
//    /studio/photo and /studio/stories. Credits flipped last, by
//    shared-file batch #5, once Unit 10 landed /account — no
//    STUDIO_NAV entry remains in build.
//    Workspace group (F-1): Projects,
//    Templates, Brand Kit are links; Connect QuantAI (CP-5, no route
//    yet) is disabled — never a dead link.
//  - F-1: `/` renders the studio Explore page (source-level: the page is
//    the /studio page's component; the teardown-era gallery is gone).
//  - F-2: the wizard photo step runs only after a real create, against
//    the created project's id, through the real upload seam; skipping is
//    an explicit state; the success state links the editor deep-link.
//  - F-4: every studio-* class used by the studio components and pages
//    has a rule in src/pages/globals.css. Film* files were excluded
//    while Unit 5 was still landing them; the small-fixes unit removed
//    the exclusion once Unit 5 had landed, so the assertion now spans
//    the Film surfaces too.
//  - F-U3-2: a controlled Composer renders markup identical to an
//    uncontrolled one seeded with the same settings, and prices from
//    the parent-owned settings.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioShell, STUDIO_NAV, SHELL_LINKS } from '../components/studio/StudioShell';
import { ExploreHome } from '../components/studio/ExploreHome';
import { Composer, defaultComposerSettings } from '../components/studio/Composer';
import { VideoStudio } from '../components/studio/VideoStudio';
import { STUDIO_PRESETS } from '../lib/studio/presets';
import type { ComposerSettings } from '../lib/studio/pricing';
import {
  canAttachPhoto,
  editorRouteFor,
  initialWizardState,
  runWizardPhotoUpload,
  selectPreset,
  skipWizardPhoto,
  type WizardPhotoClient,
  type WizardState,
} from '../lib/studio/wizard';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');

const renderShell = () =>
  renderToStaticMarkup(
    React.createElement(StudioShell, {
      active: 'explore',
      children: React.createElement('p', null, 'body'),
    }),
  );

describe('nav flips (follow-up batch)', () => {
  it('Image, Photo Editor, Video, Promo, Recipe Film, Story Series, Design Studio, Voice Studios, Quick Tools and Credits are links', () => {
    const byId = new Map(STUDIO_NAV.map((n) => [n.id, n.href]));
    expect(byId.get('image')).toBe('/studio/image');
    // Photo added by shared-file batch #4 (C-3 landed /studio/photo).
    expect(byId.get('photo')).toBe('/studio/photo');
    expect(byId.get('video')).toBe('/studio/video');
    expect(byId.get('promo')).toBe('/studio/promo');
    // Film flipped by the small-fixes unit (Unit 5 landed /studio/film).
    expect(byId.get('film')).toBe('/studio/film');
    // Stories added by shared-file batch #4 (Unit 9 landed /studio/stories).
    expect(byId.get('stories')).toBe('/studio/stories');
    // Design added by the C-7 unit (it landed /studio/design).
    expect(byId.get('design')).toBe('/studio/design');
    // Voice flipped by shared-file batch #2 (Unit 7 landed /studio/voice).
    expect(byId.get('voice')).toBe('/studio/voice');
    // Tools flipped by shared-file batch #3 (Unit 8 landed /tools).
    expect(byId.get('tools')).toBe('/tools');
    // Credits flipped by shared-file batch #5 (Unit 10 landed /account).
    expect(byId.get('credits')).toBe('/account');
    const html = renderShell();
    expect(html).toContain('href="/studio/image"');
    expect(html).toContain('href="/studio/photo"');
    expect(html).toContain('href="/studio/video"');
    expect(html).toContain('href="/studio/promo"');
    expect(html).toContain('href="/studio/film"');
    expect(html).toContain('href="/studio/stories"');
    expect(html).toContain('href="/studio/design"');
    expect(html).toContain('href="/studio/voice"');
    expect(html).toContain('href="/tools"');
    expect(html).toContain('href="/account"');
    expect(html).not.toContain('data-testid="nav-in-build-film"');
    expect(html).not.toContain('data-testid="nav-in-build-photo"');
    expect(html).not.toContain('data-testid="nav-in-build-stories"');
    expect(html).not.toContain('data-testid="nav-in-build-design"');
    expect(html).not.toContain('data-testid="nav-in-build-voice"');
    expect(html).not.toContain('data-testid="nav-in-build-tools"');
    // Credits flipped by shared-file batch #5 — no studio entry is in build.
    expect(html).not.toContain('data-testid="nav-in-build-credits"');
  });
});

describe('F-1 — shell workspace group', () => {
  it('Projects, Templates and Brand Kit link to real routes; Connect QuantAI is disabled', () => {
    const live = SHELL_LINKS.filter((n) => n.href !== null).map((n) => n.id);
    expect(live).toEqual(['projects', 'templates', 'brand-kit']);
    const html = renderShell();
    expect(html).toContain('href="/projects"');
    expect(html).toContain('href="/templates"');
    expect(html).toContain('href="/brand-kit"');
    expect(html).toContain('data-testid="nav-in-build-connect-quantai"');
    expect(html).toContain('Connect QuantAI');
  });
});

describe('F-1 — / is the studio Explore home', () => {
  it('pages/index.tsx renders the /studio Explore page component, not the old gallery', () => {
    const src = readFileSync(join(APP_ROOT, 'src', 'pages', 'index.tsx'), 'utf8');
    expect(src).toContain("from './studio/index'");
    expect(src).toContain('StudioExplorePage');
    expect(src).toContain('export default function HomePage');
    // The teardown-era gallery (no-op handlers, its own data hooks) is gone.
    expect(src).not.toContain('useProjects');
    expect(src).not.toContain('framer-motion');
  });

  it('the /studio page wires the real upload seam into the wizard (F-2)', () => {
    const src = readFileSync(join(APP_ROOT, 'src', 'pages', 'studio', 'index.tsx'), 'utf8');
    expect(src).toContain('useAssetUpload');
    expect(src).toContain('uploadPhoto');
    expect(src).toContain('ExploreHome');
  });
});

describe('F-2 — wizard photo step sequencing', () => {
  const createdState = (): WizardState => ({
    ...selectPreset(initialWizardState(), STUDIO_PRESETS[0]!),
    phase: 'created',
    createdProjectId: 'proj-42',
  });

  it('the editor deep-link is built from the created project id', () => {
    expect(editorRouteFor('proj-42')).toBe('/editor?projectId=proj-42');
    expect(editorRouteFor('a b/c')).toBe('/editor?projectId=a%20b%2Fc');
  });

  it('photo attach is impossible before a create, possible after', () => {
    expect(canAttachPhoto(initialWizardState())).toBe(false);
    expect(canAttachPhoto(createdState())).toBe(true);
  });

  it('an upload before create is refused with the reason, and the client is never called', async () => {
    const client: WizardPhotoClient = { uploadPhoto: vi.fn(async () => ({ id: 'a1', filename: 'dish.jpg' })) };
    const next = await runWizardPhotoUpload(initialWizardState(), new File(['x'], 'dish.jpg'), client);
    expect(next.photo.phase).toBe('error');
    expect(next.photo.error).toContain('Create the project first');
    expect(client.uploadPhoto).not.toHaveBeenCalled();
  });

  it('after create, the upload runs against the created project id and attaches by asset id', async () => {
    const client: WizardPhotoClient = {
      uploadPhoto: vi.fn(async () => ({ id: 'asset-9', filename: 'dish.jpg' })),
    };
    const file = new File(['x'], 'dish.jpg');
    const next = await runWizardPhotoUpload(createdState(), file, client);
    expect(client.uploadPhoto).toHaveBeenCalledWith('proj-42', file);
    expect(next.phase).toBe('created');
    expect(next.photo).toEqual({ phase: 'attached', assetId: 'asset-9', filename: 'dish.jpg', error: null });
  });

  it('an upload failure surfaces the real error and keeps the created project state', async () => {
    const client: WizardPhotoClient = {
      uploadPhoto: vi.fn(async () => {
        throw new Error('Upload failed (503)');
      }),
    };
    const next = await runWizardPhotoUpload(createdState(), new File(['x'], 'dish.jpg'), client);
    expect(next.phase).toBe('created');
    expect(next.createdProjectId).toBe('proj-42');
    expect(next.photo.phase).toBe('error');
    expect(next.photo.error).toBe('Upload failed (503)');
  });

  it('skipping is an explicit state; an attached photo cannot be skipped away', () => {
    const skipped = skipWizardPhoto(createdState());
    expect(skipped.photo.phase).toBe('skipped');
    expect(canAttachPhoto(skipped)).toBe(true); // changing your mind is allowed
    const attached: WizardState = {
      ...createdState(),
      photo: { phase: 'attached', assetId: 'a1', filename: 'dish.jpg', error: null },
    };
    expect(skipWizardPhoto(attached)).toBe(attached);
  });
});

describe('F-2 — ExploreHome success state', () => {
  const createdWizard = (over?: Partial<WizardState>): WizardState => ({
    ...selectPreset(initialWizardState(), STUDIO_PRESETS[0]!),
    phase: 'created',
    createdProjectId: 'proj-42',
    step: 3,
    ...over,
  });
  const uploadPhoto = vi.fn(async () => ({ id: 'asset-9', filename: 'dish.jpg' }));

  it('offers the editor deep-link, the projects gallery and the photo step', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExploreHome, {
        feedState: 'ready',
        createProject: vi.fn(async () => ({ success: true, data: { id: 'proj-42' } })),
        uploadPhoto,
        initialWizard: createdWizard(),
      }),
    );
    expect(html).toContain('data-testid="wizard-created"');
    expect(html).toContain('data-testid="wizard-open-editor"');
    expect(html).toContain('href="/editor?projectId=proj-42"');
    expect(html).toContain('data-testid="wizard-open-projects"');
    expect(html).toContain('href="/projects"');
    expect(html).toContain('data-testid="wizard-photo-step"');
    expect(html).toContain('data-testid="wizard-photo-input"');
    expect(html).toContain('data-testid="wizard-photo-skip"');
  });

  it('an attached photo is reported by filename in the success state', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExploreHome, {
        feedState: 'ready',
        createProject: vi.fn(async () => ({ success: true, data: { id: 'proj-42' } })),
        uploadPhoto,
        initialWizard: createdWizard({
          photo: { phase: 'attached', assetId: 'asset-9', filename: 'dish.jpg', error: null },
        }),
      }),
    );
    expect(html).toContain('data-testid="wizard-photo-attached"');
    expect(html).toContain('dish.jpg');
  });

  it('without an upload seam the photo step says so instead of offering a dead control', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExploreHome, {
        feedState: 'ready',
        createProject: vi.fn(async () => ({ success: true, data: { id: 'proj-42' } })),
        initialWizard: createdWizard(),
      }),
    );
    expect(html).toContain('data-testid="wizard-photo-unavailable"');
    expect(html).not.toContain('data-testid="wizard-photo-input"');
  });
});

describe('F-4 — studio CSS coverage', () => {
  const studioSourceFiles = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.tsx')) out.push(full);
      }
    };
    walk(join(APP_ROOT, 'src', 'components', 'studio'));
    walk(join(APP_ROOT, 'src', 'pages', 'studio'));
    out.push(join(APP_ROOT, 'src', 'pages', 'index.tsx'));
    return out;
  };

  const classesUsed = (files: string[]): Set<string> => {
    const classes = new Set<string>();
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const chunks: string[] = [];
      for (const m of src.matchAll(/className="([^"]*)"/g)) chunks.push(m[1]!);
      for (const m of src.matchAll(/className=\{([^}]*)\}/g)) {
        for (const s of m[1]!.matchAll(/'([^']+)'/g)) chunks.push(s[1]!);
      }
      for (const m of src.matchAll(/const className = '([^']+)'/g)) chunks.push(m[1]!);
      for (const chunk of chunks) {
        for (const token of chunk.split(/\s+/)) {
          if (token.startsWith('studio-')) classes.add(token);
        }
      }
    }
    return classes;
  };

  it('every studio-* class used by the studio components/pages has a rule in globals.css', () => {
    const css = readFileSync(join(APP_ROOT, 'src', 'pages', 'globals.css'), 'utf8');
    // No exclusions: the small-fixes unit removed the Film* carve-out
    // once Unit 5 landed, so Film surfaces are covered by this too.
    const files = studioSourceFiles();
    const classes = classesUsed(files);
    expect(classes.size).toBeGreaterThan(100);
    const missing = [...classes].filter(
      (c) => !new RegExp(`\\.${c.replace(/-/g, '\\-')}(?![a-zA-Z0-9_-])`).test(css),
    );
    expect(missing).toEqual([]);
  });
});

describe('F-U3-2 — Composer controlled settings', () => {
  it('defaultComposerSettings reproduces the per-kind seeds the Composer always used', () => {
    expect(defaultComposerSettings('image')).toEqual({
      modelId: 'qc-still-standard',
      ratio: '1:1',
      resolution: 'Draft',
      durationSeconds: 0,
      batch: 1,
      audioOn: true,
      stackedExtras: 0,
    });
    expect(defaultComposerSettings('video')).toEqual({
      modelId: 'qc-motion-standard',
      ratio: '9:16',
      resolution: '720p',
      durationSeconds: 5,
      batch: 1,
      audioOn: true,
      stackedExtras: 0,
    });
    expect(defaultComposerSettings('ad', { stackedExtras: 2 }).stackedExtras).toBe(2);
  });

  it('a controlled Composer renders markup identical to an uncontrolled one with the same settings', () => {
    const settings: ComposerSettings = {
      ...defaultComposerSettings('video'),
      ratio: '16:9',
      durationSeconds: 15,
    };
    const onSettingsChange = vi.fn();
    const controlled = renderToStaticMarkup(
      React.createElement(Composer, {
        kind: 'video' as const,
        initialPrompt: 'Steam rising off a thali',
        settings,
        onSettingsChange,
      }),
    );
    const uncontrolled = renderToStaticMarkup(
      React.createElement(Composer, {
        kind: 'video' as const,
        initialPrompt: 'Steam rising off a thali',
        initialSettings: { ratio: '16:9', durationSeconds: 15 },
      }),
    );
    expect(controlled).toBe(uncontrolled);
    // Priced from the parent-owned settings: 8 base + (15-5)s x 1 = 18.
    expect(controlled).toContain('Generate · 18 credits');
  });

  it('Video Studio prices its initial camera stack through the controlled settings', () => {
    const html = renderToStaticMarkup(
      React.createElement(VideoStudio, {
        assetsState: 'ready' as const,
        initialPrompt: 'A slow push-in on a sizzling pan',
        initialCameraStack: ['plate-push-in', 'cake-orbit'],
      }),
    );
    // 8 base + 2 stacked moves x 2 credits = 12, with no remount involved.
    expect(html).toContain('Generate · 12 credits');
    expect(html).toContain('Plate Push-In + Cake Orbit · 2 moves');
  });
});
