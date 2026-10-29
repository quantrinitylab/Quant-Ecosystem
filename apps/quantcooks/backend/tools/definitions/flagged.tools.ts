// ============================================================================
// QuantCooks CP-1 — Group J: the two Phase-2 flags, registered (§4).
// Phase 2's studio specs flagged both tools in writing and forbade
// inventing shipped names in UI copy; these are the manifest names.
//
// score_hook: the output is a modelled ESTIMATE — `framing:
// 'modelled_estimate'` is part of the result schema, not just UI copy,
// so every surface inherits the honest framing. The executor validates
// the asset (caller's, video, READY) and enforces the 15-second rule
// BEFORE spend and before configuration (CLIP_TOO_LONG_FOR_ANALYSIS) —
// then refuses with ANALYSIS_NOT_CONFIGURED until G-13 wires an engine.
// It must never return a plausible-looking invented score.
//
// clone_voice: creation is a separate tool from use (add_voiceover) —
// collapsing a consent-gated training charge into a narration call was
// rejected explicitly in §4.2. Consent gate first, then
// VOICE_TRAINING_NOT_CONFIGURED until G-6.
// ============================================================================

import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { ToolRegistry } from '../registry';
import { failClosed } from '../registry';
import { consentSchema, requireConsent, jobOut, out } from './shared';

export const HOOK_ANALYSIS_MAX_SECONDS = 15;

export function registerFlaggedTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.score_hook',
    group: 'analysis',
    description:
      'Score a short clip’s opening hook (a modelled estimate, framed as such in the result — never a virality promise). The clip must be the caller’s own READY video of at most 15 seconds; longer clips refuse with CLIP_TOO_LONG_FOR_ANALYSIS before any spend. Async job (ANALYSIS) whose result is a report object, not an asset. Refuses with ANALYSIS_NOT_CONFIGURED until the analysis engine lands (G-13).',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'ANALYSIS_NOT_CONFIGURED',
    inputSchema: z.object({
      videoAssetId: z.string().min(1),
      platform: z.enum(['reels', 'shorts', 'tiktok', 'generic']).optional().default('generic'),
    }),
    outputSchema: out({
      job: z.unknown(),
      result: z
        .object({
          score: z.number().int().min(0).max(100),
          factors: z.object({
            firstFramePull: z.number(),
            hook: z.number(),
            hold: z.number(),
            motion: z.number(),
            faces: z.number(),
            text: z.number(),
            sound: z.number(),
          }),
          framing: z.literal('modelled_estimate'),
          analysedDurationSec: z.number(),
        })
        .optional(),
    }),
    example: { input: { videoAssetId: 'asset_9', platform: 'reels' } },
    execute: async (input, ctx, deps) => {
      // Validation precedes configuration (§4.1): ownership/type/state
      // and the 15 s rule are stated before spend — and before the
      // ANALYSIS_NOT_CONFIGURED refusal.
      const asset = await deps.assets.getAsset(input.videoAssetId, ctx.actorUserId);
      if (asset.type !== 'video') {
        throw createAppError('Hook analysis needs a video asset', 400, 'SOURCE_NOT_VIDEO');
      }
      if (asset.uploadStatus !== 'READY') {
        throw createAppError(
          `Asset is not ready for analysis (status: ${asset.uploadStatus})`,
          400,
          'ASSET_NOT_READY',
        );
      }
      const duration = deps.durationProbe
        ? await deps.durationProbe(input.videoAssetId, ctx.actorUserId)
        : null;
      if (duration !== null && duration > HOOK_ANALYSIS_MAX_SECONDS) {
        throw createAppError(
          `Clip is ${Math.round(duration)}s; hook analysis covers at most ${HOOK_ANALYSIS_MAX_SECONDS} seconds`,
          400,
          'CLIP_TOO_LONG_FOR_ANALYSIS',
        );
      }
      throw createAppError(
        'The hook analysis engine is not configured on this deployment yet (G-13)',
        503,
        'ANALYSIS_NOT_CONFIGURED',
      );
    },
  });

  registry.register({
    name: 'quantcooks.clone_voice',
    group: 'generation',
    description:
      'Clone the caller’s OWN voice from their audio samples, creating a voice usable by the narration/dubbing tools. Consent is a schema requirement: consent.ownVoice must be true or the invoke refuses with CONSENT_REQUIRED before any job exists — on every surface. Async job (TRAINING); refuses with VOICE_TRAINING_NOT_CONFIGURED until the voice engine lands (G-6).',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'VOICE_TRAINING_NOT_CONFIGURED',
    inputSchema: z.object({
      name: z.string().min(1).max(200),
      sampleAssetIds: z.array(z.string().min(1)).min(1),
      language: z.string().optional(),
      consent: consentSchema('ownVoice'),
    }),
    outputSchema: jobOut,
    example: {
      input: {
        name: 'My narration voice',
        sampleAssetIds: ['asset_5'],
        consent: { ownVoice: true, confirmedAt: '2026-10-29T00:00:00.000Z' },
      },
    },
    consentCheck: requireConsent('ownVoice', 'Voice cloning'),
    execute: failClosed(
      'VOICE_TRAINING_NOT_CONFIGURED',
      'The voice training engine is not configured on this deployment yet (G-6)',
    ),
  });
}
