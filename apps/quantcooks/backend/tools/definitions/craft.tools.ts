// ============================================================================
// QuantCooks CP-1 — the ratified Craft twins (tools 55–56).
//
// C-2 and C-3B landed tool definitions in this exact shape under
// PROPOSED names, pending CP-1 ratification. CP-1 RATIFIES both names
// here — quantcooks.render_effects and quantcooks.edit_photo are now
// registered manifest tools, backed by the landed CraftRenderService /
// PhotoEditService executors (which fail closed with CRAFT_NOT_
// CONFIGURED / PHOTO_NOT_CONFIGURED when their companion binary is
// absent, and record creditCost 0 with metering 'not_wired' until CP-2
// prices their rate rows — pricing policy is Krish/CEO's, §14). The
// landed definition modules own the canonical zod schemas; this file
// reuses them rather than duplicating the shapes.
// ============================================================================

import type { ToolRegistry } from '../registry';
import type { ToolContext } from '../context';
import {
  createRenderEffectsTool,
  renderEffectsInputSchema,
  renderEffectsOutputSchema,
} from '../craft-render.tool';
import {
  createEditPhotoTool,
  editPhotoInputSchema,
  editPhotoOutputSchema,
} from '../photo-edit.tool';

export function registerCraftTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.render_effects',
    group: 'craft',
    description:
      'Render an EffectCraft motion-graphics composition (.ecproj: animated titles, lower-thirds, step callouts, transitions) to a video file via the pinned companion renderer. Async: returns a CRAFT_RENDER job; poll get_job_status for the output asset. The .ecproj document must come from the companion’s own authoring surfaces (its times are ticks, not seconds). Fails closed with CRAFT_NOT_CONFIGURED when the companion is not installed.',
    mode: 'async',
    tier: 'A',
    permissionTier: 2,
    availability: (deps) =>
      deps.craftRenders.craftConfigured
        ? { available: true }
        : { available: false, reason: 'CRAFT_NOT_CONFIGURED' },
    inputSchema: renderEffectsInputSchema,
    outputSchema: renderEffectsOutputSchema,
    example: {
      input: { projectId: 'proj_1', ecproj: { compositions: [] } },
    },
    execute: async (input, ctx, deps) => {
      const tool = createRenderEffectsTool(deps.craftRenders);
      return tool.execute(input as never, ctx as ToolContext);
    },
  });

  registry.register({
    name: 'quantcooks.edit_photo',
    group: 'craft',
    description:
      'Edit one of the caller’s images with the pinned PhotoCraft companion engine: an ordered list of allowlisted operations (resize, canvas size, crop, trim, rotate/flip, brightness/contrast, hue/saturation, exposure, vibrance, invert, desaturate, grayscale, gaussian blur, unsharp mask, sharpen) applied headlessly. Async: returns a PHOTO_EDIT job; the result lands as a NEW asset in the source’s project — the source is never mutated. Fails closed with PHOTO_NOT_CONFIGURED when the companion is not installed.',
    mode: 'async',
    tier: 'A',
    permissionTier: 2,
    availability: (deps) =>
      deps.photoEdits.photoConfigured
        ? { available: true }
        : { available: false, reason: 'PHOTO_NOT_CONFIGURED' },
    inputSchema: editPhotoInputSchema,
    outputSchema: editPhotoOutputSchema,
    example: {
      input: {
        sourceAssetId: 'asset_1',
        operations: [{ id: 'image.imageSize', params: { width: 800, height: 600 } }],
      },
    },
    execute: async (input, ctx, deps) => {
      const tool = createEditPhotoTool(deps.photoEdits);
      return tool.execute(input as never, ctx as ToolContext);
    },
  });
}
