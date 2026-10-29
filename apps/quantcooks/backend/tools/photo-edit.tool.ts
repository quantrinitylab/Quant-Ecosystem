// ============================================================================
// QuantCooks - quantcooks.edit_photo (C-3B tool DEFINITION + executor)
// ============================================================================
//
// The QuantAI twin of the PhotoCraft companion photo edit, in the exact
// shape the CP-1 manifest spec (goal hidden_files/quantcooks-cp1-manifest-
// spec.md) prescribes for backend tool definitions (§2.1 D1: definitions
// with schemas + executor + pricing + permission tier; §7.1 ToolContext;
// §7.4 permission tiers; §8 fail-closed matrix) — the shape C-2's
// craft-render.tool.ts landed for quantcooks.render_effects.
//
// Two honesty notes, recorded for CP-1's Step 0 (§12):
//
//  1. NAME: CP-1's 54-tool manifest contains NO photo-edit tool name — the
//     manifest's image surface is generation (generate_dish_image) and the
//     checklist's row #80 twin is upload_asset (the web embed's save-back).
//     This definition proposes `quantcooks.edit_photo` for the companion
//     edit surface; the name is PENDING CP-1 ratification (re-naming is
//     one string here). It is exposed nowhere user-facing until CP-1
//     registers it.
//
//  2. GATEWAY WIRING IS CP-1's FOLLOW-UP: the CP-1 registry
//     (backend/tools/registry.ts + the packages/quant-tools adapter) is
//     not landed in apps/quantcooks yet, and no MCP/CLI surface exists
//     today. This file lands the DEFINITION + executor binding in the CP-1
//     shape so CP-1 step 1 can register it mechanically. Nothing here
//     claims a live MCP endpoint — the REST route (backend/routes/photo.ts)
//     is the only live surface, and agent-surface invocation (surface
//     'quantai'/'mcp'/'cli' with a delegation) stays refused by CP-1's
//     §7.1 rule until CP-3 lands delegation.
//
// Operations: the input's operations[] names commands from the adapter's
// VERIFIED allowlist only (photocraft.adapter.ts PHOTO_OPERATIONS — every
// entry run headless against the pinned binary in Phase 1, params mirrored
// from its own `commands --json` docs). The service re-validates at
// creation; an unlisted id is a 400 INVALID_OPERATIONS before any spawn.
//
// Pricing (CP-1 §6.3): no photo-edit rate row exists yet — pricing policy
// is reserved to Krish/CEO (§14 open decision 1). The definition therefore
// declares `metering: 'not_wired'` with a 0-credit quote, the exact
// pre-CP-2 surface C-2 pinned for render_effects. When CP-2 lands, the
// rate row is data and this descriptor flips without a shape change;
// permissionTier is already 2 (Confirm) per §7.4 because this is a
// credit-spending class of invoke once priced.
// ============================================================================

import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { PhotoEditService, PhotoEditJob } from '../services/photo-edit.service';
import { PHOTO_OUTPUT_FORMATS } from '../services/photo-edit.service';
import { MAX_PHOTO_OPERATIONS } from '../services/photocraft.adapter';
import type { ToolContext, CraftToolDefinition } from './craft-render.tool';

export const editPhotoInputSchema = z.object({
  /** The caller's READY image asset to edit. The output lands as a NEW
   *  asset in the same project; the source is never mutated. */
  sourceAssetId: z.string().min(1),
  /** Allowlist operation ids + params, applied in order (max 32). Param
   *  shapes/ranges are the adapter's PHOTO_OPERATIONS rules, re-validated
   *  by the service before any spawn. */
  operations: z
    .array(
      z.object({
        id: z.string().min(1),
        params: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(MAX_PHOTO_OPERATIONS),
  outputFormat: z.enum(PHOTO_OUTPUT_FORMATS).optional(),
});

export const editPhotoOutputSchema = z.object({
  job_id: z.string(),
  status: z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']),
  progress: z.number(),
  source_asset_id: z.string(),
  output_asset_id: z.string().nullable(),
  output_url: z.string().nullable(),
  credit_cost: z.number(),
  metering: z.literal('not_wired'),
  error: z.string().nullable(),
});

export type EditPhotoInput = z.infer<typeof editPhotoInputSchema>;
export type EditPhotoOutput = z.infer<typeof editPhotoOutputSchema>;

export function photoJobToToolOutput(job: PhotoEditJob): EditPhotoOutput {
  return {
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    source_asset_id: job.sourceAssetId,
    output_asset_id: job.outputAssetId,
    output_url: job.outputUrl,
    credit_cost: job.creditCost,
    metering: job.metering,
    error: job.error,
  };
}

/**
 * Bind the definition to a live PhotoEditService. The executor refuses
 * with 503 PHOTO_NOT_CONFIGURED (naming the companion) when the companion
 * is unconfigured — the same error the REST surface answers (CP-1 §3.1:
 * every surface reads the same typed refusals).
 */
export function createEditPhotoTool(
  service: PhotoEditService,
): CraftToolDefinition<EditPhotoInput, EditPhotoOutput> {
  return {
    name: 'quantcooks.edit_photo',
    group: 'craft',
    description:
      'Edit one of the caller\'s images with the pinned PhotoCraft companion engine: an ordered list of allowlisted operations (resize, canvas size, crop, trim, rotate/flip, brightness/contrast, hue/saturation, exposure, vibrance, invert, desaturate, grayscale, gaussian blur, unsharp mask, sharpen) applied headlessly. Async: returns a PHOTO_EDIT job; the result lands as a NEW asset in the source\'s project — the source is never mutated. Output formats: png, jpg, webp, psd. Fails closed with PHOTO_NOT_CONFIGURED when the companion is not installed on this deployment.',
    mode: 'async',
    inputSchema: editPhotoInputSchema,
    outputSchema: editPhotoOutputSchema,
    pricing: { rule: 'not_wired', creditCost: 0 },
    permissionTier: 2,
    execute: async (input, context) => {
      if (!context.actorUserId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }
      const job = await service.createEdit({
        sourceAssetId: input.sourceAssetId,
        operations: input.operations,
        outputFormat: input.outputFormat,
        userId: context.actorUserId,
      });
      return photoJobToToolOutput(job);
    },
  };
}
