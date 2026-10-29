// ============================================================================
// QuantCooks Studio — Explore 3-step wizard flow (spec §1.3)
//
// Step 1 pick a preset → step 2 write the brief → step 3 create the project.
// Step 3 is REAL end-to-end: it calls the api-client's createProject (the
// Phase 0 persistence endpoint) and only reports success when the backend
// confirms. Generation itself is not part of this wizard yet — no generation
// endpoint exists, so nothing here pretends a clip was made. Failures carry
// the backend's real error message to the UI; there is no fake navigation.
//
// F-2 completion: the spec's wizard variant leads with a photo (§1.3:
// "1 Add photo → 2 Pick a move → 3 Get your clip"), but a photo upload is
// a project asset (P0-3) — it needs the project to exist first. So the
// photo step runs AFTER the create, inside the success state: optional,
// skippable, and wired to the real upload seam. And the success state no
// longer auto-navigates: it offers both real destinations — the projects
// gallery and the editor deep-link (P0-5's /editor?projectId= route).
// ============================================================================

import type { StudioPreset } from './presets';

export type WizardStep = 1 | 2 | 3;

/** The post-create photo step's state (F-2). */
export interface WizardPhotoState {
  phase: 'idle' | 'uploading' | 'attached' | 'skipped' | 'error';
  /** The uploaded asset's id once attached (identity, never a URL). */
  assetId: string | null;
  filename: string | null;
  error: string | null;
}

export interface WizardState {
  step: WizardStep;
  preset: StudioPreset | null;
  /** The user's brief text from the step-2 composer. */
  brief: string;
  phase: 'editing' | 'creating' | 'created' | 'error';
  error: string | null;
  createdProjectId: string | null;
  /** Optional dish photo attached after the create (F-2). */
  photo: WizardPhotoState;
}

export function initialWizardState(): WizardState {
  return {
    step: 1,
    preset: null,
    brief: '',
    phase: 'editing',
    error: null,
    createdProjectId: null,
    photo: { phase: 'idle', assetId: null, filename: null, error: null },
  };
}

export function selectPreset(state: WizardState, preset: StudioPreset): WizardState {
  return { ...state, preset, step: 2, phase: 'editing', error: null };
}

export function setBrief(state: WizardState, brief: string): WizardState {
  return { ...state, brief, step: state.preset ? 3 : state.step };
}

export function canCreateProject(state: WizardState): boolean {
  return state.preset !== null && state.phase !== 'creating' && state.phase !== 'created';
}

/** The project name step 3 will create — preset-led, brief as a suffix. */
export function projectNameFor(state: WizardState): string {
  if (!state.preset) return 'Untitled project';
  const brief = state.brief.trim();
  if (!brief) return `${state.preset.name} project`;
  const short = brief.length > 48 ? `${brief.slice(0, 48).trimEnd()}…` : brief;
  return `${state.preset.name} — ${short}`;
}

/** The minimal client surface the wizard needs (the real api-client fits). */
export interface WizardProjectClient {
  createProject(data: { name: string; type: 'video' | 'image' | 'audio' }): Promise<{
    success: boolean;
    data?: { id: string };
    error?: { code: string; message: string };
  }>;
}

export interface WizardCreateResult {
  state: WizardState;
  /** Route to land on when ok — always a route that exists today. */
  route: string | null;
}

/**
 * Run step 3. On success `route` names the projects-gallery destination
 * (/projects — the real project surface); the component presents it in
 * the success state next to the editor deep-link (editorRouteFor) and
 * the photo step instead of navigating automatically (F-2). On failure
 * nothing navigates and the real error stays on screen.
 */
export async function runWizardCreate(
  state: WizardState,
  client: WizardProjectClient,
): Promise<WizardCreateResult> {
  if (!state.preset) {
    return {
      state: { ...state, phase: 'error', error: 'Pick a preset first — step 1 is still empty.' },
      route: null,
    };
  }
  try {
    const res = await client.createProject({ name: projectNameFor(state), type: 'video' });
    if (res.success && res.data?.id) {
      return {
        state: { ...state, phase: 'created', createdProjectId: res.data.id, error: null },
        route: '/projects',
      };
    }
    return {
      state: {
        ...state,
        phase: 'error',
        error: res.error?.message ?? 'The project could not be created. Please try again.',
      },
      route: null,
    };
  } catch (err) {
    return {
      state: {
        ...state,
        phase: 'error',
        error: err instanceof Error ? err.message : 'The project could not be created. Please try again.',
      },
      route: null,
    };
  }
}

// ---------------------------------------------------------------------------
// F-2 — destinations + the post-create photo step
// ---------------------------------------------------------------------------

/** The editor deep-link for a created project (P0-5's real route). */
export function editorRouteFor(projectId: string): string {
  return `/editor?projectId=${encodeURIComponent(projectId)}`;
}

/** The photo step exists only once a project has actually been created. */
export function canAttachPhoto(state: WizardState): boolean {
  return state.phase === 'created' && state.createdProjectId !== null && state.photo.phase !== 'uploading';
}

/** Skip the photo step — an explicit choice, recorded as its own phase. */
export function skipWizardPhoto(state: WizardState): WizardState {
  if (state.phase !== 'created' || state.photo.phase === 'uploading' || state.photo.phase === 'attached') {
    return state;
  }
  return { ...state, photo: { phase: 'skipped', assetId: null, filename: null, error: null } };
}

/** The minimal upload surface the photo step needs (useAssetUpload fits). */
export interface WizardPhotoClient {
  uploadPhoto(projectId: string, file: File): Promise<{ id: string; filename: string }>;
}

/**
 * Run the photo step against the real P0-3 upload seam. The upload only
 * ever runs against the created project's id; a failure keeps the user
 * on the success state with the seam's real error — the project itself
 * is already created and is never rolled back or hidden by a photo
 * failure.
 */
export async function runWizardPhotoUpload(
  state: WizardState,
  file: File,
  client: WizardPhotoClient,
): Promise<WizardState> {
  if (state.phase !== 'created' || !state.createdProjectId) {
    return {
      ...state,
      photo: {
        phase: 'error',
        assetId: null,
        filename: null,
        error: 'Create the project first — the photo saves into it.',
      },
    };
  }
  try {
    const asset = await client.uploadPhoto(state.createdProjectId, file);
    return {
      ...state,
      photo: { phase: 'attached', assetId: asset.id, filename: asset.filename, error: null },
    };
  } catch (err) {
    return {
      ...state,
      photo: {
        phase: 'error',
        assetId: null,
        filename: null,
        error: err instanceof Error ? err.message : 'The photo could not be uploaded. Please try again.',
      },
    };
  }
}
