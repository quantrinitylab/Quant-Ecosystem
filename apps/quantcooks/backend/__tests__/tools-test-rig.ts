// ============================================================================
// Shared CP-1 test rig: a full ToolRegistry (all 58 tools) over the repo's
// own delegate fakes + fake storage, with the three legacy job delegates
// folded onto the fake EditJob store via the production adapters — i.e.
// the tests exercise the same wiring server.ts builds, minus the real
// PrismaClient. Companion runners default to null (binaries absent →
// the twins fail closed); suites inject fakes where they need them.
// ============================================================================

import { createFakeEditProjectPrisma } from './fake-edit-project-prisma';
import { createFakeEditLayerPrisma } from './fake-edit-layer-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeEditJobPrisma } from './fake-edit-job-prisma';
import { createFakeStorage } from './fake-storage';
import {
  adaptCraftPrisma,
  adaptExportPrisma,
  adaptPhotoPrisma,
} from '../services/job-delegate-adapters';
import { buildToolRegistry } from '../tools/index';
import type { ToolContext } from '../tools/context';
import type { CreditsExecutionPort } from '../tools/pricing';
import type { EffectCraftRunner } from '../services/effectcraft.adapter';
import type { PhotoCraftRunner } from '../services/photocraft.adapter';
import type { FigCraftRunner } from '../services/figcraft.adapter';
import type { StoragePort } from '../services/storage.adapter';

export const USER = 'user-1';
export const OTHER = 'user-2';

export function userCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return { actorUserId: USER, surface: 'ui', scopes: [], ...overrides };
}

export interface ToolsTestRigOptions {
  storage?: StoragePort | null;
  craftRunner?: EffectCraftRunner | null;
  photoRunner?: PhotoCraftRunner | null;
  figcraftRunner?: FigCraftRunner | null;
  credits?: CreditsExecutionPort | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ai?: any;
}

/**
 * Permissive in-memory delegate for the CRUD surfaces no dedicated repo
 * fake exists for (editBrandKit, editCollaborator, editComment,
 * autoEditRun). Equality matching incl. OR groups; ids assigned on
 * create. Enough for the services' real code paths to run honestly.
 */
export function createGenericDelegate(prefix: string) {
  const rows: Record<string, unknown>[] = [];
  let counter = 0;
  const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean =>
    Object.entries(where).every(([key, expected]) => {
      if (key === 'OR') {
        return (expected as Record<string, unknown>[]).some((branch) => matches(row, branch));
      }
      if (expected === null) return row[key] === null || row[key] === undefined;
      return row[key] === expected;
    });
  return {
    rows,
    async create({ data }: { data: Record<string, unknown> }) {
      counter++;
      const row = { id: `${prefix}-${counter}`, createdAt: new Date(), updatedAt: new Date(), ...data };
      rows.push(row);
      return { ...row };
    },
    async findFirst(args: Record<string, unknown> = {}) {
      const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
      const found = rows.find((r) => matches(r, where));
      return found ? { ...found } : null;
    },
    async findUnique(args: Record<string, unknown> = {}) {
      const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
      const found = rows.find((r) => matches(r, where));
      return found ? { ...found } : null;
    },
    async findMany(args: Record<string, unknown> = {}) {
      const where = (args['where'] as Record<string, unknown> | undefined) ?? {};
      return rows.filter((r) => matches(r, where)).map((r) => ({ ...r }));
    },
    async update({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      const row = rows.find((r) => matches(r, where));
      if (!row) throw new Error('Record to update not found (generic fake P2025)');
      Object.assign(row, data, { updatedAt: new Date() });
      return { ...row };
    },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      let count = 0;
      for (const row of rows) {
        if (matches(row, where)) {
          Object.assign(row, data, { updatedAt: new Date() });
          count++;
        }
      }
      return { count };
    },
    async delete({ where }: { where: Record<string, unknown> }) {
      const idx = rows.findIndex((r) => matches(r, where));
      if (idx === -1) throw new Error('Record to delete not found (generic fake P2025)');
      const [row] = rows.splice(idx, 1);
      return row ? { ...row } : null;
    },
    async deleteMany({ where }: { where: Record<string, unknown> }) {
      let count = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (matches(rows[i]!, where)) {
          rows.splice(i, 1);
          count++;
        }
      }
      return { count };
    },
  };
}

export function createToolsTestRig(options: ToolsTestRigOptions = {}) {
  const projectFake = createFakeEditProjectPrisma();
  const layerFake = createFakeEditLayerPrisma();
  const assetFake = createFakeEditAssetPrisma();
  const jobFake = createFakeEditJobPrisma();

  const prefs = new Map<string, Record<string, unknown>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base: any = {
    ...projectFake,
    ...layerFake,
    ...assetFake,
    // JobService's editAsset reads resolve against the asset store (the
    // real client has one table); the job fake's own editAsset map is
    // only for the standalone JobService suite.
    editJob: jobFake.editJob,
    editBrandKit: createGenericDelegate('brandkit'),
    editCollaborator: createGenericDelegate('collaborator'),
    editComment: createGenericDelegate('comment'),
    autoEditRun: createGenericDelegate('autoedit-run'),
    autoEditPreference: {
      async findUnique({ where }: { where: { userId: string } }) {
        return prefs.get(where.userId) ?? null;
      },
      async upsert({
        where,
        update,
        create,
      }: {
        where: { userId: string };
        update: Record<string, unknown>;
        create: Record<string, unknown>;
      }) {
        const row = { ...(prefs.get(where.userId) ?? create), ...update };
        prefs.set(where.userId, row);
        return row;
      },
    },
  };

  // Production fold-in order is irrelevant (disjoint delegates).
  const prisma = adaptPhotoPrisma(adaptCraftPrisma(adaptExportPrisma(base)));

  const storage = options.storage === undefined ? createFakeStorage().port : options.storage;

  const { registry, deps, auditLog } = buildToolRegistry({
    prisma,
    storage,
    craftRunner: options.craftRunner ?? null,
    photoRunner: options.photoRunner ?? null,
    figcraftRunner: options.figcraftRunner ?? null,
    credits: options.credits ?? null,
    ...(options.ai ? { ai: options.ai } : {}),
  });

  return {
    registry,
    deps,
    auditLog,
    prisma,
    base,
    projectFake,
    layerFake,
    assetFake,
    jobFake,
    storage,
  };
}

export type ToolsTestRig = ReturnType<typeof createToolsTestRig>;

/** Assert a rejection carries the expected AppError code (and status). */
export async function expectCode(
  promise: Promise<unknown>,
  code: string,
  statusCode?: number,
): Promise<void> {
  try {
    await promise;
  } catch (err) {
    const e = err as { code?: string; statusCode?: number };
    if (e.code !== code) {
      throw new Error(`expected error code ${code}, got ${e.code ?? String(err)}`);
    }
    if (statusCode !== undefined && e.statusCode !== statusCode) {
      throw new Error(`expected status ${statusCode} for ${code}, got ${e.statusCode}`);
    }
    return;
  }
  throw new Error(`expected rejection with code ${code}, but the call resolved`);
}
