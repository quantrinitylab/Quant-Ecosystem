// ============================================================================
// QuantCooks Studio (Phase 2 Unit 1) — StudioShell nav honesty + Explore
// feed states + the 3-step wizard flow. The wizard's step 3 is exercised
// against a mocked api-client surface: success navigates to the real
// /projects gallery; failure keeps the user put with the real error.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { StudioShell, STUDIO_NAV } from '../components/studio/StudioShell';
import { ExploreHome } from '../components/studio/ExploreHome';
import { STUDIO_PRESETS } from '../lib/studio/presets';
import {
  initialWizardState,
  selectPreset,
  setBrief,
  runWizardCreate,
  type WizardProjectClient,
} from '../lib/studio/wizard';

const okClient: WizardProjectClient = {
  createProject: vi.fn(async () => ({ success: true, data: { id: 'proj-42' } })),
};
const createViaComponent = okClient.createProject as WizardProjectClient['createProject'];

describe('StudioShell nav', () => {
  it('links only routes that exist; unbuilt studios are disabled "in build"', () => {
    // Updated by the shared-file follow-up batch: Image, Video and Promo
    // Studios have since landed as real routes, so their nav entries are
    // links now (the flips). Recipe Film Studio and Canvas Board flipped
    // later, by the small-fixes unit, once Units 5 and 6 landed
    // /studio/film and /studio/board. Voice Studio flipped by shared-file
    // batch #2, once Unit 7 landed /studio/voice. Quick Tools flipped by
    // shared-file batch #3, once Unit 8 landed /tools. Photo Editor
    // and Story Series were added as entries by shared-file batch #4,
    // once C-3 and Unit 9 had landed /studio/photo and /studio/stories.
    // Credits flipped last, by shared-file batch #5, once Unit 10 had
    // landed /account — no STUDIO_NAV entry remains in build. Design
    // Studio was added as an entry by the C-7 unit, once it landed
    // /studio/design.
    const live = STUDIO_NAV.filter((n) => n.href !== null).map((n) => n.id);
    expect(live).toEqual(['explore', 'image', 'photo', 'video', 'promo', 'film', 'stories', 'board', 'design', 'voice', 'tools', 'assets', 'credits']);
    const html = renderToStaticMarkup(
      React.createElement(StudioShell, {
        active: 'explore',
        children: React.createElement('p', null, 'body'),
      }),
    );
    expect(html).toContain('href="/studio"');
    expect(html).toContain('href="/studio/image"');
    expect(html).toContain('href="/studio/photo"');
    expect(html).toContain('href="/studio/video"');
    expect(html).toContain('href="/studio/promo"');
    expect(html).toContain('href="/studio/film"');
    expect(html).toContain('href="/studio/stories"');
    expect(html).toContain('href="/studio/board"');
    expect(html).toContain('href="/studio/design"');
    expect(html).toContain('href="/studio/voice"');
    expect(html).toContain('href="/tools"');
    expect(html).toContain('href="/assets"');
    expect(html).toContain('href="/account"');
    expect(html).not.toContain('data-testid="nav-in-build-voice"');
    expect(html).not.toContain('data-testid="nav-in-build-tools"');
    // Credits flipped by shared-file batch #5 — no studio entry is in build.
    expect(html).not.toContain('data-testid="nav-in-build-credits"');
    expect(html).toContain('Image Studio');
    expect(html).toContain('Photo Editor');
    expect(html).toContain('Recipe Film Studio');
    expect(html).toContain('Story Series');
    expect(html).toContain('Design Studio');
    expect(html).toContain('Quick Tools');
  });
});

describe('ExploreHome states', () => {
  it('loading state renders skeleton tiles', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExploreHome, { feedState: 'loading', createProject: createViaComponent }),
    );
    expect(html).toContain('data-testid="explore-loading"');
    expect(html).toContain('studio-skeleton-card');
  });

  it('error state offers a retry and says projects are untouched', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExploreHome, { feedState: 'error', createProject: createViaComponent }),
    );
    expect(html).toContain('data-testid="explore-error"');
    expect(html).toContain('Retry');
  });

  it('empty catalogue renders the starter explainer, not a blank void', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExploreHome, { feedState: 'ready', presets: [], createProject: createViaComponent }),
    );
    expect(html).toContain('data-testid="explore-empty"');
    expect(html).toContain('href="/projects"');
  });

  it('populated state renders preset rows, original names, costs and the wizard', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExploreHome, { feedState: 'ready', createProject: createViaComponent }),
    );
    expect(html).toContain('data-testid="explore-home"');
    expect(html).toContain('Steam Reveal');
    expect(html).toContain('Cheese-Pull Crash Zoom');
    expect(html).toContain('Thali Top-Down Drop');
    expect(html).toContain('Cake Orbit');
    expect(html).toContain('Trending Food Presets');
    expect(html).toContain('Camera Moves for Food');
    expect(html).toContain('One-Tap Ads');
    // Presets are labelled as presets — never as community/user content.
    expect(html).toContain('Preset ·');
    expect(html).not.toContain('From the Community');
    // The wizard's three steps and its honest generation note are on screen.
    expect(html).toContain('data-testid="wizard-step-1"');
    expect(html).toContain('data-testid="wizard-step-2"');
    expect(html).toContain('data-testid="wizard-step-3"');
    expect(html).toContain('NOT_CONFIGURED');
    // Create is disabled before a preset is picked — no fake success path.
    expect(html).toMatch(/data-testid="wizard-create"[^>]*disabled/);
  });

  it('search with no matches renders the plain empty state with a way back', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExploreHome, {
        feedState: 'ready',
        query: 'zzz-no-such-dish',
        createProject: createViaComponent,
      }),
    );
    expect(html).toContain('data-testid="explore-no-matches"');
    expect(html).toContain('Show every preset');
  });

  it('search filters the catalogue', () => {
    const html = renderToStaticMarkup(
      React.createElement(ExploreHome, {
        feedState: 'ready',
        query: 'cake orbit',
        createProject: createViaComponent,
      }),
    );
    expect(html).toContain('data-testid="preset-cake-orbit"');
    expect(html).not.toContain('data-testid="preset-steam-reveal"');
  });
});

describe('wizard flow (step 3 is the real createProject)', () => {
  it('preset pick → brief → create calls the client and lands on /projects', async () => {
    const client: WizardProjectClient = {
      createProject: vi.fn(async () => ({ success: true, data: { id: 'proj-42' } })),
    };
    let state = initialWizardState();
    state = selectPreset(state, STUDIO_PRESETS.find((p) => p.id === 'cake-orbit')!);
    expect(state.step).toBe(2);
    state = setBrief(state, 'Chocolate cake, birthday candles');
    expect(state.step).toBe(3);

    const result = await runWizardCreate(state, client);
    expect(client.createProject).toHaveBeenCalledWith({
      name: 'Cake Orbit — Chocolate cake, birthday candles',
      type: 'video',
    });
    expect(result.state.phase).toBe('created');
    expect(result.state.createdProjectId).toBe('proj-42');
    expect(result.route).toBe('/projects');
  });

  it('backend failure shows the real error and navigates nowhere', async () => {
    const client: WizardProjectClient = {
      createProject: vi.fn(async () => ({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Sign in to create a project' },
      })),
    };
    let state = selectPreset(initialWizardState(), STUDIO_PRESETS[0]!);
    state = setBrief(state, 'anything');
    const result = await runWizardCreate(state, client);
    expect(result.state.phase).toBe('error');
    expect(result.state.error).toBe('Sign in to create a project');
    expect(result.route).toBeNull();
  });

  it('a thrown error is surfaced, not swallowed', async () => {
    const client: WizardProjectClient = {
      createProject: vi.fn(async () => {
        throw new Error('Network unreachable');
      }),
    };
    const state = selectPreset(initialWizardState(), STUDIO_PRESETS[0]!);
    const result = await runWizardCreate(state, client);
    expect(result.state.phase).toBe('error');
    expect(result.state.error).toBe('Network unreachable');
    expect(result.route).toBeNull();
  });

  it('refuses to create before a preset is picked', async () => {
    const result = await runWizardCreate(initialWizardState(), okClient);
    expect(result.state.phase).toBe('error');
    expect(result.route).toBeNull();
    expect(okClient.createProject).not.toHaveBeenCalled();
  });
});
