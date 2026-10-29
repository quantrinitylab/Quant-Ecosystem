// ============================================================================
// Export processor END-TO-END test (P0-4) — ENV-GATED.
//
// This is the spec §3.7 done-definition evidence: a real project export
// transitions QUEUED → PROCESSING → COMPLETED against REAL ffmpeg and REAL
// object storage, and the output downloads as a playable MP4 (ffprobe).
//
// It runs only when EXPORT_E2E=1 AND storage env is configured (MinIO/R2/S3
// via the usual @quant/storage env vars) — i.e. in CI/staging, never in the
// local extract (no storage env, no engines there), where it skips. The row
// store is still the composed fake delegates: a real test-DB run remains a
// CI concern exactly as recorded for P0-1..P0-3. Everything else — storage
// bytes, ffmpeg render, ffprobe assertion — is real.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { ExportService } from '../services/export.service';
import { ExportProcessor } from '../services/export-processor';
import { StorageExportRenderer } from '../services/export-renderer';
import { createFakeEditProjectPrisma } from './fake-edit-project-prisma';
import { createFakeEditLayerPrisma } from './fake-edit-layer-prisma';
import { createFakeEditAssetPrisma } from './fake-edit-asset-prisma';
import { createFakeEditExportPrisma } from './fake-edit-export-prisma';

const execFileAsync = promisify(execFile);
const runE2E = process.env['EXPORT_E2E'] === '1';

describe.skipIf(!runE2E)('export processor e2e (real ffmpeg + real storage)', () => {
  it('renders a playable mp4 from a generated 1s fixture and downloads it', async () => {
    const { buildStoragePort } = await import('../services/storage.adapter');
    const storage = buildStoragePort();
    if (!storage) throw new Error('EXPORT_E2E requires storage env to be configured');

    const workDir = await mkdtemp(join(tmpdir(), 'qc-export-e2e-'));
    const fixturePath = join(workDir, 'fixture.mp4');
    try {
      // 1-second test clip, generated the way spec §3.7 prescribes.
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=320x240:rate=10',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        fixturePath,
      ]);

      const { createReadStream } = await import('node:fs');
      const { stat } = await import('node:fs/promises');
      const size = (await stat(fixturePath)).size;
      void size;

      const projectFake = createFakeEditProjectPrisma();
      const layerFake = createFakeEditLayerPrisma();
      const assetFake = createFakeEditAssetPrisma();
      const exportFake = createFakeEditExportPrisma();
      const prisma = {
        editProject: projectFake.editProject,
        editLayer: layerFake.editLayer,
        editAsset: assetFake.editAsset,
        editExportJob: exportFake.editExportJob,
      };

      const project = await projectFake.editProject.create({
        data: { userId: 'e2e-user', name: 'E2E', type: 'video' },
      });
      const sourceKey = `quantcooks/e2e-user/${project.id}/fixture-src/fixture.mp4`;
      await storage.upload(sourceKey, createReadStream(fixturePath), 'video/mp4');

      const asset = await assetFake.editAsset.create({
        data: {
          projectId: project.id,
          userId: 'e2e-user',
          filename: 'fixture.mp4',
          type: 'video',
          size,
          url: sourceKey,
          metadata: { uploadStatus: 'READY', storageKey: sourceKey },
        },
      });
      await layerFake.editLayer.create({
        data: {
          projectId: project.id,
          name: 'Main',
          type: 'video',
          order: 0,
          content: { assetId: asset.id },
        },
      });

      const service = new ExportService(exportFake as never, storage);
      const job = await service.queueExport({
        userId: 'e2e-user',
        projectId: project.id as string,
        format: 'mp4',
        resolution: '720p',
        quality: 'high',
      });

      const processor = new ExportProcessor({
        service,
        renderer: new StorageExportRenderer(storage),
        prisma: prisma as never,
        storage,
        workDir,
        logger: { info: () => undefined, error: () => undefined },
      });

      let terminal = await service.getExportStatus(job.id);
      for (let i = 0; i < 30 && terminal.status !== 'COMPLETED' && terminal.status !== 'FAILED'; i++) {
        await processor.tick();
        terminal = await service.getExportStatus(job.id);
      }

      expect(terminal.status).toBe('COMPLETED');
      expect(terminal.outputKey).toBeTruthy();

      // The output is a real, playable MP4: download it and ffprobe it via
      // the real transcoder.
      const downloaded = await storage.download(terminal.outputKey as string);
      const chunks: Buffer[] = [];
      for await (const chunk of downloaded.body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      }
      expect(Buffer.concat(chunks).length).toBeGreaterThan(0);

      const { VideoTranscoder } = (await import('@quant/media')) as unknown as {
        VideoTranscoder: new () => {
          getMediaInfo(p: string): Promise<{ streams?: Array<{ codec_type?: string; height?: number }>; format?: { duration?: number } }>;
        };
      };
      const outPath = join(workDir, 'downloaded.mp4');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(outPath, Buffer.concat(chunks));
      const info = await new VideoTranscoder().getMediaInfo(outPath);
      const video = info.streams?.find((s) => s.codec_type === 'video');
      expect(video).toBeDefined();
      expect(video?.height ?? 9999).toBeLessThanOrEqual(720);
      expect(info.format?.duration ?? 0).toBeGreaterThan(0.5);
      expect(info.format?.duration ?? 99).toBeLessThan(1.6);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }, 60_000);
});
