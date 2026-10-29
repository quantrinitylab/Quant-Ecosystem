// ============================================================================
// QuantCooks - quantcooks.render_effects (C-2 tool DEFINITION + executor)
// ============================================================================
//
// The QuantAI twin of the EffectCraft companion render, in the exact shape
// the CP-1 manifest spec (goal hidden_files/quantcooks-cp1-manifest-spec.md)
// prescribes for backend tool definitions (§2.1 D1: definitions/*.ts with
// schemas + executor + pricing + permission tier; §7.1 ToolContext; §7.4
// permission tiers; §8 fail-closed matrix).
//
// Two honesty notes, recorded for CP-1's Step 0 (§12):
//
//  1. NAME: CP-1's 54-tool manifest contains NO craft-render tool name —
//     CRAFT_RENDER exists there only as a job KIND (§5.8). This definition
//     proposes `quantcooks.render_effects`; the name is PENDING CP-1
//     ratification (re-naming is one string here). It is exposed nowhere
//     user-facing until CP-1 registers it.
//
//  2. GATEWAY WIRING IS CP-1's FOLLOW-UP: the CP-1 registry
//     (backend/tools/registry.ts + the packages/quant-tools adapter) is not
//     landed in apps/quantcooks yet, and no MCP/CLI surface exists today.
//     This file lands the DEFINITION + executor binding in the CP-1 shape so
//     CP-1 step 1 can register it mechanically. Nothing here claims a live
//     MCP endpoint — the REST route (backend/routes/craft.ts) is the only
//     live surface, and agent-surface invocation (surface 'quantai'/'mcp'/
//     'cli' with a delegation) stays refused by CP-1's §7.1 rule until CP-3
//     lands delegation.
//
// Pricing (CP-1 §6.3): no CRAFT_RENDER rate row exists yet — pricing policy
// is reserved to Krish/CEO (§14 open decision 1). The definition therefore
// declares `metering: 'not_wired'` with a 0-credit quote, the exact pre-CP-2
// surface CP-1 §3.5 pins for run_auto_edit. When CP-2 lands, the rate row is
// data and this definition's descriptor flips to flat-rate without a shape
// change; permissionTier is already 2 (Confirm) per §7.4 because this is a
// credit-spending class of invoke once priced.
// ============================================================================

import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { CraftRenderService, CraftRenderJob } from '../services/craft-render.service';
import {
  CRAFT_RENDER_FORMATS,
  CRAFT_RENDER_QUALITIES,
  CRAFT_RENDER_RESOLUTIONS,
} from '../services/craft-render.service';

/** ToolContext — CP-1 §7.1, verbatim field shape. */
export interface ToolContext {
  actorUserId: string;
  surface: 'ui' | 'rest' | 'quantai' | 'mcp' | 'cli';
  agentId?: string;
  delegationId?: string;
  scopes: string[];
  confirmedToolIds?: string[];
  idempotencyKey?: string;
  quantyTaskId?: string;
}

export const renderEffectsInputSchema = z.object({
  projectId: z.string().min(1),
  /** The .ecproj document (parsed JSON), produced by the companion's own
   *  surfaces (CLI exec / templates / MCP) — times are ticks; hand-written
   *  documents are rejected by the structural gate. */
  ecproj: z.record(z.string(), z.unknown()),
  comp: z.string().optional(),
  format: z.enum(CRAFT_RENDER_FORMATS).optional(),
  resolution: z.enum(CRAFT_RENDER_RESOLUTIONS).optional(),
  quality: z.enum(CRAFT_RENDER_QUALITIES).optional(),
  startSec: z.number().nonnegative().optional(),
  endSec: z.number().positive().optional(),
});

export const renderEffectsOutputSchema = z.object({
  job_id: z.string(),
  status: z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']),
  progress: z.number(),
  output_asset_id: z.string().nullable(),
  output_url: z.string().nullable(),
  credit_cost: z.number(),
  metering: z.literal('not_wired'),
  error: z.string().nullable(),
});

export type RenderEffectsInput = z.infer<typeof renderEffectsInputSchema>;
export type RenderEffectsOutput = z.infer<typeof renderEffectsOutputSchema>;

/** CP-1 §2.1 D1 definition shape (name/group/description/mode/schemas/
 *  pricing/permissionTier/execute). */
export interface CraftToolDefinition<I, O> {
  name: string;
  group: string;
  description: string;
  mode: 'sync' | 'async';
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  pricing: { rule: 'not_wired'; creditCost: number };
  permissionTier: 0 | 1 | 2 | 3;
  execute: (input: I, context: ToolContext) => Promise<O>;
}

export function jobToToolOutput(job: CraftRenderJob): RenderEffectsOutput {
  return {
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    output_asset_id: job.outputAssetId,
    output_url: job.outputUrl,
    credit_cost: job.creditCost,
    metering: job.metering,
    error: job.error,
  };
}

/**
 * Bind the definition to a live CraftRenderService. The executor refuses
 * with 503 CRAFT_NOT_CONFIGURED (naming the companion) when the companion is
 * unconfigured — the same error the REST surface answers (CP-1 §3.1: every
 * surface reads the same typed refusals).
 */
export function createRenderEffectsTool(service: CraftRenderService): CraftToolDefinition<
  RenderEffectsInput,
  RenderEffectsOutput
> {
  return {
    name: 'quantcooks.render_effects',
    group: 'craft',
    description:
      'Render an EffectCraft motion-graphics composition (.ecproj: animated titles, lower-thirds, step callouts, transitions) to a video file via the pinned companion renderer. Async: returns a CRAFT_RENDER job; poll the job for progress and the output asset id. The .ecproj document must come from the companion\'s own authoring surfaces (its times are ticks, not seconds). Fails closed with CRAFT_NOT_CONFIGURED when the companion is not installed on this deployment.',
    mode: 'async',
    inputSchema: renderEffectsInputSchema,
    outputSchema: renderEffectsOutputSchema,
    pricing: { rule: 'not_wired', creditCost: 0 },
    permissionTier: 2,
    execute: async (input, context) => {
      if (!context.actorUserId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }
      const job = await service.createRender({
        projectId: input.projectId,
        ecproj: input.ecproj,
        comp: input.comp,
        format: input.format,
        resolution: input.resolution,
        quality: input.quality,
        startSec: input.startSec,
        endSec: input.endSec,
        userId: context.actorUserId,
      });
      return jobToToolOutput(job);
    },
  };
}
