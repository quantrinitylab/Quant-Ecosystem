// ============================================================================
// QuantCooks CP-1 AMENDMENT (C-7 step 4) — the Design Studio twins
// (tools 57–58).
//
// C-7 steps 1–3 landed the human Design Studio surface (the FigCraft
// web embed); the C-7 spike proved that build has no agent surface, so
// QuantAI control rides the companion headless CLI — the pattern C-2
// (render_effects) and C-3B (edit_photo) established and CP-1 ratified.
// This amendment registers the design pair in the same shape:
//
//   quantcooks.create_design — headless document creation from the
//     engine's own templates/run mechanism (never hand-written JSON)
//   quantcooks.export_design — PNG/SVG/PDF export of a design asset
//
// Both are Tier A live executors backed by DesignService (jobs on the
// unified EditJob table, kind DESIGN), failing closed with
// FIGCRAFT_NOT_CONFIGURED when the companion binary is absent, and
// recording creditCost 0 with metering 'not_wired' until CP-2 prices
// their rate rows (pricing policy is Krish/CEO's, §14 — the RATE_TABLE
// rows themselves are CP-2's file and are a named follow-up; see
// figcraft-design.tool.ts).
//
// quantcooks.inspect_design_code is NOT registered: it waits for the
// C-7 step-5 code-inspection quality gate (spike §6).
// ============================================================================

import type { ToolRegistry } from '../registry';
import type { ToolContext } from '../context';
import {
  createCreateDesignTool,
  createExportDesignTool,
  createDesignInputSchema,
  createDesignOutputSchema,
  exportDesignInputSchema,
  exportDesignOutputSchema,
} from '../figcraft-design.tool';

export function registerDesignTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.create_design',
    group: 'design',
    description:
      'Create a UI design document headlessly with the pinned FigCraft companion engine: a new document from one of the engine’s starter templates (mobile-app, landing-page, dashboard, design-system, wireframe-kit, social-posts, slides, icon-set) or blank, authored by the engine itself and saved in its native .figcraft format. Async: returns a DESIGN job; poll get_job_status for the document asset. Fails closed with FIGCRAFT_NOT_CONFIGURED when the companion is not installed.',
    mode: 'async',
    tier: 'A',
    permissionTier: 2,
    availability: (deps) =>
      deps.design.designConfigured
        ? { available: true }
        : { available: false, reason: 'FIGCRAFT_NOT_CONFIGURED' },
    inputSchema: createDesignInputSchema,
    outputSchema: createDesignOutputSchema,
    example: {
      input: { projectId: 'proj_1', template: 'mobile-app', name: 'Dish App' },
    },
    execute: async (input, ctx, deps) => {
      const tool = createCreateDesignTool(deps.design);
      return tool.execute(input as never, ctx as ToolContext);
    },
  });

  registry.register({
    name: 'quantcooks.export_design',
    group: 'design',
    description:
      'Export one of the caller’s design documents (.figcraft assets) to PNG, SVG or PDF with the pinned FigCraft companion engine. Async: returns a DESIGN job; with a frame named (or format pdf) the export lands as ONE new asset, otherwise one new asset per top-level frame — always in the source’s project, and the source is never mutated. Fails closed with FIGCRAFT_NOT_CONFIGURED when the companion is not installed.',
    mode: 'async',
    tier: 'A',
    permissionTier: 2,
    availability: (deps) =>
      deps.design.designConfigured
        ? { available: true }
        : { available: false, reason: 'FIGCRAFT_NOT_CONFIGURED' },
    inputSchema: exportDesignInputSchema,
    outputSchema: exportDesignOutputSchema,
    example: {
      input: { sourceAssetId: 'asset_1', format: 'png' },
    },
    execute: async (input, ctx, deps) => {
      const tool = createExportDesignTool(deps.design);
      return tool.execute(input as never, ctx as ToolContext);
    },
  });
}
