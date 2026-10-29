// ============================================================================
// QuantCooks CP-1 — Group C: catalogue, brand kits, collaboration
// (tools 13–22, Tier A). Wraps template / effects / brand-kit /
// collaboration services.
//
// Landed-shape reconciliations (Step 0):
//  - apply_template: the landed REST surface returns a ProjectDraft (the
//    template service deliberately does not persist). The tool's contract
//    (§3.3) is a real project, so the executor composes the landed pieces:
//    draft → ProjectService.createProject → the template's layers via the
//    set_timeline composite (kind map: text→text, media→video,
//    shape→shape, audio→audio; start/duration → startTime/endTime).
//  - invite_collaborator follows the landed route+service contract
//    ({ userId, role } with role ∈ ROLES) — the spec sketch's `email`
//    param does not exist in the landed product and is not invented here.
//  - add_comment's text field is `body` in the tool schema (spec) and
//    maps to the landed service's `content` field.
//  - apply_brand_kit returns the landed { applied, skipped } counts
//    alongside the spec's { elements, issues }.
// ============================================================================

import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { ToolRegistry } from '../registry';
import { out } from './shared';
import { setTimeline, type LayerInput } from './projects.tools';
import { TemplateNotFoundError } from '../../services/template.service';
import { ROLES } from '../../services/collaboration.service';
import type { BrandKitPatch, EditorElement } from '../../services/brand-kit.service';

const TEMPLATE_KIND_MAP: Record<string, LayerInput['type']> = {
  text: 'text',
  media: 'video',
  shape: 'shape',
  audio: 'audio',
};

const jsonObject = z.record(z.string(), z.unknown());

export function registerCatalogueTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.list_templates',
    group: 'catalogue',
    description:
      'List the template catalogue (optionally by category or search text). Templates are starting points for new projects. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    publicCatalogue: true,
    inputSchema: z.object({
      category: z.enum(['social', 'youtube', 'marketing', 'story', 'post']).optional(),
      search: z.string().max(200).optional(),
    }),
    outputSchema: out({ templates: z.array(z.unknown()) }),
    example: { input: {}, output: { templates: [] } },
    execute: async (input, ctx, deps) => {
      const templates = deps.templates.listTemplates(input.category, input.search);
      return { templates };
    },
  });

  registry.register({
    name: 'quantcooks.apply_template',
    group: 'catalogue',
    description:
      'Create a real project from a template (metadata + canvas from the template, its layers placed on the timeline). Returns the created project. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({
      templateId: z.string().min(1),
      name: z.string().min(1).max(200).optional(),
    }),
    outputSchema: out({ project: z.unknown() }),
    example: { input: { templateId: 'reel-vertical' } },
    execute: async (input, ctx, deps) => {
      let draft;
      try {
        draft = deps.templates.applyTemplate(input.templateId, { name: input.name });
      } catch (err) {
        if (err instanceof TemplateNotFoundError) {
          throw createAppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
        }
        throw err;
      }
      const project = await deps.projects.createProject({
        userId: ctx.actorUserId,
        name: draft.name,
        type: draft.type,
      });
      if (draft.layers.length > 0) {
        const layers: LayerInput[] = draft.layers.map((layer, index) => ({
          name: layer.name,
          type: TEMPLATE_KIND_MAP[layer.kind] ?? 'video',
          order: index,
          startTime: layer.start,
          endTime: layer.start + layer.duration,
          content: {},
        }));
        await setTimeline(deps.prisma, ctx.actorUserId, project.id, layers);
      }
      return { project };
    },
  });

  registry.register({
    name: 'quantcooks.list_presets',
    group: 'catalogue',
    description:
      'Composite discovery: list presets as data (templates + effects today; style presets join when they exist as data). Presets come from listable data, never hard-coded UI constants. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    publicCatalogue: true,
    inputSchema: z.object({
      kind: z.enum(['template', 'effect', 'style', 'all']).optional().default('all'),
      category: z.string().optional(),
      search: z.string().optional(),
    }),
    outputSchema: out({ presets: z.array(z.unknown()) }),
    example: { input: {}, output: { presets: [] } },
    execute: async (input, ctx, deps) => {
      const presets: Record<string, unknown>[] = [];
      if (input.kind === 'all' || input.kind === 'template') {
        for (const t of deps.templates.listTemplates(undefined, input.search)) {
          if (input.category && t.category !== input.category) continue;
          presets.push({
            id: t.id,
            kind: 'template',
            name: t.name,
            description: t.description,
            category: t.category,
          });
        }
      }
      if (input.kind === 'all' || input.kind === 'effect') {
        for (const e of deps.effects.listEffects({ search: input.search })) {
          if (input.category && e.category !== input.category) continue;
          presets.push({
            id: e.id,
            kind: 'effect',
            name: e.name,
            description: e.description ?? '',
            category: e.category,
          });
        }
      }
      return { presets };
    },
  });

  registry.register({
    name: 'quantcooks.list_effects',
    group: 'catalogue',
    description:
      'List the effects catalogue (transitions, filters, overlays, text, sound), optionally by category. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    publicCatalogue: true,
    inputSchema: z.object({
      category: z.enum(['transitions', 'filters', 'overlays', 'text', 'sound']).optional(),
    }),
    outputSchema: out({ effects: z.array(z.unknown()) }),
    example: { input: {}, output: { effects: [] } },
    execute: async (input, ctx, deps) => {
      const effects = deps.effects.listEffects({ category: input.category });
      return { effects };
    },
  });

  registry.register({
    name: 'quantcooks.get_brand_kit',
    group: 'catalogue',
    description: "Read one of the caller's brand kits by id (owner-scoped). Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    inputSchema: z.object({ brandKitId: z.string().min(1) }),
    outputSchema: out({ brandKit: z.unknown() }),
    example: { input: { brandKitId: 'kit_1' } },
    execute: async (input, ctx, deps) => {
      const brandKit = await deps.brandKits.getKit(ctx.actorUserId, input.brandKitId);
      return { brandKit };
    },
  });

  registry.register({
    name: 'quantcooks.update_brand_kit',
    group: 'catalogue',
    description: "Patch one of the caller's brand kits (name, default flag, colours, fonts, logos). Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({
      brandKitId: z.string().min(1),
      patch: z
        .object({
          name: z.string().optional(),
          isDefault: z.boolean().optional(),
          colors: jsonObject.optional(),
          fonts: jsonObject.optional(),
          logos: z.array(jsonObject).optional(),
        })
        .passthrough(),
    }),
    outputSchema: out({ brandKit: z.unknown() }),
    example: { input: { brandKitId: 'kit_1', patch: { name: 'Diwali kit' } } },
    execute: async (input, ctx, deps) => {
      const brandKit = await deps.brandKits.updateKit(
        ctx.actorUserId,
        input.brandKitId,
        input.patch as BrandKitPatch,
      );
      return { brandKit };
    },
  });

  registry.register({
    name: 'quantcooks.apply_brand_kit',
    group: 'catalogue',
    description:
      "Apply one of the caller's brand kits to a list of editor elements and report consistency issues in the same call: returns the re-branded elements, the issues, and the applied/skipped counts. Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({
      brandKitId: z.string().min(1),
      elements: z.array(jsonObject),
    }),
    outputSchema: out({
      elements: z.array(z.unknown()),
      issues: z.array(z.unknown()),
      applied: z.number(),
      skipped: z.number(),
    }),
    example: { input: { brandKitId: 'kit_1', elements: [] }, output: { elements: [], issues: [], applied: 0, skipped: 0 } },
    execute: async (input, ctx, deps) => {
      const kit = await deps.brandKits.getKit(ctx.actorUserId, input.brandKitId);
      const elements = input.elements as unknown as EditorElement[];
      const applied = deps.brandKits.applyToElements(kit, elements);
      const issues = deps.brandKits.checkConsistency(kit, elements);
      return {
        elements: applied.elements,
        issues,
        applied: applied.applied,
        skipped: applied.skipped,
      };
    },
  });

  registry.register({
    name: 'quantcooks.list_collaborators',
    group: 'catalogue',
    description:
      'List a project’s collaborators. The caller must be a project member (the service enforces it). Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    inputSchema: z.object({ projectId: z.string().min(1) }),
    outputSchema: out({ members: z.array(z.unknown()) }),
    example: { input: { projectId: 'proj_1' }, output: { members: [] } },
    execute: async (input, ctx, deps) => {
      const members = await deps.collaboration.listMembers(input.projectId, ctx.actorUserId);
      return { members };
    },
  });

  registry.register({
    name: 'quantcooks.invite_collaborator',
    group: 'catalogue',
    description:
      'Invite a user to a project by their user id with a role. Caller must be the project owner or an editor (the service enforces it). Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({
      projectId: z.string().min(1),
      userId: z.string().min(1),
      role: z.enum(ROLES as unknown as [string, ...string[]]),
    }),
    outputSchema: out({ member: z.unknown() }),
    example: { input: { projectId: 'proj_1', userId: 'user_2', role: 'editor' } },
    execute: async (input, ctx, deps) => {
      const member = await deps.collaboration.inviteCollaborator(
        input.projectId,
        ctx.actorUserId,
        { userId: input.userId, role: input.role },
      );
      return { member };
    },
  });

  registry.register({
    name: 'quantcooks.add_comment',
    group: 'catalogue',
    description:
      'Add a comment to a project (optionally pinned to a layer / position). Caller must be a project member with comment rights (the service enforces it). Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({
      projectId: z.string().min(1),
      body: z.string().min(1).max(5000),
      layerId: z.string().optional(),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
    }),
    outputSchema: out({ comment: z.unknown() }),
    example: { input: { projectId: 'proj_1', body: 'Tighten the opening cut' } },
    execute: async (input, ctx, deps) => {
      const comment = await deps.collaboration.addComment(input.projectId, ctx.actorUserId, {
        content: input.body,
        layerId: input.layerId,
        position: input.position,
      });
      return { comment };
    },
  });
}
