// ============================================================================
// QuantCooks CP-1 — per-kind delegate adapters: the EditJob fold-in (§5.7).
// ============================================================================
//
// ExportService, CraftRenderService and PhotoEditService keep their
// public shapes and their tests UNMODIFIED — they speak to a narrow
// prisma delegate (editExportJob / editCraftRenderJob /
// editPhotoEditJob). These adapters implement those delegate surfaces
// over the unified EditJob table (migration 0110), translating rows in
// both directions:
//
//   EXPORT       → kind EXPORT,       params { format, resolution,
//                    quality }, the rendered object KEY in result.outputKey
//                    (landed P0-4 reality: export outputs are storage
//                    keys, not asset rows — §5.7's outputs[0] sketch
//                    follows the landed shape instead, recorded in the
//                    CP-1 report)
//   CRAFT_RENDER → kind CRAFT_RENDER, comp/format/resolution/quality
//                    merged into params, outputAssetId ↔ outputs[0]
//   PHOTO_EDIT   → kind PHOTO_EDIT,   sourceAssetId/outputFormat merged
//                    into params, outputAssetId ↔ outputs[0]
//
// Activation rule: an adapter applies ONLY when the prisma it is handed
// actually has an `editJob` delegate (the real PrismaClient after
// migration 0110). Test fakes expose only the legacy delegates, so every
// existing suite keeps exercising the legacy path untouched, while
// production wiring (routes + server.ts) folds persistence onto
// EditJob. The adapters' own behaviour is pinned by
// backend/__tests__/job-adapters.test.ts, which runs the three services'
// full lifecycles through them over a fake EditJob store.
//
// Legacy rows allow userId = null; EditJob.userId is required. Routes
// always pass a real userId, so the null case "cannot exist in a fresh
// DB" (ExportService's own header) — the adapter stores '' for it and
// maps '' back to null on read.
// ============================================================================

import { randomUUID } from 'node:crypto';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDelegate = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface KindAdapter {
  kind: string;
  toolName: string;
  /** Legacy create data → EditJob create data. */
  toJobData(data: Row): Row;
  /** EditJob row → legacy row. */
  fromJobRow(job: Row): Row;
  /** Legacy update data → EditJob update data (current job row for merges). */
  toJobUpdate(data: Row, current: Row | null): Row;
}

function baseJobData(kind: string, toolName: string, data: Row): Row {
  return {
    userId: data['userId'] ?? '',
    projectId: data['projectId'] ?? null,
    kind,
    toolName,
    provider: data['provider'] ?? null,
    status: data['status'] ?? 'QUEUED',
    progress: data['progress'] ?? 0,
    stage: data['stage'] ?? null,
    params: data['params'] ?? {},
    idempotencyKey: `legacy:${kind.toLowerCase()}:${randomUUID()}`,
    quoteId: null,
    creditCost: data['creditCost'] ?? 0,
    reservationKey: null,
    outputs: [],
    result: null,
    error: data['error'] ?? null,
    parentJobId: null,
    externalRef: data['externalRef'] ?? null,
    attempts: data['attempts'] ?? 0,
    completedAt: data['completedAt'] ?? null,
    ...(data['createdAt'] ? { createdAt: data['createdAt'] } : {}),
  };
}

function baseFromJobRow(job: Row): Row {
  return {
    id: job['id'],
    projectId: job['projectId'],
    userId: job['userId'] === '' ? null : job['userId'],
    provider: job['provider'],
    status: job['status'],
    progress: job['progress'],
    stage: job['stage'],
    creditCost: job['creditCost'],
    externalRef: job['externalRef'],
    error: job['error'],
    attempts: job['attempts'],
    createdAt: job['createdAt'],
    updatedAt: job['updatedAt'],
    completedAt: job['completedAt'],
  };
}

function baseUpdate(data: Row): Row {
  const out: Row = {};
  for (const key of ['status', 'progress', 'stage', 'error', 'completedAt', 'creditCost', 'externalRef', 'attempts', 'provider']) {
    if (key in data) out[key] = data[key];
  }
  return out;
}

// -- EXPORT -------------------------------------------------------------------

const exportAdapter: KindAdapter = {
  kind: 'EXPORT',
  toolName: 'quantcooks.export_project',
  toJobData(data) {
    const job = baseJobData('EXPORT', 'quantcooks.export_project', data);
    job['params'] = {
      format: data['format'],
      resolution: data['resolution'],
      quality: data['quality'],
    };
    job['result'] = data['outputUrl'] ? { outputKey: data['outputUrl'] } : null;
    return job;
  },
  fromJobRow(job) {
    const params = (job['params'] ?? {}) as Row;
    const result = (job['result'] ?? {}) as Row;
    return {
      ...baseFromJobRow(job),
      format: params['format'] ?? 'mp4',
      resolution: params['resolution'] ?? '1080p',
      quality: params['quality'] ?? 'high',
      outputUrl: result['outputKey'] ?? null,
    };
  },
  toJobUpdate(data, current) {
    const out = baseUpdate(data);
    if ('outputUrl' in data) {
      const existing = (current?.['result'] ?? {}) as Row;
      out['result'] = { ...existing, outputKey: data['outputUrl'] ?? null };
    }
    return out;
  },
};

// -- CRAFT_RENDER ---------------------------------------------------------------

const craftAdapter: KindAdapter = {
  kind: 'CRAFT_RENDER',
  toolName: 'quantcooks.render_effects',
  toJobData(data) {
    const job = baseJobData('CRAFT_RENDER', 'quantcooks.render_effects', data);
    job['provider'] = data['provider'] ?? 'effectcraft';
    job['params'] = {
      ...((data['params'] ?? {}) as Row),
      comp: data['comp'] ?? null,
      format: data['format'] ?? 'h264',
      resolution: data['resolution'] ?? null,
      quality: data['quality'] ?? null,
    };
    job['outputs'] = data['outputAssetId']
      ? [{ assetId: data['outputAssetId'], kind: 'video' }]
      : [];
    return job;
  },
  fromJobRow(job) {
    const params = { ...((job['params'] ?? {}) as Row) };
    const { comp, format, resolution, quality, ...rest } = params;
    const outputs = (job['outputs'] ?? []) as Row[];
    return {
      ...baseFromJobRow(job),
      comp: comp ?? null,
      format: format ?? 'h264',
      resolution: resolution ?? null,
      quality: quality ?? null,
      params: rest,
      outputAssetId: outputs[0]?.['assetId'] ?? null,
    };
  },
  toJobUpdate(data, current) {
    const out = baseUpdate(data);
    const paramKeys = ['comp', 'format', 'resolution', 'quality'] as const;
    if (paramKeys.some((k) => k in data) || 'params' in data) {
      const existing = { ...((current?.['params'] ?? {}) as Row) };
      if ('params' in data) {
        // The service writes the full legacy params object; preserve the
        // merged descriptor keys alongside it.
        const { comp, format, resolution, quality } = existing;
        Object.assign(existing, data['params'] as Row, { comp, format, resolution, quality });
      }
      for (const k of paramKeys) {
        if (k in data) existing[k] = data[k];
      }
      out['params'] = existing;
    }
    if ('outputAssetId' in data) {
      out['outputs'] = data['outputAssetId']
        ? [{ assetId: data['outputAssetId'], kind: 'video' }]
        : [];
    }
    return out;
  },
};

// -- PHOTO_EDIT -----------------------------------------------------------------

const photoAdapter: KindAdapter = {
  kind: 'PHOTO_EDIT',
  toolName: 'quantcooks.edit_photo',
  toJobData(data) {
    const job = baseJobData('PHOTO_EDIT', 'quantcooks.edit_photo', data);
    job['provider'] = data['provider'] ?? 'photocraft';
    job['params'] = {
      ...((data['params'] ?? {}) as Row),
      sourceAssetId: data['sourceAssetId'],
      outputFormat: data['outputFormat'] ?? 'png',
    };
    job['outputs'] = data['outputAssetId']
      ? [{ assetId: data['outputAssetId'], kind: 'image' }]
      : [];
    return job;
  },
  fromJobRow(job) {
    const params = { ...((job['params'] ?? {}) as Row) };
    const { sourceAssetId, outputFormat, ...rest } = params;
    const outputs = (job['outputs'] ?? []) as Row[];
    return {
      ...baseFromJobRow(job),
      sourceAssetId: sourceAssetId ?? null,
      outputFormat: outputFormat ?? 'png',
      params: rest,
      outputAssetId: outputs[0]?.['assetId'] ?? null,
    };
  },
  toJobUpdate(data, current) {
    const out = baseUpdate(data);
    const paramKeys = ['sourceAssetId', 'outputFormat'] as const;
    if (paramKeys.some((k) => k in data) || 'params' in data) {
      const existing = { ...((current?.['params'] ?? {}) as Row) };
      if ('params' in data) {
        const { sourceAssetId, outputFormat } = existing;
        Object.assign(existing, data['params'] as Row, { sourceAssetId, outputFormat });
      }
      for (const k of paramKeys) {
        if (k in data) existing[k] = data[k];
      }
      out['params'] = existing;
    }
    if ('outputAssetId' in data) {
      out['outputs'] = data['outputAssetId']
        ? [{ assetId: data['outputAssetId'], kind: 'image' }]
        : [];
    }
    return out;
  },
};

// -- delegate factory -----------------------------------------------------------

function createJobBackedDelegate(editJob: AnyDelegate, adapter: KindAdapter): AnyDelegate {
  const translateWhere = (where: Row = {}): Row => ({ ...where, kind: adapter.kind });

  const findFirstRaw = async (args: Row = {}): Promise<Row | null> => {
    const row = (await editJob['findFirst']({
      where: translateWhere(args['where'] as Row | undefined),
      ...(args['orderBy'] ? { orderBy: args['orderBy'] } : {}),
    })) as Row | null;
    return row;
  };

  return {
    async create({ data }: { data: Row }) {
      const row = (await editJob['create']({
        data: adapter.toJobData(data),
      })) as Row;
      return adapter.fromJobRow(row);
    },

    async findFirst(args: Row = {}) {
      const row = await findFirstRaw(args);
      return row ? adapter.fromJobRow(row) : null;
    },

    async findMany(args: Row = {}) {
      const rows = (await editJob['findMany']({
        where: translateWhere(args['where'] as Row | undefined),
        ...(args['orderBy'] ? { orderBy: args['orderBy'] } : {}),
      })) as Row[];
      return rows.map((r) => adapter.fromJobRow(r));
    },

    async update({ where, data }: { where: Row; data: Row }) {
      const current = await findFirstRaw({ where });
      if (!current) {
        throw new Error('Record to update not found (adapter P2025)');
      }
      const row = (await editJob['update']({
        where: { id: current['id'] },
        data: adapter.toJobUpdate(data, current),
      })) as Row;
      return adapter.fromJobRow(row);
    },

    async updateMany({ where, data }: { where: Row; data: Row }) {
      return editJob['updateMany']({
        where: translateWhere(where),
        data: adapter.toJobUpdate(data, null),
      }) as Promise<{ count: number }>;
    },
  };
}

// -- prisma wrappers (activation: only when an editJob delegate exists) ---------

export function adaptExportPrisma<T extends Row>(prisma: T): T {
  if (!prisma || !(prisma as Row)['editJob']) return prisma;
  return {
    ...prisma,
    editExportJob: createJobBackedDelegate((prisma as Row)['editJob'] as AnyDelegate, exportAdapter),
  };
}

export function adaptCraftPrisma<T extends Row>(prisma: T): T {
  if (!prisma || !(prisma as Row)['editJob']) return prisma;
  return {
    ...prisma,
    editCraftRenderJob: createJobBackedDelegate(
      (prisma as Row)['editJob'] as AnyDelegate,
      craftAdapter,
    ),
  };
}

export function adaptPhotoPrisma<T extends Row>(prisma: T): T {
  if (!prisma || !(prisma as Row)['editJob']) return prisma;
  return {
    ...prisma,
    editPhotoEditJob: createJobBackedDelegate(
      (prisma as Row)['editJob'] as AnyDelegate,
      photoAdapter,
    ),
  };
}
