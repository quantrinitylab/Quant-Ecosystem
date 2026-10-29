// ============================================================================
// QuantCooks Studio (Phase 2 Unit 5) — Recipe Film Studio: lib logic +
// rendering. Same approach as Units 1–4: react-dom/server against the
// established vitest setup, no new dependencies, no DOM environment.
// Interaction-only state is proven the Units 1–4 way: the pure lib
// functions carry the rules (shot CRUD, the storyboard gate machine, the
// Director outcome), and components render with the initial props a click
// would have produced. The two honesty proofs this unit owes:
//  - the Director can NEVER fabricate a shot list (its outcome type has
//    no shots at all), and
//  - the approve-frames gate keeps its two block reasons separate:
//    unapproved frames AND provider-not-configured, never collapsed.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { ServerAsset, ServerProject } from '../services/api-client';
import type { StudioJob } from '../lib/studio/jobs';
import { computeQuote, DEFAULT_COMPOSER_SETTINGS, type ComposerSettings } from '../lib/studio/pricing';
import {
  DIRECTOR_STARTERS,
  EMPTY_FILM_DRAFT,
  FILM_BRIEF_SECTIONS,
  FILM_ELEMENT_GROUPS,
  FILM_GENRES,
  FILM_PLAN_TOOL,
  FILM_SHOTS_TOOL,
  addShot,
  attemptDirectorPlan,
  elementFromAsset,
  elementsByKind,
  emptyBrief,
  emptyShot,
  filmDraftKey,
  filmGenreById,
  filmResultsFromJobs,
  filmStyleSummary,
  filterFilmProjects,
  generationGate,
  insertBlock,
  moveShot,
  nextShotId,
  parseFilmDraft,
  pickableElementAssets,
  removeShot,
  runFilmCreate,
  serializeFilmDraft,
  shotListQuote,
  shotQuote,
  shotQuoteSettings,
  sortFilmProjects,
  updateShot,
  type FilmDraft,
  type FilmShot,
} from '../lib/studio/film';
import { FilmStudio, type FilmStudioProps } from '../components/studio/FilmStudio';
import { FilmWorkspace, type FilmWorkspaceProps } from '../components/studio/FilmWorkspace';
import { FilmDirector, type FilmDirectorProps } from '../components/studio/FilmDirector';
import { GenrePickerModal, StylePanel } from '../components/studio/FilmPickers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const asset = (over: Partial<ServerAsset>): ServerAsset => ({
  id: 'asset-1',
  projectId: 'proj-1',
  filename: 'thali-hero.jpg',
  type: 'image',
  size: 4096,
  uploadedAt: '2026-10-29T00:00:00.000Z',
  url: 'https://signed.example/thali-hero.jpg',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/u/proj-1/asset-1/thali-hero.jpg',
  ...over,
});

const project = (over: Partial<ServerProject>): ServerProject => ({
  id: 'proj-1',
  userId: 'user-1',
  name: 'Monsoon Thali — a short film',
  type: 'video',
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
  deletedAt: null,
  ...over,
});

const shot = (over: Partial<FilmShot>): FilmShot => ({
  ...emptyShot('shot-1'),
  title: 'The tadka',
  description: 'Hot ghee poured over the dal',
  durationSeconds: 5,
  ...over,
});

const base: ComposerSettings = DEFAULT_COMPOSER_SETTINGS;

// ---------------------------------------------------------------------------
// Genres, style, brief blocks
// ---------------------------------------------------------------------------

describe('film genres and style', () => {
  it('carries the five original genres from the spec', () => {
    expect(FILM_GENRES.map((g) => g.name)).toEqual([
      'Family Kitchen',
      'Street-Food Energy',
      'Fine-Dine Calm',
      'Festival Colour',
      'Home Comfort',
    ]);
    expect(filmGenreById('festival-colour')?.name).toBe('Festival Colour');
    expect(filmGenreById('nope')).toBeNull();
    expect(filmGenreById(null)).toBeNull();
  });

  it('summarises the three style picks on one line', () => {
    expect(
      filmStyleSummary({ palette: 'Warm & Golden', lighting: 'Golden Hour', moveset: 'One-Take Flow' }),
    ).toBe('Warm & Golden colour · Golden Hour light · One-Take Flow moves');
  });

  it('has all six brief sections and inserts slash blocks as scaffolds', () => {
    expect(FILM_BRIEF_SECTIONS.map((s) => s.id)).toEqual([
      'context',
      'story',
      'look',
      'production',
      'status',
      'resources',
    ]);
    expect(Object.keys(emptyBrief())).toHaveLength(6);
    expect(insertBlock('', 'bullets')).toBe('• ');
    expect(insertBlock('line one', 'checklist')).toBe('line one\n☐ ');
    expect(insertBlock('line one\n', 'quote')).toBe('line one\n“  ”');
    expect(insertBlock('unchanged', 'text')).toBe('unchanged');
    expect(insertBlock('unchanged', 'bogus')).toBe('unchanged');
  });
});

// ---------------------------------------------------------------------------
// Elements — READY-only, asset-derived kinds, presenter excluded
// ---------------------------------------------------------------------------

describe('film elements', () => {
  it('offers only READY image/video assets as elements', () => {
    const assets = [
      asset({ id: 'a-ready', uploadStatus: 'READY' }),
      asset({ id: 'a-pending', uploadStatus: 'PENDING' }),
      asset({ id: 'a-clip', type: 'video', uploadStatus: 'READY' }),
      asset({ id: 'a-audio', type: 'audio', uploadStatus: 'READY' }),
    ];
    expect(pickableElementAssets(assets).map((a) => a.id)).toEqual(['a-ready', 'a-clip']);
  });

  it('defaults image elements to dish and clips to kitchen, never presenter', () => {
    expect(elementFromAsset(asset({ type: 'image' })).kind).toBe('dish');
    expect(elementFromAsset(asset({ type: 'video' })).kind).toBe('kitchen');
    expect(FILM_ELEMENT_GROUPS.map((g) => g.id)).toContain('presenter');
  });

  it('groups elements by kind', () => {
    const elements = [
      elementFromAsset(asset({ id: 'a1' }), 'dish'),
      elementFromAsset(asset({ id: 'a2' }), 'dish'),
      elementFromAsset(asset({ id: 'a3' }), 'product'),
    ];
    expect(elementsByKind(elements, 'dish')).toHaveLength(2);
    expect(elementsByKind(elements, 'kitchen')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Shot list CRUD + reorder
// ---------------------------------------------------------------------------

describe('manual shot list', () => {
  it('adds, updates, removes and reorders shots without mutating the input', () => {
    const start: FilmShot[] = [];
    const withOne = addShot(start, shot({ id: 'shot-1' }));
    const withTwo = addShot(withOne, shot({ id: 'shot-2', title: 'The plating' }));
    expect(start).toHaveLength(0);
    expect(withTwo.map((s) => s.id)).toEqual(['shot-1', 'shot-2']);

    const edited = updateShot(withTwo, 'shot-1', { durationSeconds: 10, frameApproved: true });
    expect(edited[0]?.durationSeconds).toBe(10);
    expect(edited[0]?.frameApproved).toBe(true);
    expect(edited[1]?.durationSeconds).toBe(5);

    expect(moveShot(withTwo, 'shot-2', -1).map((s) => s.id)).toEqual(['shot-2', 'shot-1']);
    expect(moveShot(withTwo, 'shot-1', 1).map((s) => s.id)).toEqual(['shot-2', 'shot-1']);
    expect(moveShot(withTwo, 'shot-1', -1)).toBe(withTwo); // edge no-op, same array
    expect(moveShot(withTwo, 'missing', 1)).toBe(withTwo);

    expect(removeShot(withTwo, 'shot-1').map((s) => s.id)).toEqual(['shot-2']);
  });

  it('derives the next shot id from the highest existing suffix', () => {
    expect(nextShotId([])).toBe('shot-1');
    expect(nextShotId([shot({ id: 'shot-3' }), shot({ id: 'shot-7' })])).toBe('shot-8');
    expect(nextShotId([shot({ id: 'custom' })])).toBe('shot-1');
  });
});

// ---------------------------------------------------------------------------
// Quotes — composed on pricing.ts, never a parallel table
// ---------------------------------------------------------------------------

describe('shot quotes', () => {
  it('a shot quote IS computeQuote with the shot composed in', () => {
    const plain = shot({ cameraMoveId: null, durationSeconds: 8 });
    expect(shotQuote(base, plain)).toEqual(computeQuote('video', shotQuoteSettings(base, plain)));
    expect(shotQuoteSettings(base, plain)).toMatchObject({
      durationSeconds: 8,
      batch: 1,
      stackedExtras: 0,
    });
  });

  it('a camera move prices through the stacked-extras term, like Video Studio', () => {
    const withMove = shot({ cameraMoveId: 'cake-orbit', durationSeconds: 5 });
    const without = shot({ cameraMoveId: null, durationSeconds: 5 });
    expect(shotQuoteSettings(base, withMove).stackedExtras).toBe(1);
    expect(shotQuote(base, withMove).credits).toBe(shotQuote(base, without).credits + 2);
  });

  it('the list quote is the plain sum of per-shot quotes, with one line per shot', () => {
    const shots = [shot({ id: 'shot-1' }), shot({ id: 'shot-2', durationSeconds: 15, cameraMoveId: 'pack-spin' })];
    const total = shotListQuote(base, shots);
    expect(total.credits).toBe(shotQuote(base, shots[0]!).credits + shotQuote(base, shots[1]!).credits);
    expect(total.lines).toHaveLength(2);
    expect(total.lines[0]).toContain('The tadka');
    expect(shotListQuote(base, []).credits).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The storyboard gate — reasons stay separate, arming is structural
// ---------------------------------------------------------------------------

describe('storyboard approve-frames gate', () => {
  it('with no shots, asks for a shot and still reports the provider block', () => {
    const gate = generationGate([], false);
    expect(gate.armed).toBe(false);
    expect(gate.reasons).toHaveLength(2);
    expect(gate.reasons[0]).toContain('Add at least one shot');
    expect(gate.reasons[1]).toContain('NOT_CONFIGURED');
  });

  it('unapproved frames + no provider = exactly two separate reasons', () => {
    const gate = generationGate([shot({ frameApproved: false }), shot({ id: 'shot-2', frameApproved: true })], false);
    expect(gate.armed).toBe(false);
    expect(gate.approvedCount).toBe(1);
    expect(gate.unapprovedCount).toBe(1);
    expect(gate.reasons).toHaveLength(2);
    expect(gate.reasons[0]).toContain('still unapproved');
    expect(gate.reasons[0]).toContain('approve frames before any video credits move');
    expect(gate.reasons[1]).toContain(FILM_SHOTS_TOOL);
  });

  it('all frames approved + no provider = only the not-configured reason remains', () => {
    const gate = generationGate([shot({ frameApproved: true })], false);
    expect(gate.armed).toBe(false);
    expect(gate.reasons).toHaveLength(1);
    expect(gate.reasons[0]).toContain('NOT_CONFIGURED');
    expect(gate.reasons[0]).not.toContain('unapproved');
  });

  it('all frames approved + provider configured = the gate arms', () => {
    const gate = generationGate([shot({ frameApproved: true })], true);
    expect(gate.armed).toBe(true);
    expect(gate.reasons).toEqual([]);
  });

  it('unapproved frames block even when a provider exists', () => {
    const gate = generationGate([shot({ frameApproved: false })], true);
    expect(gate.armed).toBe(false);
    expect(gate.reasons).toHaveLength(1);
    expect(gate.reasons[0]).toContain('still unapproved');
  });
});

// ---------------------------------------------------------------------------
// AI Director — the outcome can never carry a fabricated shot list
// ---------------------------------------------------------------------------

describe('AI Director planning attempt', () => {
  it('rejects an empty ask', () => {
    expect(attemptDirectorPlan('   ').status).toBe('invalid');
  });

  it('lands on NOT_CONFIGURED naming both twins, preserving the ask verbatim', () => {
    const outcome = attemptDirectorPlan('  Break the dal tadka into three shots  ');
    expect(outcome.status).toBe('not-configured');
    if (outcome.status !== 'not-configured') throw new Error('unreachable');
    expect(outcome.ask).toBe('Break the dal tadka into three shots');
    expect(outcome.tools).toEqual([FILM_PLAN_TOOL, FILM_SHOTS_TOOL]);
    expect(outcome.message).toContain('quantcooks.plan_project');
    expect(outcome.message).toContain('quantcooks.create_shot_sequence');
    expect(outcome.message).toContain('PLANNER_NOT_CONFIGURED');
    expect(outcome.message).toContain('never charged');
    // Fabrication proof: the outcome type has no shots field at all.
    expect('shots' in outcome).toBe(false);
    expect(DIRECTOR_STARTERS).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Draft mirror — round-trip + defensive parse
// ---------------------------------------------------------------------------

describe('film draft mirror', () => {
  const fullDraft: FilmDraft = {
    brief: { ...emptyBrief(), context: 'A thali film for the weekend launch', look: '@thali-hero' },
    shots: [shot({ cameraMoveId: 'cake-orbit', elementIds: ['asset-1'], frameApproved: true })],
    elements: [elementFromAsset(asset({}), 'dish')],
    genreId: 'festival-colour',
    style: { palette: 'Bold Festival', lighting: 'Celebration Glow', moveset: 'Auto' },
    heroPrompt: 'Steam over the thali',
    directorAsk: 'Plan it in five shots',
  };

  it('round-trips a full draft and keys mirrors per project', () => {
    expect(parseFilmDraft(serializeFilmDraft(fullDraft))).toEqual(fullDraft);
    expect(filmDraftKey('proj-9')).toBe('quantcooks.film.draft.v1.proj-9');
  });

  it('drops malformed fields instead of trusting them', () => {
    expect(parseFilmDraft(null)).toEqual(EMPTY_FILM_DRAFT);
    expect(parseFilmDraft('not json')).toEqual(EMPTY_FILM_DRAFT);
    const parsed = parseFilmDraft(
      JSON.stringify({
        genreId: 'no-such-genre',
        shots: [{ id: 'shot-1', cameraMoveId: 'no-such-move', durationSeconds: 99, elementIds: 'x' }],
        elements: [{ assetId: 'a1', filename: 'f.jpg', kind: 'presenter' }],
        style: { palette: 'Neon', lighting: 'Golden Hour' },
      }),
    );
    expect(parsed.genreId).toBeNull();
    expect(parsed.shots[0]?.cameraMoveId).toBeNull();
    expect(parsed.shots[0]?.durationSeconds).toBe(5);
    expect(parsed.shots[0]?.elementIds).toEqual([]);
    // A mirrored element can never come back as a presenter.
    expect(parsed.elements[0]?.kind).toBe('dish');
    expect(parsed.style.palette).toBe('Auto');
    expect(parsed.style.lighting).toBe('Golden Hour');
  });
});

// ---------------------------------------------------------------------------
// Film home helpers + real project creation
// ---------------------------------------------------------------------------

describe('film home projects', () => {
  const projects = [
    project({ id: 'p-old', name: 'Zebra Sweets', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' }),
    project({ id: 'p-new', name: 'Aloo Hour', createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-29T00:00:00.000Z' }),
  ];

  it('sorts by last edited, first created and name', () => {
    expect(sortFilmProjects(projects, 'edited').map((p) => p.id)).toEqual(['p-new', 'p-old']);
    expect(sortFilmProjects(projects, 'created').map((p) => p.id)).toEqual(['p-old', 'p-new']);
    expect(sortFilmProjects(projects, 'name').map((p) => p.id)).toEqual(['p-new', 'p-old']);
    expect(projects.map((p) => p.id)).toEqual(['p-old', 'p-new']); // input not mutated
  });

  it('filters by name, case-insensitively', () => {
    expect(filterFilmProjects(projects, 'aloo').map((p) => p.id)).toEqual(['p-new']);
    expect(filterFilmProjects(projects, '  ')).toHaveLength(2);
    expect(filterFilmProjects(projects, 'missing')).toEqual([]);
  });

  it('creates a project only on backend confirmation, with real errors passed through', async () => {
    const ok = await runFilmCreate(
      { createProject: async (data) => ({ success: true, data: project({ name: data.name }) }) },
      '  Chai Film  ',
    );
    expect(ok.status).toBe('created');
    if (ok.status === 'created') expect(ok.project.name).toBe('Chai Film');

    const denied = await runFilmCreate(
      { createProject: async () => ({ success: false, error: { message: 'Name already used' } }) },
      'Chai Film',
    );
    expect(denied).toEqual({ status: 'error', message: 'Name already used' });

    const empty = await runFilmCreate(
      { createProject: async () => ({ success: true, data: project({}) }) },
      '   ',
    );
    expect(empty.status).toBe('error');

    const thrown = await runFilmCreate(
      {
        createProject: async () => {
          throw new Error('Network down');
        },
      },
      'Chai Film',
    );
    expect(thrown).toEqual({ status: 'error', message: 'Network down' });
  });

  it('results come only from completed video job outputs', () => {
    const jobs: StudioJob[] = [
      {
        job_id: 'j1', status: 'COMPLETED', progress: 100, credit_cost: null, error: null,
        outputs: [{ id: 'o1', kind: 'video', url: 'https://signed.example/clip.mp4', label: 'Clip' }],
      },
      {
        job_id: 'j2', status: 'FAILED', progress: null, credit_cost: 8, error: 'Provider down',
        outputs: [{ id: 'o2', kind: 'video', url: 'https://signed.example/x.mp4' }],
      },
      {
        job_id: 'j3', status: 'COMPLETED', progress: 100, credit_cost: null, error: null,
        outputs: [{ id: 'o3', kind: 'image', url: 'https://signed.example/still.jpg' }],
      },
    ];
    const cards = filmResultsFromJobs(jobs);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.outputId).toBe('o1');
  });
});

// ---------------------------------------------------------------------------
// Film home rendering — five states across its surfaces
// ---------------------------------------------------------------------------

const renderHome = (props: Partial<FilmStudioProps>) =>
  renderToStaticMarkup(
    React.createElement(FilmStudio, {
      projectsState: 'ready',
      projects: [],
      createProject: async (data: { name: string; type: 'video' }) => ({
        success: true,
        data: project({ name: data.name }),
      }),
      ...props,
    }),
  );

describe('Film home rendering', () => {
  it('loading renders skeletons in the projects grid shape', () => {
    const html = renderHome({ projectsState: 'loading' });
    expect(html).toContain('film-projects-loading');
    expect(html).not.toContain('film-projects-empty');
  });

  it('error renders the real message with a retry', () => {
    const html = renderHome({ projectsState: 'error', projectsError: 'Backend unreachable' });
    expect(html).toContain('film-projects-error');
    expect(html).toContain('Backend unreachable');
    expect(html).toContain('Retry');
  });

  it('empty renders the first-film explainer; the hero composer is honestly not-configured', () => {
    const html = renderHome({});
    expect(html).toContain('film-projects-empty');
    expect(html).toContain('No film projects yet');
    expect(html).toContain('composer-not-configured');
    expect(html).toContain('quantcooks.create_shot_sequence');
    expect(html).toContain('nothing will be charged');
  });

  it('populated renders real projects with workspace links', () => {
    const html = renderHome({
      projects: [project({}), project({ id: 'proj-2', name: 'Chai Chronicles' })],
    });
    expect(html).toContain('Monsoon Thali — a short film');
    expect(html).toContain('Chai Chronicles');
    expect(html).toContain('/studio/film/proj-1');
    expect(html).toContain('/studio/film/proj-2');
    expect(html).not.toContain('film-projects-empty');
  });

  it('community feed renders its honest not-connected state and invents no posts', () => {
    const html = renderHome({});
    expect(html).toContain('film-community-empty');
    expect(html).toContain('not connected yet');
    expect(html).toContain('film-generations-empty');
  });

  it('a created project renders the saved confirmation with its workspace link', () => {
    const html = renderHome({ initialCreatedProject: project({}) });
    expect(html).toContain('film-created');
    expect(html).toContain('film-open-workspace');
    expect(html).toContain('/studio/film/proj-1');
    expect(html).toContain('draft on this device');
  });

  it('the new-film form states the draft/server split before creating', () => {
    const html = renderHome({ initialBriefOpen: true });
    expect(html).toContain('film-brief-form');
    expect(html).toContain('draft on this device');
  });
});

// ---------------------------------------------------------------------------
// Workspace rendering — brief, elements, tabs
// ---------------------------------------------------------------------------

const workspaceDraft: FilmDraft = {
  ...EMPTY_FILM_DRAFT,
  brief: { ...emptyBrief(), context: 'Weekend launch film', look: 'Match @thali-hero exactly' },
  elements: [elementFromAsset(asset({}), 'dish')],
  shots: [shot({ frameApproved: false })],
};

const renderWorkspace = (props: Partial<FilmWorkspaceProps>) =>
  renderToStaticMarkup(
    React.createElement(FilmWorkspace, {
      project: project({}),
      projectState: 'ready',
      assets: [],
      assetsState: 'ready',
      initialDraft: workspaceDraft,
      ...props,
    }),
  );

describe('Film workspace rendering', () => {
  it('loading and error states render honestly', () => {
    expect(renderWorkspace({ projectState: 'loading', project: null })).toContain('film-workspace-loading');
    const err = renderWorkspace({ projectState: 'error', project: null, projectError: 'Gone' });
    expect(err).toContain('film-workspace-error');
    expect(err).toContain('Gone');
  });

  it('populated renders the title, the editor link and the plain draft note', () => {
    const html = renderWorkspace({});
    expect(html).toContain('Monsoon Thali — a short film');
    expect(html).toContain('/editor?projectId=proj-1');
    expect(html).toContain('film-draft-note');
    expect(html).toContain('Draft on this device');
    expect(html).not.toContain('Saved to the server');
  });

  it('the brief renders all six sections and parses @-mentions as attachments', () => {
    const html = renderWorkspace({});
    for (const section of FILM_BRIEF_SECTIONS) {
      expect(html).toContain(`film-brief-${section.id}`);
    }
    expect(html).toContain('film-brief-mentions-look');
    expect(html).toContain('@thali-hero');
  });

  it('elements render by group; the presenter group is honestly empty and names its twin', () => {
    const html = renderWorkspace({});
    expect(html).toContain('film-element-asset-1');
    expect(html).toContain('thali-hero.jpg');
    expect(html).toContain('film-elements-presenter-empty');
    expect(html).toContain('quantcooks.create_chef_persona');
    expect(html).toContain('film-elements-empty-kitchen');
  });

  it('the element picker offers READY assets only', () => {
    const html = renderWorkspace({
      assets: [
        asset({ id: 'a-ready', filename: 'ready.jpg' }),
        asset({ id: 'a-pending', filename: 'pending.jpg', uploadStatus: 'PENDING' }),
      ],
    });
    expect(html).toContain('film-element-pick-a-ready');
    expect(html).not.toContain('film-element-pick-a-pending');
  });

  it('the element detail modal shows references, metadata and the note field', () => {
    const html = renderWorkspace({ initialElementDetailId: 'asset-1' });
    expect(html).toContain('film-element-modal');
    expect(html).toContain('film-element-modal-name');
    expect(html).toContain('Type: dish · Status: READY · Asset: asset-1');
    expect(html).toContain('film-element-modal-note');
    expect(html).toContain('film-element-modal-download');
  });

  it('canvas and chat tabs hold honest places instead of fake surfaces', () => {
    const canvas = renderWorkspace({ initialTab: 'canvas' });
    expect(canvas).toContain('film-canvas-tab');
    expect(canvas).toContain('still in build');
    const chat = renderWorkspace({ initialTab: 'chat' });
    expect(chat).toContain('film-chat-collaborate');
    expect(chat).toContain('/collaborate');
  });
});

// ---------------------------------------------------------------------------
// Director rendering — panel, AI Director, storyboard gate
// ---------------------------------------------------------------------------

const renderDirector = (props: Partial<FilmDirectorProps>) =>
  renderToStaticMarkup(
    React.createElement(FilmDirector, {
      shots: [],
      elements: [],
      genreId: null,
      style: { palette: 'Auto', lighting: 'Auto', moveset: 'Auto' },
      heroPrompt: '',
      directorAsk: '',
      onShotsChange: () => {},
      onGenreChange: () => {},
      onStyleChange: () => {},
      onHeroPromptChange: () => {},
      onDirectorAskChange: () => {},
      ...props,
    }),
  );

describe('Film director rendering', () => {
  it('the Director Panel composes a shot and its frame slots stay honest when empty', () => {
    const html = renderDirector({});
    expect(html).toContain('film-director-panel');
    expect(html).toContain('film-panel-frames-empty');
    expect(html).toContain('film-panel-add-shot');
    expect(html).toContain('Cake Orbit'); // movement options from the real vocabulary
  });

  it('the AI Director shows starter asks and, after an attempt, both twins with the ask preserved', () => {
    const empty = renderDirector({});
    expect(empty).toContain('film-director-starters');
    const attempted = renderDirector({
      directorAsk: 'Break the dal tadka into three shots',
      initialPlanOutcome: attemptDirectorPlan('Break the dal tadka into three shots'),
    });
    expect(attempted).toContain('film-director-notconfigured');
    expect(attempted).toContain('quantcooks.plan_project');
    expect(attempted).toContain('quantcooks.create_shot_sequence');
    expect(attempted).toContain('Break the dal tadka into three shots');
  });

  it('an unapproved frame shows its own gate note, and Generate lists BOTH block reasons', () => {
    const html = renderDirector({ shots: [shot({ frameApproved: false })] });
    expect(html).toContain('film-shot-shot-1');
    expect(html).toContain('film-shot-gate-shot-1');
    expect(html).toContain('Approve frame first');
    expect(html).toContain('film-gate-reasons');
    expect(html).toContain('still unapproved');
    expect(html).toContain('NOT_CONFIGURED');
    expect(html).toContain('film-generate-all-button');
    expect(html).toContain('disabled');
  });

  it('with every frame approved, only the not-configured reason remains', () => {
    const html = renderDirector({ shots: [shot({ frameApproved: true })] });
    expect(html).not.toContain('film-shot-gate-shot-1');
    expect(html).toContain('film-gate-reasons');
    expect(html).toContain('NOT_CONFIGURED');
    expect(html).not.toContain('still unapproved');
    expect(html).toContain('Approved 1 of 1 frames');
  });

  it('the storyboard prices each frame and the total from the same composition', () => {
    const shots = [shot({}), shot({ id: 'shot-2', durationSeconds: 15, cameraMoveId: 'pack-spin' })];
    const html = renderDirector({ shots });
    const total = shotListQuote(base, shots);
    expect(html).toContain(`Generate all shots · ${total.credits} credits`);
    expect(html).toContain(`${shotQuote(base, shots[0]!).credits} credits`);
  });

  it('genre modal and style panel render the spec vocabulary', () => {
    const modal = renderToStaticMarkup(
      React.createElement(GenrePickerModal, { open: true, selectedId: 'family-kitchen', onSelect: () => {}, onClose: () => {} }),
    );
    expect(modal).toContain('film-genre-modal');
    expect(modal).toContain('Street-Food Energy');
    expect(modal).toContain('Family Kitchen');
    const panel = renderToStaticMarkup(
      React.createElement(StylePanel, {
        style: { palette: 'Auto', lighting: 'Auto', moveset: 'Auto' },
        onChange: () => {},
        manual: true,
        onManualChange: () => {},
      }),
    );
    expect(panel).toContain('Colour Palette');
    expect(panel).toContain('Camera Moveset Style');
    expect(panel).toContain('Celebration Glow');
  });
});
