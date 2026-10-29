// ============================================================================
// Craft render — REAL binary integration test (C-2, GATED).
//
// Runs only when BOTH are set:
//   CRAFT_IT=1
//   EFFECTCRAFT_BIN=<path to the pinned effectcraft-cli>
//
// It renders the C-2 spike's real .ecproj (a project the pinned binary
// itself wrote) through the full production path — CraftRenderService +
// CraftRenderProcessor + NodeEffectCraftRunner + AssetService over fake
// prisma/storage — and asserts the job completes with a real MP4 (ftyp box)
// landed as a READY asset. This is the local form of the spike report's §5
// step 5 acceptance; in CI it stays gated on the install step providing the
// binary (see PINNED_EFFECTCRAFT in effectcraft.adapter.ts).
//
// The .ecproj path defaults to the spike workspace sample; override with
// CRAFT_IT_ECPROJ.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CraftRenderService } from '../services/craft-render.service';
import { CraftRenderProcessor } from '../services/craft-render-processor';
import { AssetService } from '../services/asset.service';
import { NodeEffectCraftRunner } from '../services/effectcraft.adapter';
import { createFakeEditCraftRenderPrisma } from './fake-edit-craft-render-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeStorage } from './fake-storage';

const BIN = process.env['EFFECTCRAFT_BIN'];
const ENABLED = process.env['CRAFT_IT'] === '1' && Boolean(BIN);
const ECPROJ_PATH =
  process.env['CRAFT_IT_ECPROJ'] ??
  join(homedir(), 'workspace', 'quantcooks-craft-spike', 'sample-demo.ecproj');

describe.skipIf(!ENABLED)('craft render — real pinned binary (CRAFT_IT)', () => {
  it(
    'renders the spike sample .ecproj to a real MP4 asset through the full service path',
    async () => {
      const runner = new NodeEffectCraftRunner(BIN!);
      await expect(runner.probeVersion()).resolves.toContain('0.18.0');

      const ecproj = JSON.parse(readFileSync(ECPROJ_PATH, 'utf8')) as Record<string, unknown>;

      const craft = createFakeEditCraftRenderPrisma();
      const assetsFake = createFakeEditAssetPrisma();
      const prisma = {
        editCraftRenderJob: craft.editCraftRenderJob,
        editAsset: assetsFake.editAsset,
      };
      const storage = createFakeStorage();
      const service = new CraftRenderService(prisma as never, storage.port, runner);
      const processor = new CraftRenderProcessor({
        service,
        assets: new AssetService(prisma as never, storage.port),
        runner,
        storage: storage.port,
        logger: { info: () => undefined, error: () => undefined },
      });

      const job = await service.createRender({
        projectId: 'craft-it-project',
        ecproj,
        comp: 'EffectCraft Intro',
        format: 'h264',
        resolution: 'quarter',
        quality: 'draft',
        startSec: 0,
        endSec: 1,
        userId: 'craft-it-user',
      });
      expect(job.status).toBe('QUEUED');

      await processor.tick();

      const done = await service.getRender(job.id, 'craft-it-user');
      expect(done.status).toBe('COMPLETED');
      expect(done.progress).toBe(100);
      expect(done.outputAssetId).toBeTruthy();

      const assetRow = assetsFake.rows.find((r) => r.id === done.outputAssetId);
      expect(assetRow).toBeTruthy();
      const meta = assetRow!.metadata as Record<string, unknown>;
      expect(meta['uploadStatus']).toBe('READY');
      const key = meta['storageKey'] as string;
      const bytes = storage.objects.get(key)!.bytes;
      expect(bytes.length).toBeGreaterThan(0);
      // A real MP4: the ftyp box type sits at bytes 4..8.
      expect(bytes.subarray(4, 8).toString('ascii')).toBe('ftyp');
    },
    120_000,
  );
});
