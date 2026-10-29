// ============================================================================
// QuantCooks CP-1 — Group B: assets (tools 8–12, Tier A).
// Wraps services/asset.service.ts (P0-3) + services/storage.adapter.ts.
//
// Landed-shape reconciliations (Step 0):
//  - list_assets follows the landed ListAllAssetsFilters { projectId,
//    category, search } — `category` IS the type filter in the landed
//    service, so the spec sketch's separate `type?` param is not carried.
//  - download_asset's output omits contentType: the landed Asset shape
//    exposes no MIME type (it lives on the row's metadata, which no
//    service accessor returns). The URL is minted fresh per call (1 h)
//    and never persisted (P0-3's convention).
// ============================================================================

import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import type { ToolRegistry } from '../registry';
import { out } from './shared';

const assetOut = out({ asset: z.unknown() });
const storageAvailability = (deps: { storage: unknown }) =>
  deps.storage
    ? { available: true }
    : { available: false, reason: 'STORAGE_NOT_CONFIGURED' };

export function registerAssetTools(registry: ToolRegistry): void {
  registry.register({
    name: 'quantcooks.list_assets',
    group: 'assets',
    description:
      "List the caller's media assets (optionally filtered by project, category or filename search). Each asset's url is a freshly minted signed URL, or null while not READY. Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    inputSchema: z.object({
      projectId: z.string().min(1).optional(),
      category: z.string().min(1).optional(),
      search: z.string().min(1).optional(),
    }),
    outputSchema: out({ assets: z.array(z.unknown()) }),
    example: { input: {}, output: { assets: [] } },
    execute: async (input, ctx, deps) => {
      const assets = await deps.assets.listAllAssets(ctx.actorUserId, {
        projectId: input.projectId,
        category: input.category,
        search: input.search,
      });
      return { assets };
    },
  });

  registry.register({
    name: 'quantcooks.upload_asset',
    group: 'assets',
    description:
      'Begin an asset upload (step 1 of the 3-step flow): creates the asset row and returns a signed PUT URL for its deterministic key. The caller then PUTs the bytes to uploadUrl and completes via POST /assets/{assetId}/complete — this tool does not invent a second completion path. Free.',
    mode: 'sync',
    tier: 'A',
    permissionTier: 1,
    availability: (deps) => storageAvailability(deps),
    inputSchema: z.object({
      projectId: z.string().min(1),
      filename: z.string().min(1),
      contentType: z.string().min(1),
      size: z.number().int().positive(),
    }),
    outputSchema: out({
      assetId: z.string(),
      uploadUrl: z.string(),
      key: z.string(),
      expiresAt: z.string(),
      requiredHeaders: z.record(z.string(), z.string()),
      maxBytes: z.number(),
      nextStep: z.string(),
    }),
    example: {
      input: { projectId: 'proj_1', filename: 'biryani.jpg', contentType: 'image/jpeg', size: 1024 },
    },
    execute: async (input, ctx, deps) => {
      const result = await deps.assets.generateUploadUrl(ctx.actorUserId, {
        projectId: input.projectId,
        filename: input.filename,
        contentType: input.contentType,
        size: input.size,
      });
      return {
        assetId: result.assetId,
        uploadUrl: result.uploadUrl,
        key: result.key,
        expiresAt: result.expiresAt.toISOString(),
        requiredHeaders: result.requiredHeaders,
        maxBytes: result.maxBytes,
        nextStep: `PUT bytes to uploadUrl, then POST /assets/${result.assetId}/complete`,
      };
    },
  });

  registry.register({
    name: 'quantcooks.get_asset',
    group: 'assets',
    description: "Read one of the caller's assets by id (owner-scoped; another user's asset is a 404). Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    inputSchema: z.object({ assetId: z.string().min(1) }),
    outputSchema: assetOut,
    example: { input: { assetId: 'asset_1' } },
    execute: async (input, ctx, deps) => {
      const asset = await deps.assets.getAsset(input.assetId, ctx.actorUserId);
      return { asset };
    },
  });

  registry.register({
    name: 'quantcooks.delete_asset',
    group: 'assets',
    description:
      "Delete one of the caller's assets (row deleted; stored bytes removed best-effort). Tier-2: agent surfaces must confirm first. Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 2,
    inputSchema: z.object({ assetId: z.string().min(1) }),
    outputSchema: out({ deleted: z.boolean() }),
    example: { input: { assetId: 'asset_1' }, output: { deleted: true } },
    execute: async (input, ctx, deps) => {
      await deps.assets.deleteAsset(input.assetId, ctx.actorUserId);
      return { deleted: true };
    },
  });

  registry.register({
    name: 'quantcooks.download_asset',
    group: 'assets',
    description:
      "Mint a fresh signed download URL (1 h) for one of the caller's READY assets — works for any READY asset including job outputs. The URL is never persisted. Free.",
    mode: 'sync',
    tier: 'A',
    permissionTier: 0,
    availability: (deps) => storageAvailability(deps),
    inputSchema: z.object({ assetId: z.string().min(1) }),
    outputSchema: out({
      url: z.string(),
      expiresAt: z.string(),
      filename: z.string(),
    }),
    example: { input: { assetId: 'asset_1' } },
    execute: async (input, ctx, deps) => {
      const asset = await deps.assets.getAsset(input.assetId, ctx.actorUserId);
      if (!deps.storage) {
        throw createAppError('Object storage is not configured', 503, 'STORAGE_NOT_CONFIGURED');
      }
      if (asset.uploadStatus !== 'READY' || !asset.storageKey) {
        throw createAppError(
          `Asset is not ready for download (status: ${asset.uploadStatus})`,
          409,
          'ASSET_NOT_READY',
        );
      }
      const url = await deps.storage.getSignedUrl(asset.storageKey, 3600);
      return {
        url,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        filename: asset.filename,
      };
    },
  });
}
