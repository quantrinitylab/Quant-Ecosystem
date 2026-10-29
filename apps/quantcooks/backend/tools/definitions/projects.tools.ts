// ============================================================================
// QuantCooks CP-1 — Group A: projects & timeline (tools 1–7, Tier A).
// Wraps services/project.service.ts + services/layer.service.ts.
//
// Landed-shape reconciliations (Step 0, recorded in the CP-1 report):
//  - create_project has NO canvas param: the landed CreateProjectInput is
//    { userId, name, type } — canvas lives in the P0-5 editor-state seam.
//  - update_project mirrors the landed UpdateProjectInput { name?, type? }
//    (the spec sketch's canvas/timeline belong to that same state seam and
//    to set_timeline below; they are not silently dropped params here).
//  - get_project follows the landed read semantics (P0-1/P0-5: any
//    authenticated caller may read a live project; writes are
//    owner-checked inside the services, whose error codes propagate
//    unchanged) and adds the layer list as the timeline summary.
// ============================================================================

import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { ToolDefinition, ToolRegistry } from '../registry';
import { LAYER_TYPES } from '../../services/layer.service';
import { out } from './shared';

const projectType = z.enum(['video', 'image', 'audio']);
const projectOut = out({ project: z.unknown() });

// ---------------------------------------------------------------------------
// set_timeline's composite (K8): one transaction replacing the project's
// full layer set. The input IS the complete set — entries with an `id`
// update that layer, entries without create, existing layers absent from
// the input are deleted, and an entry naming an unknown id is refused
// with REORDER_SET_MISMATCH (LayerService.reorderLayers' exact-full-set
// rule) BEFORE any write happens.
// ---------------------------------------------------------------------------

export const layerInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  type: z.enum(LAYER_TYPES),
  order: z.number().int().min(0).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  blendMode: z.string().optional(),
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
  content: z.unknown().optional(),
  transform: z.unknown().optional(),
  effects: z.unknown().optional(),
  keyframes: z.unknown().optional(),
  parentId: z.string().nullable().optional(),
});

export type LayerInput = z.infer<typeof layerInputSchema>;

interface TimelinePrisma {
  editProject: {
    findFirst: (args: Record<string, unknown>) => Promise<any>;
  };
  editLayer: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
  };
  $transaction?: <T>(fn: (tx: TimelinePrisma) => Promise<T>) => Promise<T>;
}

export async function setTimeline(
  prisma: TimelinePrisma,
  userId: string,
  projectId: string,
  layers: LayerInput[],
): Promise<Record<string, unknown>[]> {
  const project = (await prisma.editProject.findFirst({
    where: { id: projectId, deletedAt: null },
  })) as { id: string; userId: string } | null;
  if (!project) {
    throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }
  if (project.userId !== userId) {
    throw createAppError('Only the owner can modify this project', 403, 'NOT_PROJECT_OWNER');
  }

  const existing = (await prisma.editLayer.findMany({
    where: { projectId },
  })) as Record<string, unknown>[];
  const existingIds = new Set(existing.map((r) => r['id'] as string));
  const providedIds = layers.filter((l) => l.id).map((l) => l.id as string);
  if (
    new Set(providedIds).size !== providedIds.length ||
    providedIds.some((id) => !existingIds.has(id))
  ) {
    throw createAppError(
      'set_timeline replaces the full layer set: every supplied layer id must name an existing layer of this project exactly once (new layers omit id)',
      400,
      'REORDER_SET_MISMATCH',
    );
  }

  const run = async (tx: TimelinePrisma): Promise<Record<string, unknown>[]> => {
    const keep = new Set(providedIds);
    for (const row of existing) {
      if (!keep.has(row['id'] as string)) {
        await tx.editLayer.delete({ where: { id: row['id'] as string } });
      }
    }
    const outRows: Record<string, unknown>[] = [];
    for (const [index, layer] of layers.entries()) {
      const data: Record<string, unknown> = {
        projectId,
        name: layer.name,
        type: layer.type,
        order: layer.order ?? index,
        visible: layer.visible ?? true,
        locked: layer.locked ?? false,
        opacity: layer.opacity ?? 1,
        blendMode: layer.blendMode ?? 'normal',
        startTime: layer.startTime ?? 0,
        endTime: layer.endTime ?? 0,
        content: layer.content ?? {},
        transform: layer.transform ?? {},
        effects: layer.effects ?? [],
        keyframes: layer.keyframes ?? [],
        parentId: layer.parentId ?? null,
      };
      const row = layer.id
        ? await tx.editLayer.update({ where: { id: layer.id }, data })
        : await tx.editLayer.create({ data });
      outRows.push(row as Record<string, unknown>);
    }
    return outRows.sort(
      (a, b) => (a['order'] as number) - (b['order'] as number),
    );
  };

  if (typeof prisma.$transaction === 'function') {
    return prisma.$transaction(run);
  }
  return run(prisma);
}

// ---------------------------------------------------------------------------

export function registerProjectTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.list_projects',
    group: 'projects',
    description:
      "List the caller's QuantCooks projects (paginated, newest first). Use to find a project id before reading or editing it. Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    inputSchema: z.object({
      type: projectType.optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }),
    outputSchema: out({
      projects: z.array(z.unknown()),
      total: z.number(),
      page: z.number(),
      pageSize: z.number(),
    }),
    example: { input: {}, output: { projects: [], total: 0, page: 1, pageSize: 20 } },
    execute: async (input, ctx, deps) => {
      const result = await deps.projects.listProjects(ctx.actorUserId, {
        type: input.type,
        page: input.page,
        pageSize: input.pageSize,
      });
      return {
        projects: result.data,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    },
  });

  registry.register({
    name: 'quantcooks.create_project',
    group: 'projects',
    description:
      'Create a new empty QuantCooks project for the caller and return it. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({
      name: z.string().min(1).max(200),
      type: projectType.optional().default('video'),
    }),
    outputSchema: projectOut,
    example: { input: { name: 'Diwali Special' } },
    execute: async (input, ctx, deps) => {
      const project = await deps.projects.createProject({
        userId: ctx.actorUserId,
        name: input.name,
        type: input.type,
      });
      return { project };
    },
  });

  registry.register({
    name: 'quantcooks.get_project',
    group: 'projects',
    description:
      'Read one project by id, including its layer list (the timeline summary). Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    inputSchema: z.object({ projectId: z.string().min(1) }),
    outputSchema: out({ project: z.unknown(), layers: z.array(z.unknown()) }),
    example: { input: { projectId: 'proj_1' } },
    execute: async (input, ctx, deps) => {
      const project = await deps.projects.getProject(input.projectId);
      const layers = await deps.layers.listLayers(input.projectId);
      return { project, layers };
    },
  });

  registry.register({
    name: 'quantcooks.update_project',
    group: 'projects',
    description:
      "Rename a project or change its type. Owner only (the service enforces it). Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({
      projectId: z.string().min(1),
      name: z.string().min(1).max(200).optional(),
      type: projectType.optional(),
    }),
    outputSchema: projectOut,
    example: { input: { projectId: 'proj_1', name: 'New title' } },
    execute: async (input, ctx, deps) => {
      const project = await deps.projects.updateProject(input.projectId, ctx.actorUserId, {
        name: input.name,
        type: input.type,
      });
      return { project };
    },
  });

  registry.register({
    name: 'quantcooks.duplicate_project',
    group: 'projects',
    description:
      'Duplicate a project (the copy carries its editor state and layers, with new row ids). Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({ projectId: z.string().min(1) }),
    outputSchema: projectOut,
    example: { input: { projectId: 'proj_1' } },
    execute: async (input, ctx, deps) => {
      const project = await deps.projects.duplicateProject(input.projectId, ctx.actorUserId);
      return { project };
    },
  });

  registry.register({
    name: 'quantcooks.delete_project',
    group: 'projects',
    description:
      'Soft-delete a project (recoverable; there is no hard delete). Owner only. Tier-2: agent surfaces must confirm first. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 2,
    inputSchema: z.object({
      projectId: z.string().min(1),
      confirm: z.boolean().optional().default(true),
    }),
    outputSchema: projectOut,
    example: { input: { projectId: 'proj_1' } },
    execute: async (input, ctx, deps) => {
      const project = await deps.projects.deleteProject(input.projectId, ctx.actorUserId);
      return { project };
    },
  });

  registry.register({
    name: 'quantcooks.set_timeline',
    group: 'projects',
    description:
      "Replace a project's ENTIRE layer set in one transaction (agents plan in batches). Entries with an id update that layer, entries without id create, existing layers missing from the array are deleted; an unknown id refuses with REORDER_SET_MISMATCH before any write. Owner only. Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    inputSchema: z.object({
      projectId: z.string().min(1),
      layers: z.array(layerInputSchema),
    }),
    outputSchema: out({ layers: z.array(z.unknown()) }),
    example: {
      input: {
        projectId: 'proj_1',
        layers: [{ name: 'Hero shot', type: 'video', startTime: 0, endTime: 5 }],
      },
    },
    execute: async (input, ctx, deps) => {
      const layers = await setTimeline(
        deps.prisma as TimelinePrisma,
        ctx.actorUserId,
        input.projectId,
        input.layers,
      );
      return { layers };
    },
  });
}
