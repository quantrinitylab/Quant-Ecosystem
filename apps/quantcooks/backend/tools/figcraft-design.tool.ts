// ============================================================================
// QuantCooks - quantcooks.create_design / quantcooks.export_design
// (C-7 step 4 tool DEFINITIONS + executors)
// ============================================================================
//
// The QuantAI twins of the FigCraft companion design surface, in the
// exact shape C-2/C-3B landed and CP-1 ratified for
// quantcooks.render_effects / quantcooks.edit_photo (definitions with
// schemas + executor + pricing + permission tier). CP-1 registers them
// as AMENDMENTS via backend/tools/definitions/design.tools.ts — the
// registry count moves 56 -> 58 truthfully with this unit.
//
// What the twins drive is the DOCUMENT, never the embedded editor: the
// C-7 spike proved the FigCraft web build has no agent surface at all
// (§2.1), so create/export run headlessly against .figcraft document
// assets through the companion CLI (backend/services/figcraft.adapter
// .ts). The embedded editor stays a human surface.
//
// quantcooks.inspect_design_code is deliberately NOT defined or
// registered here: the spike (§6) proved the engine's Dev-Mode code
// inspection exists and is agent-callable, but its output quality on
// real screens is UNEVALUATED — registration waits for the C-7 step-5
// quality gate. Named here so the omission is a decision, not a gap.
//
// Pricing (CP-1 §6.3): no DESIGN rate row exists yet — pricing policy
// is reserved to Krish/CEO (§14 open decision 1). The definitions
// therefore declare `metering: 'not_wired'` with a 0-credit quote, the
// exact pre-CP-2 surface C-2/C-3B pinned. The matching RATE_TABLE rows
// ('quantcooks.create_design' / 'quantcooks.export_design' ->
// { type: 'not_wired' }) are a named follow-up for the CP-2 unit, which
// owns the rate table: until they land, registry quote() prices these
// tools with the default free 0-credit quote while every invoke output
// and job record states metering 'not_wired' — no number is ever
// presented as a charge the ledger never made. permissionTier is
// already 2 (Confirm) per §7.4, matching the ratified twins, because
// this is a credit-spending class of invoke once priced.
// ============================================================================

import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { DesignService, DesignJob } from '../services/design.service';
import { FIGCRAFT_TEMPLATES, DESIGN_EXPORT_FORMATS } from '../services/figcraft.adapter';
import type { ToolContext, CraftToolDefinition } from './craft-render.tool';

const statusEnum = z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']);

// ---------------------------------------------------------------------------
// create_design
// ---------------------------------------------------------------------------

export const createDesignInputSchema = z.object({
  /** The caller's project the new design document lands in. */
  projectId: z.string().min(1),
  /** A starter template id from the pinned engine's own set
   *  (template.list). Omit for a blank design. */
  template: z.enum(FIGCRAFT_TEMPLATES).optional(),
  /** The document's name (also its asset filename stem). */
  name: z.string().min(1).max(120).optional(),
});

export const createDesignOutputSchema = z.object({
  job_id: z.string(),
  status: statusEnum,
  progress: z.number(),
  project_id: z.string().nullable(),
  output_asset_id: z.string().nullable(),
  output_url: z.string().nullable(),
  credit_cost: z.number(),
  metering: z.literal('not_wired'),
  error: z.string().nullable(),
});

export type CreateDesignInput = z.infer<typeof createDesignInputSchema>;
export type CreateDesignOutput = z.infer<typeof createDesignOutputSchema>;

// ---------------------------------------------------------------------------
// export_design
// ---------------------------------------------------------------------------

export const exportDesignInputSchema = z.object({
  /** The caller's READY design-document (.figcraft) asset to export.
   *  Exports land as NEW assets in the same project; the source is
   *  never mutated. */
  sourceAssetId: z.string().min(1),
  /** png | svg | pdf (default png). */
  format: z.enum(DESIGN_EXPORT_FORMATS).optional(),
  /** Export a single frame (node name or id) as one file. Omit to
   *  export every top-level frame (one asset per frame; PDF always
   *  lands as one multi-page document). */
  frame: z.string().min(1).optional(),
  /** Restrict the export to one page by name. */
  page: z.string().min(1).optional(),
  /** Render scale (> 0, <= 4). */
  scale: z.number().positive().max(4).optional(),
});

export const exportDesignOutputSchema = z.object({
  job_id: z.string(),
  status: statusEnum,
  progress: z.number(),
  source_asset_id: z.string(),
  output_asset_id: z.string().nullable(),
  output_asset_ids: z.array(z.string()),
  output_urls: z.array(z.string().nullable()),
  credit_cost: z.number(),
  metering: z.literal('not_wired'),
  error: z.string().nullable(),
});

export type ExportDesignInput = z.infer<typeof exportDesignInputSchema>;
export type ExportDesignOutput = z.infer<typeof exportDesignOutputSchema>;

// ---------------------------------------------------------------------------
// Output mapping + tool factories
// ---------------------------------------------------------------------------

export function createDesignJobToOutput(job: DesignJob): CreateDesignOutput {
  return {
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    project_id: job.projectId,
    output_asset_id: job.outputAssetId,
    output_url: job.outputUrl,
    credit_cost: job.creditCost,
    metering: job.metering,
    error: job.error,
  };
}

export function exportDesignJobToOutput(job: DesignJob): ExportDesignOutput {
  return {
    job_id: job.id,
    status: job.status,
    progress: job.progress,
    source_asset_id: job.sourceAssetId ?? '',
    output_asset_id: job.outputAssetId,
    output_asset_ids: job.outputAssetIds,
    output_urls: job.outputUrls,
    credit_cost: job.creditCost,
    metering: job.metering,
    error: job.error,
  };
}

/**
 * Bind create_design to a live DesignService. The executor refuses
 * with 503 FIGCRAFT_NOT_CONFIGURED (naming the companion) when the
 * companion is unconfigured — the same typed refusal every surface
 * reads (CP-1 §3.1).
 */
export function createCreateDesignTool(
  service: DesignService,
): CraftToolDefinition<CreateDesignInput, CreateDesignOutput> {
  return {
    name: 'quantcooks.create_design',
    group: 'design',
    description:
      'Create a UI design document headlessly with the pinned FigCraft companion engine: a new document from one of the engine\'s starter templates (mobile-app, landing-page, dashboard, design-system, wireframe-kit, social-posts, slides, icon-set) or blank, authored by the engine itself and saved in its native .figcraft format. Async: returns a DESIGN job; the document lands as a real asset in the caller\'s project, openable in Design Studio. Fails closed with FIGCRAFT_NOT_CONFIGURED when the companion is not installed on this deployment.',
    mode: 'async',
    inputSchema: createDesignInputSchema,
    outputSchema: createDesignOutputSchema,
    pricing: { rule: 'not_wired', creditCost: 0 },
    permissionTier: 2,
    execute: async (input, context) => {
      if (!context.actorUserId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }
      const job = await service.createDesign({
        projectId: input.projectId,
        template: input.template,
        name: input.name,
        userId: context.actorUserId,
        ...(context.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : {}),
      });
      return createDesignJobToOutput(job);
    },
  };
}

/**
 * Bind export_design to a live DesignService. The executor refuses
 * with 503 FIGCRAFT_NOT_CONFIGURED when the companion is unconfigured,
 * and the service's source guards (404/400) fire before any job row.
 */
export function createExportDesignTool(
  service: DesignService,
): CraftToolDefinition<ExportDesignInput, ExportDesignOutput> {
  return {
    name: 'quantcooks.export_design',
    group: 'design',
    description:
      'Export one of the caller\'s design documents (.figcraft assets) to PNG, SVG or PDF with the pinned FigCraft companion engine. Async: returns a DESIGN job; with a frame named (or format pdf) the export lands as ONE new asset, otherwise one new asset per top-level frame — always in the source\'s project, and the source is never mutated. Fails closed with FIGCRAFT_NOT_CONFIGURED when the companion is not installed on this deployment.',
    mode: 'async',
    inputSchema: exportDesignInputSchema,
    outputSchema: exportDesignOutputSchema,
    pricing: { rule: 'not_wired', creditCost: 0 },
    permissionTier: 2,
    execute: async (input, context) => {
      if (!context.actorUserId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }
      const job = await service.exportDesign({
        sourceAssetId: input.sourceAssetId,
        format: input.format,
        frame: input.frame,
        page: input.page,
        scale: input.scale,
        userId: context.actorUserId,
        ...(context.idempotencyKey ? { idempotencyKey: context.idempotencyKey } : {}),
      });
      return exportDesignJobToOutput(job);
    },
  };
}
