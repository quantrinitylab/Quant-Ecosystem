// ============================================================================
// QuantCooks Studio (Phase 2 Unit 7) — Voice Studio + Chef Persona: lib
// logic + rendering. Same approach as Units 1–6: react-dom/server against
// the established vitest setup, no new dependencies, no DOM environment.
// Interaction-only state is proven the Units 1–6 way: the pure lib
// functions carry the rules (line CRUD, the dial/engine separation, the
// consent state machines), and components render with the initial props
// a click would have produced. The honesty proofs this unit owes:
//  - generation attempts preserve the script verbatim and their outcome
//    types carry no output, audio URL, voiceId or trained status;
//  - consent is validated BEFORE configuration (CONSENT_REQUIRED first),
//    for persona training and voice cloning alike (CP-1 §8);
//  - a persona/voice can never reach a trained/ready state client-side —
//    the status unions have one member and the mirror parser forces it;
//  - every price is a whole credit composed on pricing.ts (CP-1 §6.4
//    supersedes the spec's fractional display).
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import type { ServerAsset } from '../services/api-client';
import type { StudioJob } from '../lib/studio/jobs';
import { computeQuote, DEFAULT_COMPOSER_SETTINGS } from '../lib/studio/pricing';
import {
  CLONE_VOICE_TOOL,
  DEFAULT_VOICE_SESSION,
  DIAL_MODES,
  DUB_QUOTE_NOTE,
  DUB_TOOL,
  EMPTY_VOICE_DRAFT,
  LINE_TEXT_LIMIT,
  PERSONA_TOOL,
  PERSONA_TRAINING_CREDITS,
  SPEAK_TOOL,
  VOICE_CLONE_TRAINING_CREDITS,
  VOICE_ENGINES,
  VOICE_LANGUAGES,
  VOICE_SLOTS,
  VOICEOVER_TOOL,
  addLine,
  applyCloneOutcome,
  applyTrainingOutcome,
  attemptDub,
  attemptPersonaSpeak,
  attemptPersonaTraining,
  attemptVoiceClone,
  attemptVoiceover,
  createPersonaDraft,
  createVoiceCloneDraft,
  defaultPersonaPicks,
  dialModeTool,
  emptyLine,
  estimateSpeechSeconds,
  lineQuote,
  lineQuoteSettings,
  lineTextError,
  moveLine,
  nextLineId,
  parseVoiceDraft,
  personaGenerationGate,
  pickableAudioAssets,
  pickableDubAssets,
  pickablePersonaReferenceAssets,
  recordPersonaConsent,
  recordVoiceConsent,
  removeLine,
  scriptQuote,
  serializeVoiceDraft,
  splitLineText,
  updateLine,
  voiceEngineById,
  voiceResultsFromJobs,
  withDialMode,
  withEnginePick,
  withLanguage,
  withVoicePick,
  type ChefPersona,
  type ScriptLine,
  type VoiceCloneDraft,
  type VoiceDraft,
} from '../lib/studio/voice';
import { VoiceStudio, type VoiceStudioProps } from '../components/studio/VoiceStudio';
import { VoicePersonas } from '../components/studio/VoicePersonas';
import { VoiceLibrary } from '../components/studio/VoiceLibrary';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const asset = (over: Partial<ServerAsset>): ServerAsset => ({
  id: 'asset-1',
  projectId: 'proj-1',
  filename: 'narration-take-1.mp3',
  type: 'audio',
  size: 8192,
  uploadedAt: '2026-10-29T00:00:00.000Z',
  url: 'https://signed.example/narration-take-1.mp3',
  uploadStatus: 'READY',
  storageKey: 'quantcooks/u/proj-1/asset-1/narration-take-1.mp3',
  ...over,
});

const line = (over: Partial<ScriptLine>): ScriptLine => ({
  id: 'line-1',
  text: 'Add salt at the end.',
  voiceSlotId: null,
  ...over,
});

const persona = (over: Partial<ChefPersona>): ChefPersona => ({
  id: 'persona-1',
  name: 'Chef Ravi — home kitchen',
  presenterType: 'Home Chef',
  picks: defaultPersonaPicks(),
  referenceAssetIds: ['asset-photo-1'],
  consent: null,
  useAcknowledged: false,
  status: 'draft',
  trainingState: 'not-started',
  createdAt: '2026-10-29T00:00:00.000Z',
  ...over,
});

const consentedPersona = (over: Partial<ChefPersona>): ChefPersona =>
  persona({ consent: { ownLikeness: true, confirmedAt: '2026-10-29T01:00:00.000Z' }, ...over });

const cloneDraft = (over: Partial<VoiceCloneDraft>): VoiceCloneDraft => ({
  id: 'voice-1',
  name: 'My kitchen voice',
  sampleAssetIds: ['asset-1'],
  languageId: 'hinglish',
  consent: null,
  status: 'draft',
  cloneState: 'not-started',
  createdAt: '2026-10-29T00:00:00.000Z',
  ...over,
});

const expressive = voiceEngineById('expressive')!;
const studioCast = voiceEngineById('studio-cast')!;

// ---------------------------------------------------------------------------
// Script lines — CRUD, reorder, estimates, length rules
// ---------------------------------------------------------------------------

describe('script lines', () => {
  it('CRUD + reorder behave like the film shot list, edges are no-ops', () => {
    let lines: ScriptLine[] = [];
    lines = addLine(lines, emptyLine(nextLineId(lines)));
    lines = addLine(lines, emptyLine(nextLineId(lines)));
    expect(lines.map((l) => l.id)).toEqual(['line-1', 'line-2']);
    lines = updateLine(lines, 'line-1', { text: 'First.' });
    expect(lines[0]!.text).toBe('First.');
    lines = moveLine(lines, 'line-1', 1);
    expect(lines.map((l) => l.id)).toEqual(['line-2', 'line-1']);
    expect(moveLine(lines, 'line-2', -1)).toBe(lines);
    lines = removeLine(lines, 'line-2');
    expect(lines.map((l) => l.id)).toEqual(['line-1']);
    expect(nextLineId(lines)).toBe('line-2');
  });

  it('estimates spoken seconds from characters, display only', () => {
    expect(estimateSpeechSeconds('')).toBe(0);
    expect(estimateSpeechSeconds('Add salt.')).toBe(1);
    expect(estimateSpeechSeconds('x'.repeat(140))).toBe(10);
  });

  it('states the too-long error with the limit and splits without dropping words', () => {
    const sentence = 'Stir the onions until they turn deep gold. ';
    const long = sentence.repeat(14).trim(); // 616 chars > 500
    expect(long.length).toBeGreaterThan(LINE_TEXT_LIMIT);
    expect(lineTextError(long)).toContain(String(LINE_TEXT_LIMIT));
    expect(lineTextError('short')).toBeNull();
    const [head, tail] = splitLineText(long);
    expect(head.length).toBeLessThanOrEqual(LINE_TEXT_LIMIT);
    expect(tail.length).toBeGreaterThan(0);
    expect(`${head} ${tail}`).toBe(long.replace(/\s+/g, ' '));
    expect(splitLineText('fits fine')).toEqual(['fits fine', '']);
  });
});

// ---------------------------------------------------------------------------
// Quotes — per line, summed, composed on computeQuote, whole credits
// ---------------------------------------------------------------------------

describe('voiceover quotes', () => {
  it('a line quote IS computeQuote over the composed settings', () => {
    const l = line({});
    for (const engine of [expressive, studioCast]) {
      expect(lineQuote(DEFAULT_COMPOSER_SETTINGS, engine, l)).toEqual(
        computeQuote('audio', lineQuoteSettings(DEFAULT_COMPOSER_SETTINGS, engine, l)),
      );
    }
  });

  it('the engine re-prices: Studio Cast tier costs more per line than Expressive', () => {
    const l = line({});
    expect(lineQuote(DEFAULT_COMPOSER_SETTINGS, expressive, l)!.credits).toBe(1);
    expect(lineQuote(DEFAULT_COMPOSER_SETTINGS, studioCast, l)!.credits).toBe(2);
  });

  it('blank lines are never priced; the total is the sum of priced lines', () => {
    const lines = [line({}), line({ id: 'line-2', text: '   ' }), line({ id: 'line-3', text: 'Serve hot.' })];
    expect(lineQuote(DEFAULT_COMPOSER_SETTINGS, expressive, lines[1]!)).toBeNull();
    const quote = scriptQuote(DEFAULT_COMPOSER_SETTINGS, expressive, lines);
    expect(quote.credits).toBe(2);
    expect(quote.lines).toHaveLength(2);
    expect(quote.spokenSeconds).toBe(estimateSpeechSeconds('Add salt at the end.') + estimateSpeechSeconds('Serve hot.'));
  });

  it('every price is a whole credit (CP-1 §6.4 — no fractional display anywhere)', () => {
    const lines = [line({}), line({ id: 'line-2', text: 'Fold the batter gently, do not beat it.' })];
    for (const engine of VOICE_ENGINES) {
      const quote = scriptQuote(DEFAULT_COMPOSER_SETTINGS, engine, lines);
      expect(Number.isInteger(quote.credits)).toBe(true);
      expect(quote.credits).toBeGreaterThanOrEqual(1);
    }
    expect(Number.isInteger(PERSONA_TRAINING_CREDITS)).toBe(true);
    expect(Number.isInteger(VOICE_CLONE_TRAINING_CREDITS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dial vs engine — the Audio pattern's core distinction (spec §7.2)
// ---------------------------------------------------------------------------

describe('dial / engine / language separation', () => {
  it('picking an engine never moves the dial, the voice or the language', () => {
    const next = withEnginePick(DEFAULT_VOICE_SESSION, 'studio-cast');
    expect(next.engineId).toBe('studio-cast');
    expect(next.voiceSlotId).toBe(DEFAULT_VOICE_SESSION.voiceSlotId);
    expect(next.dialMode).toBe(DEFAULT_VOICE_SESSION.dialMode);
    expect(next.languageId).toBe(DEFAULT_VOICE_SESSION.languageId);
  });

  it('picking a voice never changes the engine; dial mode changes nothing else', () => {
    const picked = withVoicePick(DEFAULT_VOICE_SESSION, 'narrator');
    expect(picked.voiceSlotId).toBe('narrator');
    expect(picked.engineId).toBe(DEFAULT_VOICE_SESSION.engineId);
    const moded = withDialMode(picked, 'translate');
    expect(moded.dialMode).toBe('translate');
    expect(moded.voiceSlotId).toBe('narrator');
    expect(moded.engineId).toBe(DEFAULT_VOICE_SESSION.engineId);
    const languaged = withLanguage(moded, 'tamil');
    expect(languaged.languageId).toBe('tamil');
    expect(languaged.engineId).toBe(DEFAULT_VOICE_SESSION.engineId);
  });

  it('unknown ids are refused, never stored', () => {
    expect(withEnginePick(DEFAULT_VOICE_SESSION, 'nope')).toBe(DEFAULT_VOICE_SESSION);
    expect(withVoicePick(DEFAULT_VOICE_SESSION, 'nope')).toBe(DEFAULT_VOICE_SESSION);
    expect(withLanguage(DEFAULT_VOICE_SESSION, 'klingon')).toBe(DEFAULT_VOICE_SESSION);
  });

  it('dial modes map to their registered twins', () => {
    expect(DIAL_MODES.map((m) => dialModeTool(m.id))).toEqual([VOICEOVER_TOOL, VOICEOVER_TOOL, DUB_TOOL]);
    expect(DUB_TOOL).toBe('quantcooks.dub_video');
  });
});

// ---------------------------------------------------------------------------
// Attempts — voiceover and dub land on honest outcomes
// ---------------------------------------------------------------------------

describe('voiceover + dub attempts', () => {
  it('an empty script is invalid; a real one is preserved verbatim, uncharged', () => {
    expect(attemptVoiceover(DEFAULT_VOICE_SESSION, [line({ text: '  ' })]).status).toBe('invalid');
    const lines = [line({ text: 'Pehle tadka, phir pyaaz.' }), line({ id: 'line-2', text: 'Serve hot.' })];
    const outcome = attemptVoiceover(DEFAULT_VOICE_SESSION, lines);
    expect(outcome.status).toBe('not-configured');
    if (outcome.status !== 'not-configured') throw new Error('unreachable');
    expect(outcome.tool).toBe(VOICEOVER_TOOL);
    expect(outcome.code).toBe('PROVIDER_NOT_CONFIGURED');
    expect(outcome.lines).toEqual(['Pehle tadka, phir pyaaz.', 'Serve hot.']);
    expect(outcome.chargedCredits).toBe(0);
    expect('outputs' in outcome).toBe(false);
    expect('audioUrl' in outcome).toBe(false);
    expect('job' in outcome).toBe(false);
  });

  it('dub needs a READY video; its quote refuses rather than inventing a per-second total', () => {
    expect(attemptDub({ asset: null, session: DEFAULT_VOICE_SESSION }).status).toBe('invalid');
    expect(
      attemptDub({ asset: asset({ type: 'video', uploadStatus: 'PENDING' }), session: DEFAULT_VOICE_SESSION }).status,
    ).toBe('invalid');
    const outcome = attemptDub({
      asset: asset({ id: 'vid-1', type: 'video', filename: 'recipe.mp4' }),
      session: { ...DEFAULT_VOICE_SESSION, dialMode: 'translate', languageId: 'hindi' },
    });
    expect(outcome.status).toBe('not-configured');
    if (outcome.status !== 'not-configured') throw new Error('unreachable');
    expect(outcome.tool).toBe(DUB_TOOL);
    expect(outcome.targetLanguageId).toBe('hindi');
    expect(DUB_QUOTE_NOTE).toContain('per second');
  });

  it('pickers bind READY assets of the right kind only', () => {
    const assets = [
      asset({ id: 'a-ready', type: 'audio' }),
      asset({ id: 'a-pending', type: 'audio', uploadStatus: 'PENDING', url: null }),
      asset({ id: 'v-ready', type: 'video', filename: 'clip.mp4' }),
      asset({ id: 'i-ready', type: 'image', filename: 'me.jpg' }),
      asset({ id: 'i-pending', type: 'image', uploadStatus: 'PENDING', url: null }),
    ];
    expect(pickableAudioAssets(assets).map((a) => a.id)).toEqual(['a-ready']);
    expect(pickableDubAssets(assets).map((a) => a.id)).toEqual(['v-ready']);
    expect(pickablePersonaReferenceAssets(assets).map((a) => a.id)).toEqual(['i-ready']);
  });
});

// ---------------------------------------------------------------------------
// Chef Persona — the consent state machine (spec §7.3, CP-1 §8)
// ---------------------------------------------------------------------------

describe('persona consent + training', () => {
  it('a created draft starts untrained, unacknowledged, status draft — there is no other status', () => {
    const draft = createPersonaDraft({
      id: 'persona-1',
      name: '  Chef Ravi  ',
      presenterType: 'Home Chef',
      picks: defaultPersonaPicks(),
      referenceAssetIds: ['asset-photo-1'],
      consent: null,
      createdAt: '2026-10-29T00:00:00.000Z',
    });
    expect(draft.name).toBe('Chef Ravi');
    expect(draft.status).toBe('draft');
    expect(draft.trainingState).toBe('not-started');
    expect(draft.useAcknowledged).toBe(false);
  });

  it('consent is validated FIRST: no consent → CONSENT_REQUIRED, persona stays a draft', () => {
    const outcome = attemptPersonaTraining(persona({}));
    expect(outcome.status).toBe('consent-required');
    if (outcome.status !== 'consent-required') throw new Error('unreachable');
    expect(outcome.code).toBe('CONSENT_REQUIRED');
    expect(outcome.tool).toBe(PERSONA_TOOL);
    const after = applyTrainingOutcome([persona({})], 'persona-1', outcome);
    expect(after[0]!.status).toBe('draft');
    expect(after[0]!.trainingState).toBe('consent-required');
  });

  it('with consent recorded, the unconfigured engine answers — still a draft, still uncharged', () => {
    const recorded = recordPersonaConsent([persona({})], 'persona-1', '2026-10-29T02:00:00.000Z');
    expect(recorded[0]!.consent).toEqual({ ownLikeness: true, confirmedAt: '2026-10-29T02:00:00.000Z' });
    const outcome = attemptPersonaTraining(recorded[0]!);
    expect(outcome.status).toBe('not-configured');
    if (outcome.status !== 'not-configured') throw new Error('unreachable');
    expect(outcome.code).toBe('TRAINING_NOT_CONFIGURED');
    expect(outcome.chargedCredits).toBe(0);
    expect('personaId' in outcome).toBe(false);
    const after = applyTrainingOutcome(recorded, 'persona-1', outcome);
    expect(after[0]!.status).toBe('draft');
    expect(after[0]!.trainingState).toBe('not-configured');
  });

  it('the gate keeps its three blocks separate (Unit 5 pattern)', () => {
    const allClear = { trainingCompleted: true, providerConfigured: true };
    expect(personaGenerationGate(persona({}), allClear).reasons).toHaveLength(1);
    expect(personaGenerationGate(persona({}), allClear).reasons[0]).toContain('consent');
    expect(personaGenerationGate(consentedPersona({}), { trainingCompleted: false, providerConfigured: true }).reasons).toHaveLength(1);
    expect(
      personaGenerationGate(consentedPersona({}), { trainingCompleted: false, providerConfigured: true }).reasons[0],
    ).toContain('TRAINING_NOT_CONFIGURED');
    expect(personaGenerationGate(consentedPersona({}), { trainingCompleted: true, providerConfigured: false }).reasons).toHaveLength(1);
    const armed = personaGenerationGate(consentedPersona({}), allClear);
    expect(armed.armed).toBe(true);
    expect(armed.reasons).toEqual([]);
    // And today's facts block on all three, printed separately.
    expect(personaGenerationGate(persona({}), { trainingCompleted: false, providerConfigured: false }).reasons).toHaveLength(3);
  });

  it('speak layers: gate first, then the first-use acknowledgement, then the tool refusal', () => {
    const facts = { trainingCompleted: true, providerConfigured: true };
    expect(
      attemptPersonaSpeak({ persona: persona({}), scriptText: 'Namaste.', facts, acknowledgeNow: true }).status,
    ).toBe('blocked');
    const needsAck = attemptPersonaSpeak({
      persona: consentedPersona({}),
      scriptText: 'Namaste.',
      facts,
      acknowledgeNow: false,
    });
    expect(needsAck.status).toBe('acknowledgement-required');
    const refused = attemptPersonaSpeak({
      persona: consentedPersona({ useAcknowledged: true }),
      scriptText: 'Namaste.',
      facts,
      acknowledgeNow: false,
    });
    expect(refused.status).toBe('not-configured');
    if (refused.status !== 'not-configured') throw new Error('unreachable');
    expect(refused.tool).toBe(SPEAK_TOOL);
    expect('outputs' in refused).toBe(false);
    expect(
      attemptPersonaSpeak({ persona: consentedPersona({}), scriptText: ' ', facts, acknowledgeNow: true }).status,
    ).toBe('invalid');
  });
});

// ---------------------------------------------------------------------------
// Voice cloning — the same consent family, its own tool (CP-1 §4.2)
// ---------------------------------------------------------------------------

describe('voice cloning', () => {
  it('a created clone draft is a draft — the type gives it no ready state to grow into', () => {
    const draft = createVoiceCloneDraft({
      id: 'voice-1',
      name: 'My kitchen voice',
      sampleAssetIds: ['asset-1'],
      languageId: 'hinglish',
      consent: null,
      createdAt: '2026-10-29T00:00:00.000Z',
    });
    expect(draft.status).toBe('draft');
    expect(draft.cloneState).toBe('not-started');
  });

  it('no samples → invalid; samples without consent → CONSENT_REQUIRED; with consent → engine refusal', () => {
    expect(attemptVoiceClone(cloneDraft({ sampleAssetIds: [] })).status).toBe('invalid');
    const noConsent = attemptVoiceClone(cloneDraft({}));
    expect(noConsent.status).toBe('consent-required');
    if (noConsent.status !== 'consent-required') throw new Error('unreachable');
    expect(noConsent.code).toBe('CONSENT_REQUIRED');
    const recorded = recordVoiceConsent([cloneDraft({})], 'voice-1', '2026-10-29T02:00:00.000Z');
    const outcome = attemptVoiceClone(recorded[0]!);
    expect(outcome.status).toBe('not-configured');
    if (outcome.status !== 'not-configured') throw new Error('unreachable');
    expect(outcome.code).toBe('VOICE_TRAINING_NOT_CONFIGURED');
    expect(outcome.tool).toBe(CLONE_VOICE_TOOL);
    expect('voiceId' in outcome).toBe(false);
    const after = applyCloneOutcome(recorded, 'voice-1', outcome);
    expect(after[0]!.status).toBe('draft');
  });
});

// ---------------------------------------------------------------------------
// The draft mirror — round-trip + forgery resistance
// ---------------------------------------------------------------------------

describe('voice draft mirror', () => {
  it('round-trips session, lines, dub pick, personas and clones', () => {
    const draft: VoiceDraft = {
      session: { dialMode: 'translate', voiceSlotId: 'narrator', engineId: 'studio-cast', languageId: 'tamil' },
      lines: [line({}), line({ id: 'line-2', text: 'Serve hot.', voiceSlotId: 'narrator' })],
      referenceVideoAssetId: 'vid-1',
      personas: [consentedPersona({})],
      voiceClones: [cloneDraft({ consent: { ownVoice: true, confirmedAt: '2026-10-29T02:00:00.000Z' } })],
    };
    expect(parseVoiceDraft(serializeVoiceDraft(draft))).toEqual(draft);
    expect(parseVoiceDraft(null)).toEqual(EMPTY_VOICE_DRAFT);
    expect(parseVoiceDraft('{not json')).toEqual(EMPTY_VOICE_DRAFT);
  });

  it('a forged mirror cannot resurrect a trained persona or a ready voice', () => {
    const forged = JSON.stringify({
      personas: [{ ...persona({}), status: 'trained' }],
      voiceClones: [{ ...cloneDraft({}), status: 'ready' }],
    });
    const parsed = parseVoiceDraft(forged);
    expect(parsed.personas[0]!.status).toBe('draft');
    expect(parsed.voiceClones[0]!.status).toBe('draft');
  });

  it('forged consent shapes are dropped, unknown catalogue ids fall back', () => {
    const forged = JSON.stringify({
      session: { engineId: 'nope', languageId: 'klingon', voiceSlotId: 'ghost' },
      personas: [{ ...persona({}), consent: { ownLikeness: 'yes', confirmedAt: 42 } }],
    });
    const parsed = parseVoiceDraft(forged);
    expect(parsed.session).toEqual(DEFAULT_VOICE_SESSION);
    expect(parsed.personas[0]!.consent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Results — only real COMPLETED audio outputs
// ---------------------------------------------------------------------------

describe('voice results', () => {
  it('only COMPLETED jobs’ audio outputs become cards', () => {
    const jobs: StudioJob[] = [
      {
        job_id: 'j1', status: 'COMPLETED', progress: 100, credit_cost: 3,
        outputs: [{ id: 'o1', kind: 'audio', url: 'https://signed.example/n.mp3', label: 'Narration' }],
        error: null,
      },
      {
        job_id: 'j2', status: 'COMPLETED', progress: 100, credit_cost: 8,
        outputs: [{ id: 'o2', kind: 'video', url: 'https://signed.example/v.mp4' }],
        error: null,
      },
      {
        job_id: 'j3', status: 'FAILED', progress: null, credit_cost: 0,
        outputs: [{ id: 'o3', kind: 'audio', url: null }],
        error: 'PROVIDER_NOT_CONFIGURED',
      },
    ];
    expect(voiceResultsFromJobs(jobs)).toEqual([
      { jobId: 'j1', outputId: 'o1', url: 'https://signed.example/n.mp3', label: 'Narration' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Rendering — Voice Studio script view (five states across surfaces)
// ---------------------------------------------------------------------------

const studioProps = (over: Partial<VoiceStudioProps>): VoiceStudioProps => ({
  assets: [],
  assetsState: 'ready',
  jobs: [],
  ...over,
});

describe('VoiceStudio rendering', () => {
  it('renders the dial and the engine as two separate controls, Hinglish first-class', () => {
    const html = renderToStaticMarkup(React.createElement(VoiceStudio, studioProps({})));
    expect(html).toContain('data-testid="voice-dial"');
    expect(html).toContain('data-testid="voice-engine"');
    expect(html).toContain('Voiceover');
    expect(html).toContain('Change Voice');
    expect(html).toContain('Translate');
    for (const engine of VOICE_ENGINES) expect(html).toContain(engine.name);
    for (const slot of VOICE_SLOTS) expect(html).toContain(slot.label);
    for (const language of VOICE_LANGUAGES.slice(0, 3)) expect(html).toContain(language.label);
    // The dial's slot is unassigned — no fake preview player anywhere.
    expect(html).toContain('unassigned');
    expect(html).not.toContain('<audio');
  });

  it('empty state offers the starter line; a priced line shows its quote and the total', () => {
    const empty = renderToStaticMarkup(React.createElement(VoiceStudio, studioProps({})));
    expect(empty).toContain('data-testid="voice-script-empty"');
    expect(empty).toContain('data-testid="voice-starter-line"');
    expect(empty).toContain('Generate · —');

    const draft: VoiceDraft = {
      ...EMPTY_VOICE_DRAFT,
      lines: [line({}), line({ id: 'line-2', text: 'Serve hot.' })],
    };
    const html = renderToStaticMarkup(React.createElement(VoiceStudio, studioProps({ initialDraft: draft })));
    expect(html).toContain('data-testid="voice-line-quote-line-1"');
    expect(html).toContain('1 credit · ≈2s of speech');
    expect(html).toContain('Generate · 2 credits');
    expect(html).toContain('data-testid="voice-results-empty"');
  });

  it('assets loading and error states render on the reference slot, with retry', () => {
    const loading = renderToStaticMarkup(React.createElement(VoiceStudio, studioProps({ assetsState: 'loading' })));
    expect(loading).toContain('data-testid="voice-assets-loading"');
    const error = renderToStaticMarkup(
      React.createElement(VoiceStudio, studioProps({ assetsState: 'error', assetsError: 'STORAGE_NOT_CONFIGURED' })),
    );
    expect(error).toContain('data-testid="voice-assets-error"');
    expect(error).toContain('STORAGE_NOT_CONFIGURED');
  });

  it('translate mode shows the honest per-second quote note and names dub_video', () => {
    const draft: VoiceDraft = {
      ...EMPTY_VOICE_DRAFT,
      session: { ...DEFAULT_VOICE_SESSION, dialMode: 'translate' },
    };
    const html = renderToStaticMarkup(React.createElement(VoiceStudio, studioProps({ initialDraft: draft })));
    expect(html).toContain('data-testid="voice-dub-quote-note"');
    expect(html).toContain('per second');
    expect(html).toContain(DUB_TOOL);
  });

  it('a READY video is pickable for the dub slot; a PENDING one is not offered', () => {
    const assets = [
      asset({ id: 'vid-ready', type: 'video', filename: 'ready-clip.mp4' }),
      asset({ id: 'vid-pending', type: 'video', filename: 'pending-clip.mp4', uploadStatus: 'PENDING', url: null }),
    ];
    const html = renderToStaticMarkup(React.createElement(VoiceStudio, studioProps({ assets })));
    expect(html).toContain('ready-clip.mp4');
    expect(html).not.toContain('pending-clip.mp4');
  });
});

// ---------------------------------------------------------------------------
// Rendering — Chef Persona builder / library / detail
// ---------------------------------------------------------------------------

describe('VoicePersonas rendering', () => {
  it('empty library + builder: picker stack, consent copy, training cost stated', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoicePersonas, {
        personas: [], assets: [], assetsState: 'ready', onPersonasChange: () => {}, initialBuilderOpen: true,
      }),
    );
    expect(html).toContain('data-testid="persona-library-empty"');
    expect(html).toContain('data-testid="persona-picker-face"');
    expect(html).toContain('data-testid="persona-picker-body"');
    expect(html).toContain('data-testid="persona-picker-style"');
    expect(html).toContain('my own likeness');
    expect(html).toContain(`${PERSONA_TRAINING_CREDITS} credits one-off`);
  });

  it('a persona card says Draft; the detail prints the gate’s separate reasons', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoicePersonas, {
        personas: [persona({})],
        assets: [asset({ id: 'asset-photo-1', type: 'image', filename: 'me.jpg' })],
        assetsState: 'ready',
        onPersonasChange: () => {},
        initialSelectedId: 'persona-1',
      }),
    );
    expect(html).toContain('data-testid="persona-card-persona-1"');
    expect(html).toContain('Draft on this device');
    expect(html).toContain('data-testid="persona-gate-reasons"');
    expect(html).toContain('No consent is recorded');
    expect(html).toContain('TRAINING_NOT_CONFIGURED');
    expect(html).toContain('PROVIDER_NOT_CONFIGURED');
    expect(html).toContain(`Train · ${PERSONA_TRAINING_CREDITS} credits (one-off)`);
    expect(html).toContain('identity can drift');
  });

  it('reference picker offers READY photos only', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoicePersonas, {
        personas: [],
        assets: [
          asset({ id: 'photo-ready', type: 'image', filename: 'ready.jpg' }),
          asset({ id: 'photo-pending', type: 'image', filename: 'pending.jpg', uploadStatus: 'PENDING', url: null }),
          asset({ id: 'clip', type: 'video', filename: 'clip.mp4' }),
        ],
        assetsState: 'ready',
        onPersonasChange: () => {},
        initialBuilderOpen: true,
      }),
    );
    expect(html).toContain('data-testid="persona-reference-photo-ready"');
    expect(html).not.toContain('pending.jpg');
    expect(html).not.toContain('clip.mp4');
  });
});

// ---------------------------------------------------------------------------
// Rendering — Voice Library: honest stock grid, clone flow, real audio
// ---------------------------------------------------------------------------

describe('VoiceLibrary rendering', () => {
  it('the stock grid is honestly empty — no invented voices, no fake samples', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceLibrary, {
        voiceClones: [], assets: [], assetsState: 'ready', onVoiceClonesChange: () => {},
      }),
    );
    expect(html).toContain('data-testid="voice-stock-empty"');
    expect(html).toContain('no catalogue is configured');
    expect(html).not.toContain('<audio');
    expect(html).toContain(`Clone voice · ${VOICE_CLONE_TRAINING_CREDITS} credits (one-off)`);
    expect(html).toContain('data-testid="voice-clones-empty"');
  });

  it('your audio lists READY clips with a real player; PENDING clips are not samples', () => {
    const html = renderToStaticMarkup(
      React.createElement(VoiceLibrary, {
        voiceClones: [cloneDraft({})],
        assets: [
          asset({ id: 'clip-ready', type: 'audio', filename: 'my-voice.mp3' }),
          asset({ id: 'clip-pending', type: 'audio', filename: 'still-uploading.mp3', uploadStatus: 'PENDING', url: null }),
        ],
        assetsState: 'ready',
        onVoiceClonesChange: () => {},
      }),
    );
    expect(html).toContain('data-testid="voice-sample-clip-ready"');
    expect(html).not.toContain('still-uploading.mp3');
    expect(html).toContain('https://signed.example/narration-take-1.mp3');
    expect(html).toContain('data-testid="voice-clone-card-voice-1"');
    expect(html).toContain('Consent not recorded');
  });
});
