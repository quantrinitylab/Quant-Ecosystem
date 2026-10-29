// ============================================================================
// QuantEdits - Project Service (Prisma-backed, P0-1)
// ============================================================================
//
// The central entity service. This class used to keep projects in a private
// in-memory array while backend/routes/projects.ts called a non-existent
// `prisma.editProject` model — so the tested implementation was dead code and
// the wired one always threw. It is now backed by the real EditProject model
// (packages/database/prisma/schema.prisma) through a DI'd narrow prisma
// surface, the same pattern BrandKitService uses, so unit tests can inject a
// fake delegate and production injects fastify.prisma. Projects now survive
// a backend restart; soft delete via `deletedAt` preserves the semantics the
// original test suite specified.

import { createAppError } from '@quant/server-core';

export interface Project {
  id: string;
  userId: string;
  name: string;
  type: 'video' | 'image' | 'audio';
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CreateProjectInput {
  userId: string;
  name: string;
  type: 'video' | 'image' | 'audio';
}

export interface UpdateProjectInput {
  name?: string;
  type?: 'video' | 'image' | 'audio';
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  /** Optional project-type filter (P0-2: the client always sent it; the wire dropped it). */
  type?: Project['type'];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Narrow prisma surface this service needs (DI'd for unit-testability). */
export interface ProjectPrisma {
  editProject: {
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    findFirst: (args: Record<string, unknown>) => Promise<any>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  /**
   * Layer delegate — required only by the P0-5 state methods (the derived
   * EditLayer projection) and the duplicate fix. Optional in the type so
   * the metadata-only consumers/tests that inject a project-only fake keep
   * compiling; the state methods throw a clear error if it is absent
   * rather than silently skipping the projection.
   */
  editLayer?: {
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
    update: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<any>;
    delete: (args: { where: Record<string, unknown> }) => Promise<any>;
  };
  $transaction?: <T>(fn: (tx: ProjectPrisma) => Promise<T>) => Promise<T>;
}

type ProjectRow = {
  id: string;
  userId: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  timeline?: unknown;
  version?: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

// ---------------------------------------------------------------------------
// Editor state (P0-5). The persisted document is the editor's own
// Track/Clip document, stored verbatim in EditProject.timeline; EditLayer
// rows are a DERIVED PROJECTION of it (design decisions D5-1/D5-2 in the
// P0-5 spec). The backend treats track/clip internals as opaque Json beyond
// the projection extraction below.
// ---------------------------------------------------------------------------

export const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:5', '4:3'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const CANVAS_BY_ASPECT: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '4:3': { width: 1440, height: 1080 },
};

export interface EditorDocument {
  schemaVersion: 1;
  tracks: unknown[];
  duration: number;
  aspectRatio: AspectRatio;
}

export interface ProjectState {
  id: string;
  name: string;
  type: Project['type'];
  width: number;
  height: number;
  fps: number;
  /** Document duration (synthesis rule applied), not the raw column. */
  duration: number;
  version: number;
  updatedAt: Date;
  timeline: EditorDocument;
}

export interface SaveProjectStateInput {
  version: number;
  timeline: EditorDocument;
}

function isAspectRatio(value: unknown): value is AspectRatio {
  return typeof value === 'string' && (ASPECT_RATIOS as readonly string[]).includes(value);
}

function aspectFromDimensions(width: number, height: number): AspectRatio {
  for (const ratio of ASPECT_RATIOS) {
    const canvas = CANVAS_BY_ASPECT[ratio];
    if (canvas.width === width && canvas.height === height) return ratio;
  }
  return '16:9';
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

interface LooseClip {
  id?: unknown;
  trackId?: unknown;
  name?: unknown;
  type?: unknown;
  startTime?: unknown;
  duration?: unknown;
  trimStart?: unknown;
  trimEnd?: unknown;
  volume?: unknown;
  opacity?: unknown;
  filters?: unknown;
  position?: unknown;
  scale?: unknown;
  rotation?: unknown;
  assetId?: unknown;
}

interface LooseTrack {
  id?: unknown;
  locked?: unknown;
  visible?: unknown;
  clips?: unknown;
}

interface LayerProjection {
  clipId: string;
  data: Record<string, unknown>;
}

const CLIP_TYPES = ['video', 'audio', 'text', 'effect'] as const;

/**
 * Build the EditLayer projection rows for a document (spec §2.2). Clips
 * without a string id cannot be keyed for upsert and are skipped (the
 * document itself is still stored verbatim). `content.assetId` is written
 * exactly as P0-4's render-source resolution (D4-3) reads it: a top-level
 * string field on the layer's content Json. Signed URLs (Clip.thumbnail)
 * are NEVER copied into the projection or anywhere else persisted (D5-6).
 */
function buildLayerProjection(projectId: string, tracks: unknown[]): LayerProjection[] {
  const rows: LayerProjection[] = [];
  let order = 0;

  for (const rawTrack of tracks) {
    const track = (rawTrack ?? {}) as LooseTrack;
    const clips = Array.isArray(track.clips) ? track.clips : [];
    const visible = typeof track.visible === 'boolean' ? track.visible : true;
    const locked = typeof track.locked === 'boolean' ? track.locked : false;

    for (const rawClip of clips) {
      const clip = (rawClip ?? {}) as LooseClip;
      if (typeof clip.id !== 'string' || clip.id.length === 0) continue;

      const startTime = finiteNumber(clip.startTime, 0);
      const duration = finiteNumber(clip.duration, 0);
      const type =
        typeof clip.type === 'string' && (CLIP_TYPES as readonly string[]).includes(clip.type)
          ? clip.type
          : 'video';

      const content: Record<string, unknown> = {
        clipId: clip.id,
        trackId:
          typeof clip.trackId === 'string'
            ? clip.trackId
            : typeof track.id === 'string'
              ? track.id
              : '',
        trimStart: finiteNumber(clip.trimStart, 0),
        trimEnd: finiteNumber(clip.trimEnd, 0),
        volume: finiteNumber(clip.volume, 1),
        filters:
          clip.filters && typeof clip.filters === 'object'
            ? clip.filters
            : { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0 },
      };
      // The field P0-4 D4-3 reads — present exactly when the clip has one.
      if (typeof clip.assetId === 'string' && clip.assetId.length > 0) {
        content['assetId'] = clip.assetId;
      }

      rows.push({
        clipId: clip.id,
        data: {
          projectId,
          name: typeof clip.name === 'string' ? clip.name : 'Clip',
          type,
          order: order++,
          visible,
          locked,
          opacity: finiteNumber(clip.opacity, 1),
          blendMode: 'normal',
          startTime,
          endTime: startTime + duration,
          content,
          transform: {
            position:
              clip.position && typeof clip.position === 'object'
                ? clip.position
                : { x: 0, y: 0 },
            scale: clip.scale && typeof clip.scale === 'object' ? clip.scale : { x: 1, y: 1 },
            rotation: finiteNumber(clip.rotation, 0),
          },
          effects: [],
          keyframes: [],
          parentId: null,
        },
      });
    }
  }

  return rows;
}

function clipIdOf(content: unknown): string | null {
  if (content && typeof content === 'object') {
    const clipId = (content as Record<string, unknown>)['clipId'];
    if (typeof clipId === 'string' && clipId.length > 0) return clipId;
  }
  return null;
}

export class ProjectService {
  constructor(private readonly prisma: ProjectPrisma) {}

  private toProject(row: ProjectRow): Project {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      type: row.type as Project['type'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deletedAt: row.deletedAt ?? null,
    };
  }

  /**
   * Map a full row to the editor-state shape (P0-5). Kept separate from
   * toProject() so the P0-1/P0-2 metadata shapes don't change under their
   * existing consumers. Applies the empty-document synthesis rule (spec
   * §2.2/C11): a project whose timeline is `{}` or lacks tracks opens with
   * an empty document whose duration falls back to the column value when
   * > 0, else the editor's 120s ruler default, and whose aspectRatio is
   * derived from the canvas columns when they match the table.
   */
  private toProjectState(row: ProjectRow): ProjectState {
    const width = row.width ?? 1920;
    const height = row.height ?? 1080;
    const raw =
      row.timeline && typeof row.timeline === 'object'
        ? (row.timeline as Record<string, unknown>)
        : {};
    const hasTracks = Array.isArray(raw['tracks']);
    const tracks = hasTracks ? (raw['tracks'] as unknown[]) : [];

    const duration = hasTracks
      ? finiteNumber(raw['duration'], row.duration && row.duration > 0 ? row.duration : 120)
      : row.duration && row.duration > 0
        ? row.duration
        : 120;
    const aspectRatio = hasTracks
      ? isAspectRatio(raw['aspectRatio'])
        ? raw['aspectRatio']
        : aspectFromDimensions(width, height)
      : aspectFromDimensions(width, height);

    return {
      id: row.id,
      name: row.name,
      type: row.type as Project['type'],
      width,
      height,
      fps: row.fps ?? 30,
      duration,
      version: row.version ?? 1,
      updatedAt: row.updatedAt,
      timeline: { schemaVersion: 1, tracks, duration, aspectRatio },
    };
  }

  /** Fetch a live (not soft-deleted) project row or throw PROJECT_NOT_FOUND. */
  private async findLiveProject(projectId: string): Promise<ProjectRow> {
    const row = await this.prisma.editProject.findFirst({
      where: { id: projectId, deletedAt: null },
    });

    if (!row) {
      throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
    }

    return row as ProjectRow;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const row = await this.prisma.editProject.create({
      data: {
        userId: input.userId,
        name: input.name,
        type: input.type,
      },
    });

    return this.toProject(row as ProjectRow);
  }

  async getProject(projectId: string): Promise<Project> {
    return this.toProject(await this.findLiveProject(projectId));
  }

  async listProjects(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<Project>> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const where: Record<string, unknown> = { userId, deletedAt: null };
    if (options.type) where['type'] = options.type;

    const total = await this.prisma.editProject.count({ where });
    const rows = await this.prisma.editProject.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const totalPages = Math.ceil(total / pageSize);

    return {
      data: rows.map((r) => this.toProject(r as ProjectRow)),
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  async updateProject(
    projectId: string,
    userId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    const project = await this.findLiveProject(projectId);

    if (project.userId !== userId) {
      throw createAppError('Only the owner can update this project', 403, 'NOT_PROJECT_OWNER');
    }

    const data: Record<string, unknown> = {};
    if (input.name) data['name'] = input.name;
    if (input.type) data['type'] = input.type;

    const row = await this.prisma.editProject.update({
      where: { id: projectId },
      data,
    });

    return this.toProject(row as ProjectRow);
  }

  async deleteProject(projectId: string, userId: string): Promise<Project> {
    const project = await this.findLiveProject(projectId);

    if (project.userId !== userId) {
      throw createAppError('Only the owner can delete this project', 403, 'NOT_PROJECT_OWNER');
    }

    const row = await this.prisma.editProject.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });

    return this.toProject(row as ProjectRow);
  }

  async duplicateProject(projectId: string, userId: string): Promise<Project> {
    const original = await this.findLiveProject(projectId);

    // P0-5 duplicate fix (spec C1): the copy must carry the editor state —
    // canvas, duration and the timeline document — plus its layer
    // projection (with NEW row ids; the clipIds inside content are document
    // identities and are preserved). Before this, a duplicated project
    // silently opened empty.
    const row = await this.prisma.editProject.create({
      data: {
        userId,
        name: `${original.name} (Copy)`,
        type: original.type,
        width: original.width ?? 1920,
        height: original.height ?? 1080,
        fps: original.fps ?? 30,
        duration: original.duration ?? 0,
        timeline: original.timeline ?? {},
        version: 1,
      },
    });

    if (this.prisma.editLayer) {
      const layers = await this.prisma.editLayer.findMany({
        where: { projectId },
        orderBy: { order: 'asc' },
      });
      for (const layer of layers as Record<string, unknown>[]) {
        await this.prisma.editLayer.create({
          data: {
            projectId: row.id,
            name: layer['name'],
            type: layer['type'],
            order: layer['order'],
            visible: layer['visible'],
            locked: layer['locked'],
            opacity: layer['opacity'],
            blendMode: layer['blendMode'],
            startTime: layer['startTime'],
            endTime: layer['endTime'],
            content: layer['content'],
            transform: layer['transform'],
            effects: layer['effects'],
            keyframes: layer['keyframes'],
            parentId: layer['parentId'] ?? null,
          },
        });
      }
    }

    return this.toProject(row as ProjectRow);
  }

  // -------------------------------------------------------------------------
  // Editor state endpoints (P0-5, spec §2.3)
  // -------------------------------------------------------------------------

  /** Read the full editor state for a project (any authenticated caller,
   * matching GET /projects/:id's auth-not-ownership read semantics). */
  async getProjectState(projectId: string): Promise<ProjectState> {
    return this.toProjectState(await this.findLiveProject(projectId));
  }

  /**
   * Atomically save the editor document (owner-only). The version gate is
   * a single conditional updateMany — there is no read-check-write in this
   * path (spec C10/D5-3). Zero rows updated means the version moved (409
   * VERSION_CONFLICT carrying currentVersion in the error details, which
   * server-core's error handler serialises) or the project vanished (404).
   * The EditLayer projection is rebuilt by upsert-by-clipId inside the
   * same transaction (D5-2): rows for clips in the document are updated in
   * place (ids stay stable), new clips create rows, and every other row
   * for the project — removed clips and rows created directly through the
   * layers API — is deleted.
   */
  async saveProjectState(
    projectId: string,
    userId: string,
    input: SaveProjectStateInput,
  ): Promise<ProjectState> {
    const project = await this.findLiveProject(projectId);

    if (project.userId !== userId) {
      throw createAppError('Only the owner can save this project', 403, 'NOT_PROJECT_OWNER');
    }

    const canvas = CANVAS_BY_ASPECT[input.timeline.aspectRatio];
    const projection = buildLayerProjection(projectId, input.timeline.tracks);

    const run = async (tx: ProjectPrisma): Promise<ProjectState> => {
      if (!tx.editLayer) {
        throw new Error(
          'ProjectService.saveProjectState requires the editLayer delegate (projection rebuild)',
        );
      }

      const result = await tx.editProject.updateMany({
        where: { id: projectId, version: input.version, deletedAt: null },
        data: {
          width: canvas.width,
          height: canvas.height,
          duration: input.timeline.duration,
          timeline: input.timeline,
          version: { increment: 1 },
        },
      });

      if (!result || result.count === 0) {
        const fresh = (await tx.editProject.findFirst({
          where: { id: projectId, deletedAt: null },
        })) as ProjectRow | null;
        if (!fresh) {
          throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
        }
        throw createAppError(
          'This project was changed elsewhere since you loaded it',
          409,
          'VERSION_CONFLICT',
          { currentVersion: fresh.version ?? 1 },
        );
      }

      const existing = (await tx.editLayer.findMany({
        where: { projectId },
      })) as Record<string, unknown>[];
      const byClipId = new Map<string, Record<string, unknown>>();
      for (const layerRow of existing) {
        const clipId = clipIdOf(layerRow['content']);
        if (clipId) byClipId.set(clipId, layerRow);
      }

      const keepIds = new Set<string>();
      for (const entry of projection) {
        const existingRow = byClipId.get(entry.clipId);
        if (existingRow) {
          keepIds.add(existingRow['id'] as string);
          await tx.editLayer.update({
            where: { id: existingRow['id'] as string },
            data: entry.data,
          });
        } else {
          const created = (await tx.editLayer.create({ data: entry.data })) as {
            id: string;
          };
          keepIds.add(created.id);
        }
      }
      for (const layerRow of existing) {
        if (!keepIds.has(layerRow['id'] as string)) {
          await tx.editLayer.delete({ where: { id: layerRow['id'] as string } });
        }
      }

      const fresh = (await tx.editProject.findFirst({
        where: { id: projectId, deletedAt: null },
      })) as ProjectRow | null;
      if (!fresh) {
        throw createAppError('Project not found', 404, 'PROJECT_NOT_FOUND');
      }
      return this.toProjectState(fresh);
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(run);
    }
    return run(this.prisma);
  }
}
