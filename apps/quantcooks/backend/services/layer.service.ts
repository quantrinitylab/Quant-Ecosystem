// ============================================================================
// QuantEdits - Layer Service (Prisma-backed, P0-2)
// ============================================================================
//
// Layers are a project's timeline tracks. P0-1 added the EditLayer model but
// no service or route used it: the Next proxies for /projects/:id/layers*
// forwarded to a backend that had zero layer routes, so every layer call
// 404'd. This service implements the real semantics over EditLayer, in the
// same DI'd-narrow-prisma style as ProjectService (P0-1), so unit tests can
// inject a fake delegate and production injects fastify.prisma.
//
// Ownership follows the projects contract: reads require the project to
// exist (live, not soft-deleted); mutations are owner-only.

import { createAppError } from '@quant/server-core';

export const LAYER_TYPES = [
  'video',
  'audio',
  'image',
  'text',
  'shape',
  'effect',
  'overlay',
  'sticker',
] as const;

export type LayerType = (typeof LAYER_TYPES)[number];

export interface Layer {
  id: string;
  projectId: string;
  name: string;
  type: LayerType;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  startTime: number;
  endTime: number;
  content: unknown;
  transform: unknown;
  effects: unknown;
  keyframes: unknown;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateLayerInput {
  name: string;
  type: LayerType;
  content?: unknown;
  order?: number;
  visible?: boolean;
  opacity?: number;
  startTime?: number;
  endTime?: number;
  parentId?: string | null;
}

export interface UpdateLayerInput {
  name?: string;
  type?: LayerType;
  order?: number;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: string;
  startTime?: number;
  endTime?: number;
  content?: unknown;
  transform?: unknown;
  effects?: unknown;
  keyframes?: unknown;
  parentId?: string | null;
}

/** Narrow prisma surface this service needs (DI'd for unit-testability). */
export interface LayerPrisma {
  editProject: {
    findFirst: (args: Record<string, unknown>) => Promise<any>;
  };
  editLayer: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
  };
}

type LayerRow = Omit<Layer, 'type'> & { type: string };

export class LayerService {
  constructor(private readonly prisma: LayerPrisma) {}

  private toLayer(row: LayerRow): Layer {
    return { ...row, type: row.type as LayerType, parentId: row.parentId ?? null };
  }

  /** Fetch a live project row or throw PROJECT_NOT_FOUND. */
  private async findLiveProject(projectId: string): Promise<{ id: string; userId: string }> {
    const row = await this.prisma.editProject.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!row) {
      throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }
    return row as { id: string; userId: string };
  }

  /** Live project + caller must own it (mutations only). */
  private async findOwnedProject(projectId: string, userId: string) {
    const project = await this.findLiveProject(projectId);
    if (project.userId !== userId) {
      throw createAppError('Only the owner can modify this project', 403, 'NOT_PROJECT_OWNER');
    }
    return project;
  }

  private async findLayer(projectId: string, layerId: string): Promise<LayerRow> {
    const row = await this.prisma.editLayer.findFirst({
      where: { id: layerId, projectId },
    });
    if (!row) {
      throw createAppError('Layer not found', 404, 'LAYER_NOT_FOUND');
    }
    return row as LayerRow;
  }

  async listLayers(projectId: string): Promise<Layer[]> {
    await this.findLiveProject(projectId);
    const rows = await this.prisma.editLayer.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
    return rows.map((r) => this.toLayer(r as LayerRow));
  }

  async createLayer(projectId: string, userId: string, input: CreateLayerInput): Promise<Layer> {
    await this.findOwnedProject(projectId, userId);

    const order =
      input.order ?? (await this.prisma.editLayer.count({ where: { projectId } }));

    const row = await this.prisma.editLayer.create({
      data: {
        projectId,
        name: input.name,
        type: input.type,
        order,
        visible: input.visible ?? true,
        opacity: input.opacity ?? 1,
        startTime: input.startTime ?? 0,
        endTime: input.endTime ?? 0,
        content: input.content ?? {},
        parentId: input.parentId ?? null,
      },
    });

    return this.toLayer(row as LayerRow);
  }

  async updateLayer(
    projectId: string,
    layerId: string,
    userId: string,
    input: UpdateLayerInput,
  ): Promise<Layer> {
    await this.findOwnedProject(projectId, userId);
    await this.findLayer(projectId, layerId);

    const data: Record<string, unknown> = {};
    for (const key of [
      'name',
      'type',
      'order',
      'visible',
      'locked',
      'opacity',
      'blendMode',
      'startTime',
      'endTime',
      'content',
      'transform',
      'effects',
      'keyframes',
      'parentId',
    ] as const) {
      if (input[key] !== undefined) data[key] = input[key];
    }

    const row = await this.prisma.editLayer.update({ where: { id: layerId }, data });
    return this.toLayer(row as LayerRow);
  }

  async deleteLayer(projectId: string, layerId: string, userId: string): Promise<Layer> {
    await this.findOwnedProject(projectId, userId);
    const existing = await this.findLayer(projectId, layerId);

    await this.prisma.editLayer.delete({ where: { id: layerId } });
    return this.toLayer(existing);
  }

  async duplicateLayer(projectId: string, layerId: string, userId: string): Promise<Layer> {
    await this.findOwnedProject(projectId, userId);
    const original = await this.findLayer(projectId, layerId);

    const order = await this.prisma.editLayer.count({ where: { projectId } });
    const row = await this.prisma.editLayer.create({
      data: {
        projectId,
        name: `${original.name} (Copy)`,
        type: original.type,
        order,
        visible: original.visible,
        locked: original.locked,
        opacity: original.opacity,
        blendMode: original.blendMode,
        startTime: original.startTime,
        endTime: original.endTime,
        content: original.content ?? {},
        transform: original.transform ?? {},
        effects: original.effects ?? [],
        keyframes: original.keyframes ?? [],
        parentId: original.parentId ?? null,
      },
    });

    return this.toLayer(row as LayerRow);
  }

  /**
   * Reorder: layerIds must be exactly the project's current layer set —
   * a partial or foreign list is rejected rather than silently half-applied.
   * Each layer's order becomes its index in the list.
   */
  async reorderLayers(projectId: string, userId: string, layerIds: string[]): Promise<Layer[]> {
    await this.findOwnedProject(projectId, userId);

    const existing = await this.prisma.editLayer.findMany({ where: { projectId } });
    const existingIds = new Set(existing.map((r: LayerRow) => r.id));
    const requested = new Set(layerIds);

    if (
      requested.size !== layerIds.length ||
      requested.size !== existingIds.size ||
      ![...requested].every((id) => existingIds.has(id))
    ) {
      throw createAppError(
        'Reorder must list every layer of the project exactly once',
        400,
        'REORDER_SET_MISMATCH',
      );
    }

    const updated: Layer[] = [];
    for (const [index, layerId] of layerIds.entries()) {
      const row = await this.prisma.editLayer.update({
        where: { id: layerId },
        data: { order: index },
      });
      updated.push(this.toLayer(row as LayerRow));
    }
    return updated.sort((a, b) => a.order - b.order);
  }
}
