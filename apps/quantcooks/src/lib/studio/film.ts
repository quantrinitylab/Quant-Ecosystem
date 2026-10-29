// ============================================================================
// QuantCooks Studio — Recipe Film Studio data & flow logic (spec §5, G-7/G-8)
//
// Pure helpers behind the Recipe Film Studio screens (Film home #38, the
// project workspace #43, Elements #39–#40, the film composer #41, the
// Director Panel #42, the AI Director #44 and the Storyboard #45).
//
// What is REAL today:
//  - Projects: the caller's real projects (listProjects, P0-1) and creating
//    a film project (createProject — name + type only; the backend's strict
//    schema accepts nothing else, verified in the api-client).
//  - Elements: references to the caller's own READY assets (P0-3). An
//    element is a labelled reference (assetId + kind + note), never a copy.
//  - The manual shot list: full client-side CRUD with per-shot quotes
//    composed on pricing.ts, and the storyboard approve-frames gate as a
//    pure state machine.
// What is NOT real today, and never faked here:
//  - Planning and generation. quantcooks.plan_project is registered in
//    CP-1 with a fail-closed executor (PLANNER_NOT_CONFIGURED) and
//    quantcooks.create_shot_sequence / quantcooks.create_storyboard are
//    Tier B provider tools. The Director therefore returns an honest
//    NOT_CONFIGURED outcome and NEVER invents a shot list; generation
//    stays disabled with its reasons printed.
//  - Persistence of the film document itself. The brief, shot list and
//    elements have NO server home yet: createProject/updateProject take
//    name/type only, and the P0-5 state endpoint stores exactly one
//    document — the timeline editor's EditorDocument (tracks/clips). A
//    film brief is not an editor timeline, so it is NOT smuggled into
//    that seam; it lives in the per-project draft mirror below and the
//    UI says so ("draft on this device"). Named follow-up: a server-side
//    film document (project film metadata) so briefs sync across devices.
// ============================================================================

import type { ServerAsset, ServerProject } from '../../services/api-client';
import type { StudioJob } from './jobs';
import { computeQuote, type ComposerSettings, type CreditQuote } from './pricing';
import { CAMERA_MOVES, cameraMoveById } from './video';

/** The registered QuantAI tool twins of these screens (CP-1 manifest §3). */
export const FILM_PLAN_TOOL = 'quantcooks.plan_project';
export const FILM_SHOTS_TOOL = 'quantcooks.create_shot_sequence';
export const FILM_STORYBOARD_TOOL = 'quantcooks.create_storyboard';
/** Persona creation twin (CP-1, G-5) — the Presenters group's source. */
export const FILM_PERSONA_TOOL = 'quantcooks.create_chef_persona';
/** Element creation-by-generation rides the image tool's element path. */
export const FILM_ELEMENT_IMAGE_TOOL = 'quantcooks.generate_dish_image';
/** Elements are listed through the assets tools (spec §5.2). */
export const FILM_ASSETS_TOOL = 'quantcooks.list_assets';
export const FILM_PROJECTS_TOOL = 'quantcooks.list_projects';
export const FILM_CREATE_PROJECT_TOOL = 'quantcooks.create_project';

// ---------------------------------------------------------------------------
// Genres (spec §5.3 — the original QuantCooks set) and the Style panel
// (three columns: palette / lighting / camera-moveset style, Auto or named).
// ---------------------------------------------------------------------------

export interface FilmGenre {
  id: string;
  name: string;
  /** One line of plain language: the feel this genre gives a film. */
  description: string;
}

export const FILM_GENRES: FilmGenre[] = [
  { id: 'family-kitchen', name: 'Family Kitchen', description: 'Warm, lived-in home cooking — the people matter as much as the plate.' },
  { id: 'street-food-energy', name: 'Street-Food Energy', description: 'Fast hands, hot pans, crowd noise just out of frame — appetite at street speed.' },
  { id: 'fine-dine-calm', name: 'Fine-Dine Calm', description: 'Unhurried and precise; every plate lands like it was placed under a microscope.' },
  { id: 'festival-colour', name: 'Festival Colour', description: 'Saturated colour and celebration — marigold, mithaas and a full table.' },
  { id: 'home-comfort', name: 'Home Comfort', description: 'Slow steam, soft light, the food you make when nobody is watching.' },
];

export function filmGenreById(id: string | null | undefined): FilmGenre | null {
  if (!id) return null;
  return FILM_GENRES.find((g) => g.id === id) ?? null;
}

export interface FilmStyle {
  palette: string;
  lighting: string;
  moveset: string;
}

export const FILM_STYLE_AUTO = 'Auto';

export const FILM_PALETTES: string[] = [FILM_STYLE_AUTO, 'Warm & Golden', 'Fresh & Green', 'Rich & Deep', 'Soft Pastel', 'Bold Festival'];
export const FILM_LIGHTING: string[] = [FILM_STYLE_AUTO, 'Morning Window', 'Golden Hour', 'Bright Café', 'Moody Evening', 'Celebration Glow'];
export const FILM_MOVESETS: string[] = [FILM_STYLE_AUTO, 'Gentle & Slow', 'Energetic Cuts', 'One-Take Flow', 'Top-Down Focus'];

export const DEFAULT_FILM_STYLE: FilmStyle = {
  palette: FILM_STYLE_AUTO,
  lighting: FILM_STYLE_AUTO,
  moveset: FILM_STYLE_AUTO,
};

/** The Style chip's one-line summary of the three panel picks (spec §5.3). */
export function filmStyleSummary(style: FilmStyle): string {
  return `${style.palette} colour · ${style.lighting} light · ${style.moveset} moves`;
}

// ---------------------------------------------------------------------------
// Elements (spec §5.2) — reusable references into the caller's asset
// library. Kinds follow the spec's food mapping; an asset can be labelled
// dish / ingredient / kitchen / product, but NEVER presenter: a presenter
// is a Chef Persona with a consent gate (G-5), not a photo with a label,
// so asset-derived elements structurally exclude that kind.
// ---------------------------------------------------------------------------

export type FilmElementKind = 'dish' | 'ingredient' | 'kitchen' | 'product' | 'presenter';

export const FILM_ELEMENT_GROUPS: Array<{ id: FilmElementKind; label: string }> = [
  { id: 'dish', label: 'Dishes' },
  { id: 'ingredient', label: 'Ingredients' },
  { id: 'kitchen', label: 'Kitchens & Locations' },
  { id: 'product', label: 'Products' },
  { id: 'presenter', label: 'Presenters' },
];

/** Kinds an asset reference may carry (presenter excluded — see above). */
export const ASSET_ELEMENT_KINDS: Array<Exclude<FilmElementKind, 'presenter'>> = [
  'dish',
  'ingredient',
  'kitchen',
  'product',
];

export interface FilmElement {
  /** Identity is the asset id — never a signed URL (they expire). */
  assetId: string;
  filename: string;
  /** Fresh signed URL for preview; a hint only, may be stale in a mirror. */
  url: string | null;
  kind: FilmElementKind;
  /** The user's own note about this element (cast, usage, recipe step). */
  note: string;
}

/** Elements come from bytes that actually landed: READY assets only. */
export function pickableElementAssets(assets: ServerAsset[]): ServerAsset[] {
  return assets.filter(
    (a) => a.uploadStatus === 'READY' && (a.type === 'image' || a.type === 'video'),
  );
}

export function defaultElementKind(asset: ServerAsset): FilmElementKind {
  return asset.type === 'video' ? 'kitchen' : 'dish';
}

export function elementFromAsset(
  asset: ServerAsset,
  kind: FilmElementKind = defaultElementKind(asset),
): FilmElement {
  return { assetId: asset.id, filename: asset.filename, url: asset.url, kind, note: '' };
}

export function elementsByKind(elements: FilmElement[], kind: FilmElementKind): FilmElement[] {
  return elements.filter((e) => e.kind === kind);
}

export function elementByAssetId(elements: FilmElement[], assetId: string): FilmElement | null {
  return elements.find((e) => e.assetId === assetId) ?? null;
}

// ---------------------------------------------------------------------------
// Shots — the manual shot list (spec §5.5's editable list, minus the AI).
// A shot is exactly the create_shot_sequence shot shape: subject/action
// ride in title/description, cameraPreset is a presets.ts vocabulary id,
// elementIds reference Elements by assetId.
// ---------------------------------------------------------------------------

export interface FilmShot {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  /** A CAMERA_MOVES id, or null for "director's choice". */
  cameraMoveId: string | null;
  elementIds: string[];
  /** Storyboard gate: this shot's frame has been approved (spec §5.6). */
  frameApproved: boolean;
}

export const SHOT_DURATIONS: number[] = [3, 5, 8, 10, 15];

export function emptyShot(id: string): FilmShot {
  return {
    id,
    title: '',
    description: '',
    durationSeconds: 5,
    cameraMoveId: null,
    elementIds: [],
    frameApproved: false,
  };
}

/** Next deterministic shot id (shot-1, shot-2, …) — stable across saves. */
export function nextShotId(shots: FilmShot[]): string {
  let max = 0;
  for (const shot of shots) {
    const match = /^shot-(\d+)$/.exec(shot.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `shot-${max + 1}`;
}

export function addShot(shots: FilmShot[], shot: FilmShot): FilmShot[] {
  return [...shots, shot];
}

export function updateShot(shots: FilmShot[], id: string, patch: Partial<FilmShot>): FilmShot[] {
  return shots.map((shot) => (shot.id === id ? { ...shot, ...patch } : shot));
}

export function removeShot(shots: FilmShot[], id: string): FilmShot[] {
  return shots.filter((shot) => shot.id !== id);
}

/** Move one step earlier (-1) or later (+1) in the strip; edges are no-ops. */
export function moveShot(shots: FilmShot[], id: string, direction: -1 | 1): FilmShot[] {
  const index = shots.findIndex((s) => s.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= shots.length) return shots;
  const next = [...shots];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

// ---------------------------------------------------------------------------
// Quotes — per shot and rolled up. A shot prices through pricing.ts's own
// composition: its duration, and its camera move through the stacked-
// extras term exactly as Video Studio prices a one-move stack (video.ts).
// The Director's "Generate all shots" total is the plain sum (CP-1: the
// create_shot_sequence quote = Σ per-shot).
// ---------------------------------------------------------------------------

export function shotQuoteSettings(base: ComposerSettings, shot: FilmShot): ComposerSettings {
  return {
    ...base,
    durationSeconds: shot.durationSeconds,
    batch: 1,
    stackedExtras: shot.cameraMoveId ? 1 : 0,
  };
}

export function shotQuote(base: ComposerSettings, shot: FilmShot): CreditQuote {
  return computeQuote('video', shotQuoteSettings(base, shot));
}

export interface ShotListQuote {
  credits: number;
  lines: string[];
}

export function shotListQuote(base: ComposerSettings, shots: FilmShot[]): ShotListQuote {
  const lines: string[] = [];
  let credits = 0;
  shots.forEach((shot, index) => {
    const quote = shotQuote(base, shot);
    credits += quote.credits;
    const move = shot.cameraMoveId ? cameraMoveById(shot.cameraMoveId) : null;
    lines.push(
      `Shot ${index + 1}${shot.title ? ` · ${shot.title}` : ''} — ${shot.durationSeconds}s` +
        `${move ? ` · ${move.name}` : ''} · ${quote.credits} credits`,
    );
  });
  return { credits, lines };
}

// ---------------------------------------------------------------------------
// The storyboard approve-frames gate (spec §5.6) as a state machine.
// Video spend for a shot is armed only when (a) there is at least one
// shot, (b) EVERY frame is approved, and (c) a generation provider is
// configured. The reasons are returned separately and never collapsed:
// the UI prints each one, so "frames unapproved" and "provider not
// configured" stay two distinct, honest blocks. Today (c) is false, so
// the gate can never arm — that is the truth of the current build, and
// the machine itself is fully testable with (c) true.
// ---------------------------------------------------------------------------

export interface GenerationGate {
  armed: boolean;
  totalShots: number;
  approvedCount: number;
  unapprovedCount: number;
  reasons: string[];
}

export function generationGate(shots: FilmShot[], providerConfigured: boolean): GenerationGate {
  const approvedCount = shots.filter((s) => s.frameApproved).length;
  const unapprovedCount = shots.length - approvedCount;
  const reasons: string[] = [];
  if (shots.length === 0) {
    reasons.push('Add at least one shot to the plan first — there is nothing to generate yet.');
  } else if (unapprovedCount > 0) {
    reasons.push(
      `${unapprovedCount} of ${shots.length} frame${shots.length === 1 ? '' : 's'} ${unapprovedCount === 1 ? 'is' : 'are'} still unapproved — ` +
        'approve frames before any video credits move (the storyboard gate).',
    );
  }
  if (!providerConfigured) {
    reasons.push(
      `Shot generation runs through ${FILM_SHOTS_TOOL}, whose provider is not configured yet ` +
        '(NOT_CONFIGURED). Nothing will be charged.',
    );
  }
  return {
    armed: reasons.length === 0,
    totalShots: shots.length,
    approvedCount,
    unapprovedCount,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// AI Director (spec §5.5) — the planning attempt. Planning itself is never
// charged (CP-1: plan_project is FREE and synchronous), but its executor
// is fail-closed today (PLANNER_NOT_CONFIGURED), so an attempt lands on
// this honest outcome. It can NEVER return a shot list: the manual list
// below it is where shots come from until the planner lands.
// ---------------------------------------------------------------------------

export type DirectorPlanOutcome =
  | { status: 'invalid'; message: string }
  | { status: 'not-configured'; tools: string[]; ask: string; message: string };

export function attemptDirectorPlan(ask: string): DirectorPlanOutcome {
  const trimmed = ask.trim();
  if (trimmed === '') {
    return {
      status: 'invalid',
      message: 'Describe the film first — what happens, in what order — and the Director will plan from that.',
    };
  }
  return {
    status: 'not-configured',
    tools: [FILM_PLAN_TOOL, FILM_SHOTS_TOOL],
    ask: trimmed,
    message:
      `Your brief is kept below, word for word. Planning it into shots runs through ${FILM_PLAN_TOOL}, ` +
      'whose planner is not configured yet (PLANNER_NOT_CONFIGURED), and the shots themselves would run ' +
      `through ${FILM_SHOTS_TOOL}. Planning is never charged, and nothing was charged now. ` +
      'Until the Director connects, build the same shot list by hand in the storyboard — it prices ' +
      'identically, shot by shot.',
  };
}

/** Starter asks for the Director panel's empty state (spec §5.5). */
export const DIRECTOR_STARTERS: string[] = [
  'Break this recipe into shots — open wide on the kitchen, close on the tadka, hero the plating.',
  'A festival thali film: colour first, then the hands that serve it, then the full table.',
  'A slow morning chai film — steam off the kettle, the pour, the first sip.',
];

// ---------------------------------------------------------------------------
// Project brief (spec §5.4) — a slash-command block document in six
// sections. The block menu is UI grammar over plain text: inserting a
// block appends its scaffold to the section. @-mentions and / references
// inside the text parse with the shared mentions.ts grammar.
// ---------------------------------------------------------------------------

export interface FilmBriefSection {
  id: string;
  label: string;
  hint: string;
}

export const FILM_BRIEF_SECTIONS: FilmBriefSection[] = [
  { id: 'context', label: 'Context', hint: 'What this film is, who makes it, where it will play.' },
  { id: 'story', label: 'Story & Audience', hint: 'The arc in three beats, and who it is cooked for.' },
  { id: 'look', label: 'Look & References', hint: '@ the dishes, kitchens and presenters the film must match.' },
  { id: 'production', label: 'Production Notes', hint: 'Locations, props, timing — anything a shoot day needs.' },
  { id: 'status', label: 'Status', hint: 'Where the film stands right now, in one or two lines.' },
  { id: 'resources', label: 'Resources', hint: '/ collections, brand kits and links the film draws on.' },
];

export type FilmBrief = Record<string, string>;

export function emptyBrief(): FilmBrief {
  return Object.fromEntries(FILM_BRIEF_SECTIONS.map((s) => [s.id, '']));
}

export interface SlashBlock {
  id: string;
  label: string;
  /** Text appended to a section when the block is inserted. */
  scaffold: string;
}

export const SLASH_BLOCKS: SlashBlock[] = [
  { id: 'text', label: 'Text', scaffold: '' },
  { id: 'bullets', label: 'Bullets', scaffold: '• ' },
  { id: 'checklist', label: 'Checklist', scaffold: '☐ ' },
  { id: 'quote', label: 'Quote', scaffold: '“  ”' },
];

/** Insert a block at the end of a section's text (the `/` menu's action). */
export function insertBlock(text: string, blockId: string): string {
  const block = SLASH_BLOCKS.find((b) => b.id === blockId);
  if (!block) return text;
  if (block.scaffold === '') return text;
  const base = text === '' || text.endsWith('\n') ? text : `${text}\n`;
  return `${base}${block.scaffold}`;
}

// ---------------------------------------------------------------------------
// The film document + draft mirror. The project row itself is real and
// server-side (P0-1); this document — brief, shots, elements, genre,
// style — has no server field yet (see the header note), so it mirrors
// to localStorage per project id, exactly the promo.ts pattern. Identity
// inside the mirror is always an id (project / asset), never a URL.
// ---------------------------------------------------------------------------

export interface FilmDraft {
  brief: FilmBrief;
  shots: FilmShot[];
  elements: FilmElement[];
  genreId: string | null;
  style: FilmStyle;
  /** The film composer's prompt (the hero/Director brief line). */
  heroPrompt: string;
  /** The last ask typed into the AI Director panel. */
  directorAsk: string;
}

export const EMPTY_FILM_DRAFT: FilmDraft = {
  brief: emptyBrief(),
  shots: [],
  elements: [],
  genreId: null,
  style: DEFAULT_FILM_STYLE,
  heroPrompt: '',
  directorAsk: '',
};

export const FILM_DRAFT_KEY_PREFIX = 'quantcooks.film.draft.v1.';

export function filmDraftKey(projectId: string): string {
  return `${FILM_DRAFT_KEY_PREFIX}${projectId}`;
}

export function serializeFilmDraft(draft: FilmDraft): string {
  return JSON.stringify(draft);
}

function parseBrief(raw: unknown): FilmBrief {
  const brief = emptyBrief();
  if (typeof raw !== 'object' || raw === null) return brief;
  const record = raw as Record<string, unknown>;
  for (const section of FILM_BRIEF_SECTIONS) {
    const value = record[section.id];
    if (typeof value === 'string') brief[section.id] = value;
  }
  return brief;
}

function parseStyle(raw: unknown): FilmStyle {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_FILM_STYLE;
  const record = raw as Record<string, unknown>;
  const pick = (value: unknown, options: string[]) =>
    typeof value === 'string' && options.includes(value) ? value : FILM_STYLE_AUTO;
  return {
    palette: pick(record.palette, FILM_PALETTES),
    lighting: pick(record.lighting, FILM_LIGHTING),
    moveset: pick(record.moveset, FILM_MOVESETS),
  };
}

function parseShots(raw: unknown): FilmShot[] {
  if (!Array.isArray(raw)) return [];
  const shots: FilmShot[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== 'string' || s.id === '') continue;
    shots.push({
      id: s.id,
      title: typeof s.title === 'string' ? s.title : '',
      description: typeof s.description === 'string' ? s.description : '',
      durationSeconds:
        typeof s.durationSeconds === 'number' && SHOT_DURATIONS.includes(s.durationSeconds)
          ? s.durationSeconds
          : 5,
      cameraMoveId:
        typeof s.cameraMoveId === 'string' && cameraMoveById(s.cameraMoveId) ? s.cameraMoveId : null,
      elementIds: Array.isArray(s.elementIds)
        ? s.elementIds.filter((e): e is string => typeof e === 'string')
        : [],
      frameApproved: s.frameApproved === true,
    });
  }
  return shots;
}

function parseElements(raw: unknown): FilmElement[] {
  if (!Array.isArray(raw)) return [];
  const elements: FilmElement[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const e = item as Record<string, unknown>;
    if (typeof e.assetId !== 'string' || e.assetId === '' || typeof e.filename !== 'string') continue;
    elements.push({
      assetId: e.assetId,
      filename: e.filename,
      url: typeof e.url === 'string' ? e.url : null,
      kind:
        typeof e.kind === 'string' && (ASSET_ELEMENT_KINDS as string[]).includes(e.kind)
          ? (e.kind as FilmElementKind)
          : 'dish',
      note: typeof e.note === 'string' ? e.note : '',
    });
  }
  return elements;
}

/**
 * Parse a mirrored film draft. Anything malformed is dropped field by
 * field rather than trusted — a stale mirror must never crash the
 * workspace or resurrect a genre/move that no longer exists.
 */
export function parseFilmDraft(raw: string | null | undefined): FilmDraft {
  if (!raw) return EMPTY_FILM_DRAFT;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_FILM_DRAFT;
  }
  if (typeof data !== 'object' || data === null) return EMPTY_FILM_DRAFT;
  const record = data as Record<string, unknown>;
  return {
    brief: parseBrief(record.brief),
    shots: parseShots(record.shots),
    elements: parseElements(record.elements),
    genreId:
      typeof record.genreId === 'string' && filmGenreById(record.genreId) ? record.genreId : null,
    style: parseStyle(record.style),
    heroPrompt: typeof record.heroPrompt === 'string' ? record.heroPrompt : '',
    directorAsk: typeof record.directorAsk === 'string' ? record.directorAsk : '',
  };
}

// ---------------------------------------------------------------------------
// Film home — project grid helpers (spec §5.1: search + sort menu with
// first created / last edited / name).
// ---------------------------------------------------------------------------

export type FilmProjectSort = 'edited' | 'created' | 'name';

export const FILM_PROJECT_SORTS: Array<{ id: FilmProjectSort; label: string }> = [
  { id: 'edited', label: 'Last edited' },
  { id: 'created', label: 'First created' },
  { id: 'name', label: 'Name' },
];

export function sortFilmProjects(projects: ServerProject[], sort: FilmProjectSort): ServerProject[] {
  const sorted = [...projects];
  switch (sort) {
    case 'created':
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'edited':
    default:
      return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

export function filterFilmProjects(projects: ServerProject[], query: string): ServerProject[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter((p) => p.name.toLowerCase().includes(q));
}

// ---------------------------------------------------------------------------
// Creating a film project — REAL (the wizard.ts seam): the injected
// client is the api-client's createProject; success is only reported
// when the backend confirms, and failures carry its real message.
// ---------------------------------------------------------------------------

export interface FilmProjectClient {
  createProject(data: { name: string; type: 'video' | 'image' | 'audio' }): Promise<{
    success: boolean;
    data?: ServerProject;
    error?: { message?: string };
  }>;
}

export type FilmCreateOutcome =
  | { status: 'created'; project: ServerProject }
  | { status: 'error'; message: string };

export async function runFilmCreate(
  client: FilmProjectClient,
  title: string,
): Promise<FilmCreateOutcome> {
  const name = title.trim();
  if (name === '') {
    return { status: 'error', message: 'Give the film a title first — the project is created under that name.' };
  }
  try {
    const res = await client.createProject({ name, type: 'video' });
    if (res.success && res.data) return { status: 'created', project: res.data };
    return {
      status: 'error',
      message: res.error?.message ?? 'The project could not be created — nothing was saved.',
    };
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'The project could not be created — nothing was saved.',
    };
  }
}

// ---------------------------------------------------------------------------
// Results — only real job outputs become cards (spec §5.1 My Generations
// rail is fed by jobs; generation jobs do not exist yet, so in practice
// the rail is honestly empty until a provider lands).
// ---------------------------------------------------------------------------

export interface FilmResultCard {
  jobId: string;
  outputId: string;
  url: string | null;
  label: string;
}

export function filmResultsFromJobs(jobs: StudioJob[]): FilmResultCard[] {
  const cards: FilmResultCard[] = [];
  for (const job of jobs) {
    if (job.status !== 'COMPLETED') continue;
    for (const output of job.outputs) {
      if (output.kind !== 'video') continue;
      cards.push({
        jobId: job.job_id,
        outputId: output.id,
        url: output.url,
        label: output.label ?? 'Generated clip',
      });
    }
  }
  return cards;
}

// Re-exported so screens price camera moves from one vocabulary.
export { CAMERA_MOVES };
