// ============================================================================
// QuantCooks CP-1 — Group I: generation (tools 36–51, Tier B). Schemas
// and pricing rules are FINAL here; executors fail closed with their
// named codes until their G-units land, at which point only the executor
// body changes (§2.1 D2). All outputs are jobs on the unified model;
// finished assets land in the job's outputs[] and permanently in Assets
// — generation results are never throwaway URLs.
//
// Refusal codes follow the §8 matrix: PROVIDER-priced tools refuse with
// PROVIDER_NOT_CONFIGURED (quote AND invoke); the persona-training tool
// refuses with TRAINING_NOT_CONFIGURED after its consent gate; the
// pipeline parent refuses with PIPELINE_NOT_CONFIGURED (its children are
// provider-priced steps whose quotes compose the plan price, §6.3).
// Voice/dub/transform/upscale engines are providers too — until one is
// configured they share the PROVIDER_NOT_CONFIGURED truth.
// ============================================================================

import { z } from 'zod';
import type { ToolRegistry } from '../registry';
import { failClosed } from '../registry';
import { consentSchema, requireConsent, jobOut } from './shared';

const PROVIDER_MSG = 'No generation provider is configured on this deployment yet';

const sharedVideoParams = {
  cameraPresets: z.array(z.string()).max(3).optional(),
  effectIds: z.array(z.string()).optional(),
  personaId: z.string().optional(),
  aspectRatio: z.string().optional(),
  durationSec: z.number().positive().optional(),
  startFrameAssetId: z.string().optional(),
  endFrameAssetId: z.string().optional(),
  model: z.string().optional(),
};

export function registerGenerationTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.generate_dish_image',
    group: 'generation',
    description:
      'Generate a dish image from a prompt (optionally restyling or outpainting a source asset — the engine under Dish Photo Fix and Expand Photo). Async job (IMAGE_GEN); price comes from the provider’s quote, so quotes and invokes refuse with PROVIDER_NOT_CONFIGURED until a provider is configured.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      prompt: z.string().min(1),
      sourceAssetId: z.string().optional(),
      stylePresetId: z.string().optional(),
      aspectRatio: z.string().optional(),
      quality: z.enum(['draft', 'standard', 'high']).optional(),
      batch: z.number().int().min(1).max(4).optional(),
      mode: z.enum(['generate', 'restyle', 'outpaint']).optional(),
      model: z.string().optional(),
    }),
    outputSchema: jobOut,
    example: { input: { prompt: 'Overhead shot of dum biryani in a handi' } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.generate_video_from_text',
    group: 'generation',
    description:
      'Generate a video clip from a text prompt, with optional camera presets (max 3 stacked), effects and a persona. Async job (VIDEO_GEN); provider-priced — refuses with PROVIDER_NOT_CONFIGURED until a provider is configured.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      prompt: z.string().min(1),
      ...sharedVideoParams,
    }),
    outputSchema: jobOut,
    example: { input: { prompt: 'Steam rising off a sizzler plate, slow push-in' } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.animate_image',
    group: 'generation',
    description:
      'Animate one of the caller’s images into a video clip (the Hero Frame flow’s second step), with optional camera presets. Async job (VIDEO_GEN); provider-priced — refuses with PROVIDER_NOT_CONFIGURED until a provider is configured.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      assetId: z.string().min(1),
      ...sharedVideoParams,
    }),
    outputSchema: jobOut,
    example: { input: { assetId: 'asset_1', cameraPresets: ['plate-push-in'] } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.create_storyboard',
    group: 'generation',
    description:
      'Create a storyboard from a brief: ordered frame assets plus per-frame shot descriptions. Stills only — no video spend happens inside this tool; animating approved frames is a separate create_shot_sequence invoke. Async job (STORYBOARD); provider-priced.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      brief: z.string().min(1),
      recipeRef: z.string().optional(),
      elementIds: z.array(z.string()).optional(),
      frameCount: z.number().int().min(1).optional(),
      model: z.string().optional(),
    }),
    outputSchema: jobOut,
    example: { input: { brief: 'A 30-second thali tour, four frames' } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.create_shot_sequence',
    group: 'generation',
    description:
      'Generate a sequence of shots (subject, action, camera preset, duration per shot) as one job with per-shot progress; when projectId is given, completed shots also assemble onto its timeline. Async job (SHOT_SEQUENCE); provider-priced as the sum of per-shot quotes.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      projectId: z.string().optional(),
      shots: z
        .array(
          z.object({
            subject: z.string().min(1),
            action: z.string().min(1),
            cameraPreset: z.string().optional(),
            durationSec: z.number().positive().optional(),
            elementIds: z.array(z.string()).optional(),
          }),
        )
        .min(1),
      style: z.record(z.string(), z.unknown()).optional(),
      model: z.string().optional(),
    }),
    outputSchema: jobOut,
    example: {
      input: { shots: [{ subject: 'Chef hands', action: 'tearing a naan', durationSec: 4 }] },
    },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.create_chef_persona',
    group: 'generation',
    description:
      'Train a reusable chef persona from the caller’s own reference images. CONSENT IS A SCHEMA REQUIREMENT: consent.ownLikeness must be true or the invoke refuses with CONSENT_REQUIRED before any job exists — on every surface. Async job (TRAINING); refuses with TRAINING_NOT_CONFIGURED until the training engine lands (G-5).',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'TRAINING_NOT_CONFIGURED',
    inputSchema: z.object({
      name: z.string().min(1).max(200),
      referenceAssetIds: z.array(z.string().min(1)).min(1),
      consent: consentSchema('ownLikeness'),
    }),
    outputSchema: jobOut,
    example: {
      input: {
        name: 'Chef Arjun',
        referenceAssetIds: ['asset_1'],
        consent: { ownLikeness: true, confirmedAt: '2026-10-29T00:00:00.000Z' },
      },
    },
    consentCheck: requireConsent('ownLikeness', 'Persona training'),
    execute: failClosed(
      'TRAINING_NOT_CONFIGURED',
      'The persona training engine is not configured on this deployment yet (G-5)',
    ),
  });

  registry.register({
    name: 'quantcooks.make_presenter_speak',
    group: 'generation',
    description:
      'Make a persona (or a source clip) speak a script as a talking-presenter video. Async job (VIDEO_GEN); provider-priced — refuses with PROVIDER_NOT_CONFIGURED until configured.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      personaId: z.string().optional(),
      sourceAssetId: z.string().optional(),
      scriptText: z.string().min(1),
      voiceId: z.string().optional(),
      language: z.string().optional(),
      model: z.string().optional(),
    }),
    outputSchema: jobOut,
    example: { input: { scriptText: 'Welcome to my kitchen', personaId: 'persona_1' } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.add_voiceover',
    group: 'generation',
    description:
      'Narrate a script in a chosen voice: returns an audio asset, plus a muxed video asset when videoAssetId is given. Async job (AUDIO_GEN); refuses with PROVIDER_NOT_CONFIGURED until a voice engine is configured (G-6).',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      videoAssetId: z.string().optional(),
      scriptText: z.string().min(1),
      voiceId: z.string().optional(),
      language: z.string().optional(),
      engineId: z.string().optional(),
    }),
    outputSchema: jobOut,
    example: { input: { scriptText: 'First, temper the spices', videoAssetId: 'asset_9' } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.dub_video',
    group: 'generation',
    description:
      'Dub one of the caller’s videos into a target language (output is a NEW video asset with the dubbed track). Async job (AUDIO_GEN), priced per second of probed source duration once the G-6 rate lands; refuses with PROVIDER_NOT_CONFIGURED until then.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      videoAssetId: z.string().min(1),
      targetLanguage: z.string().min(1),
      voiceId: z.string().optional(),
    }),
    outputSchema: jobOut,
    example: { input: { videoAssetId: 'asset_9', targetLanguage: 'hi' } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.create_food_ad',
    group: 'generation',
    description:
      'Create a food ad from a product URL or dish asset, in a named format (tasting_ugc, unboxing, tutorial, hyper_motion, big_screen_spot), optionally with a presenter persona and brand kit. Async job (AD_GEN) whose outputs are the ad variant assets; provider-priced as the sum of variants.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      productUrl: z.string().url().optional(),
      dishAssetId: z.string().optional(),
      presenterPersonaId: z.string().optional(),
      adFormat: z.enum(['tasting_ugc', 'unboxing', 'tutorial', 'hyper_motion', 'big_screen_spot']),
      brandKitId: z.string().optional(),
      hookStyle: z.string().optional(),
      setting: z.string().optional(),
      model: z.string().optional(),
    }),
    outputSchema: jobOut,
    example: { input: { dishAssetId: 'asset_3', adFormat: 'tasting_ugc' } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.vary_ad',
    group: 'generation',
    description:
      'Create variants of an existing ad asset (swap the dish, hook style, presenter or CTA). Async job (AD_GEN); provider-priced.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      sourceAdAssetId: z.string().min(1),
      changes: z.object({
        dishAssetId: z.string().optional(),
        hookStyle: z.string().optional(),
        presenterPersonaId: z.string().optional(),
        ctaText: z.string().optional(),
      }),
      variantCount: z.number().int().min(1).max(4).optional(),
    }),
    outputSchema: jobOut,
    example: { input: { sourceAdAssetId: 'asset_7', changes: { hookStyle: 'price-first' } } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.create_ugc_clip',
    group: 'generation',
    description:
      'Create a UGC-style clip for a dish/product with a persona and talking points. Async job (UGC_GEN); provider-priced.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      dishAssetId: z.string().optional(),
      productRef: z.string().optional(),
      personaId: z.string().optional(),
      talkingPoints: z.array(z.string().min(1)).min(1),
    }),
    outputSchema: jobOut,
    example: { input: { talkingPoints: ['Crispy outside', 'Molten centre'] } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.transform_video',
    group: 'generation',
    description:
      'Transform a video: motion transfer or object swap onto a dish, kitchen or presenter target. Presenter targets carry the persona consent rule once G-5/G-10 land. Async job (TRANSFORM), priced per second; refuses with PROVIDER_NOT_CONFIGURED until configured.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      sourceVideoAssetId: z.string().min(1),
      mode: z.enum(['motion_transfer', 'object_swap']),
      target: z.enum(['dish', 'kitchen', 'presenter']),
      referenceAssetIds: z.array(z.string().min(1)).min(1),
    }),
    outputSchema: jobOut,
    example: {
      input: {
        sourceVideoAssetId: 'asset_9',
        mode: 'object_swap',
        target: 'dish',
        referenceAssetIds: ['asset_4'],
      },
    },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.create_story_episode',
    group: 'generation',
    description:
      'Create 1–8 story episodes from a premise at a chosen length; the quote shows one breakdown line per episode (the published-price-table pattern). Async job (EPISODE); provider-priced per length × episodes.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      premise: z.string().min(1),
      tone: z.string().optional(),
      lengthSec: z.number().int().positive(),
      episodeCount: z.number().int().min(1).max(8),
      seriesId: z.string().optional(),
    }),
    outputSchema: jobOut,
    example: { input: { premise: 'A tiny bakery vs a big storm', lengthSec: 60, episodeCount: 2 } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.upscale_asset',
    group: 'generation',
    description:
      'Upscale an asset to 1080p or 4k. Output is a NEW asset; the source is never mutated. Async job (UPSCALE); refuses with PROVIDER_NOT_CONFIGURED until an upscale engine is configured (G-14).',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PROVIDER_NOT_CONFIGURED',
    inputSchema: z.object({
      assetId: z.string().min(1),
      targetResolution: z.enum(['1080p', '4k']),
    }),
    outputSchema: jobOut,
    example: { input: { assetId: 'asset_2', targetResolution: '4k' } },
    execute: failClosed('PROVIDER_NOT_CONFIGURED', PROVIDER_MSG),
  });

  registry.register({
    name: 'quantcooks.run_pipeline',
    group: 'generation',
    description:
      'Run a saved pipeline (or an inline node/edge definition) as a parent job whose steps are child jobs; the price is the plan sum of the child quotes and nothing charges without approval of that total. Async job (PIPELINE); refuses with PIPELINE_NOT_CONFIGURED until the G-12 runner lands.',
    mode: 'async',
    tier: 'B',
    permissionTier: 2,
    notConfiguredCode: 'PIPELINE_NOT_CONFIGURED',
    inputSchema: z.object({
      pipelineId: z.string().optional(),
      definition: z
        .object({
          nodes: z.array(z.record(z.string(), z.unknown())),
          edges: z.array(z.record(z.string(), z.unknown())),
        })
        .optional(),
      inputs: z.record(z.string(), z.unknown()),
    }),
    outputSchema: jobOut,
    example: { input: { inputs: {} } },
    execute: failClosed(
      'PIPELINE_NOT_CONFIGURED',
      'The pipeline runner is not configured on this deployment yet (G-12)',
    ),
  });
}
