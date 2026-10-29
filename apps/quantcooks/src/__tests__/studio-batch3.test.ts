// ============================================================================
// QuantCooks Studio — shared-file batch #3: the Promo presenter selection
// persists. Batch #2 wired Promo Studio's presenter slot to the Voice
// Studio persona library but left the selection as session state only
// (PromoDraft had no presenterId). Batch #3 closes that follow-up:
//
//  - lib: PromoDraft carries presenterId; serialize/parse round-trips
//    it; legacy mirrors (written before the field existed) and junk
//    values parse to null, field-by-field like every other field.
//  - component: on load the screen restores the pick from its own
//    draft mirror (the persona record itself stays in Voice Studio's
//    mirror — only the id travels), and a persisted id that no longer
//    resolves against the library is no selection (batch #2's stale
//    rule, now applied to the restored pick too).
//
// Same approach as the other studio suites: react-dom/server, no DOM
// environment; window.localStorage is stubbed with an in-memory fake
// only for the mirror reads (state initialisers run during SSR).
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  EMPTY_PROMO_DRAFT,
  PROMO_DRAFT_KEY,
  parsePromoDraft,
  serializePromoDraft,
  type PromoDraft,
} from '../lib/studio/promo';
import { PromoStudio, type PromoStudioProps } from '../components/studio/PromoStudio';
import {
  createPersonaDraft,
  defaultPersonaPicks,
  type ChefPersona,
} from '../lib/studio/voice';

const persona = (over: Partial<ChefPersona> = {}): ChefPersona => ({
  ...createPersonaDraft({
    id: 'persona-1',
    name: 'Meera',
    presenterType: 'Home Chef',
    picks: defaultPersonaPicks(),
    referenceAssetIds: [],
    consent: null,
    createdAt: '2026-10-29T00:00:00.000Z',
  }),
  ...over,
});

const render = (props: Partial<PromoStudioProps>) =>
  renderToStaticMarkup(
    React.createElement(PromoStudio, {
      assetsState: 'ready',
      assets: [],
      brandKits: [],
      brandKitsState: 'ready',
      projectId: 'proj-1',
      ...props,
    }),
  );

// ---------------------------------------------------------------------------
// Lib: presenterId in the draft mirror
// ---------------------------------------------------------------------------

describe('batch #3 — promo draft presenterId', () => {
  it('round-trips a full draft including the presenter selection', () => {
    const draft: PromoDraft = { ...EMPTY_PROMO_DRAFT, presenterId: 'persona-1', prompt: 'Steam' };
    expect(parsePromoDraft(serializePromoDraft(draft))).toEqual(draft);
    expect(JSON.parse(serializePromoDraft(draft)).presenterId).toBe('persona-1');
  });

  it('the empty draft carries no presenter', () => {
    expect(EMPTY_PROMO_DRAFT.presenterId).toBeNull();
  });

  it('a legacy mirror written before presenterId existed parses to no selection', () => {
    const legacy = JSON.stringify({
      product: null,
      formatId: 'unboxing',
      hookStyle: null,
      setting: null,
      brandKitId: null,
      prompt: 'Old draft',
    });
    const parsed = parsePromoDraft(legacy);
    expect(parsed.presenterId).toBeNull();
    expect(parsed.formatId).toBe('unboxing');
    expect(parsed.prompt).toBe('Old draft');
  });

  it('junk presenterId values are dropped, never trusted', () => {
    expect(parsePromoDraft(JSON.stringify({ presenterId: '' })).presenterId).toBeNull();
    expect(parsePromoDraft(JSON.stringify({ presenterId: 42 })).presenterId).toBeNull();
    expect(parsePromoDraft(JSON.stringify({ presenterId: null })).presenterId).toBeNull();
    expect(parsePromoDraft(JSON.stringify({ presenterId: 'persona-9' })).presenterId).toBe('persona-9');
  });
});

// ---------------------------------------------------------------------------
// Component: the restored pick, and the stale rule applied to it
// ---------------------------------------------------------------------------

describe('batch #3 — PromoStudio restores the presenter pick from its draft mirror', () => {
  const store = new Map<string, string>();

  const stubMirror = (draft: Partial<PromoDraft>) => {
    store.clear();
    store.set(PROMO_DRAFT_KEY, serializePromoDraft({ ...EMPTY_PROMO_DRAFT, ...draft }));
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    store.clear();
  });

  it('a persisted presenterId restores the selection on load — the pick survives a reload', () => {
    stubMirror({ presenterId: 'persona-1' });
    const html = render({ initialPersonas: [persona({})] });
    expect(html).toContain('data-testid="promo-presenter-selected"');
    expect(html).toContain('Meera');
    expect(html).toContain('Draft — training not configured');
    // The chip mirrors the restored slot, exactly like a fresh pick.
    expect(html).toContain('Presenter: Meera');
  });

  it('an explicit initialPresenterId still wins over the mirror', () => {
    stubMirror({ presenterId: 'persona-1' });
    const html = render({
      initialPersonas: [persona({}), persona({ id: 'persona-2', name: 'Arjun' })],
      initialPresenterId: 'persona-2',
    });
    expect(html).toContain('data-testid="promo-presenter-selected"');
    expect(html).toContain('Presenter: Arjun');
  });

  it('a persisted id that no longer resolves against the library is no selection', () => {
    stubMirror({ presenterId: 'persona-gone' });
    const html = render({ initialPersonas: [persona({})] });
    expect(html).not.toContain('data-testid="promo-presenter-selected"');
    expect(html).toContain('data-testid="promo-presenter-list"');
    expect(html).toContain('data-testid="promo-presenter-pick-persona-1"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('Presenter:');
  });

  it('with no mirror at all the slot behaves exactly as before (no selection)', () => {
    stubMirror({});
    const html = render({ initialPersonas: [persona({})] });
    expect(html).not.toContain('data-testid="promo-presenter-selected"');
    expect(html).toContain('data-testid="promo-presenter-list"');
  });
});
