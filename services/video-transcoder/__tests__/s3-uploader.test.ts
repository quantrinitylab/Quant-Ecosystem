import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { HlsStorageUploader, getHlsCacheControl, getHlsContentType } from '../src/uploader.js';

describe('Wave 37-02: Cloudflare R2 / S3 Multipart Stream Uploader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quant-s3-uploader-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('streams generated .ts chunks and .m3u8 playlists concurrently with correct headers', async () => {
    const hlsDir = path.join(tempDir, 'hls');
    await fs.mkdir(path.join(hlsDir, '1080p'), { recursive: true });
    await fs.mkdir(path.join(hlsDir, '480p'), { recursive: true });

    // Master manifest
    await fs.writeFile(path.join(hlsDir, 'master.m3u8'), '#EXTM3U\n');
    // 1080p variant
    await fs.writeFile(path.join(hlsDir, '1080p', 'playlist.m3u8'), '#EXTM3U\n');
    await fs.writeFile(path.join(hlsDir, '1080p', 'segment_000.ts'), Buffer.alloc(376, 0x47));
    await fs.writeFile(path.join(hlsDir, '1080p', 'segment_001.ts'), Buffer.alloc(376, 0x47));
    // 480p variant
    await fs.writeFile(path.join(hlsDir, '480p', 'playlist.m3u8'), '#EXTM3U\n');
    await fs.writeFile(path.join(hlsDir, '480p', 'segment_000.ts'), Buffer.alloc(376, 0x47));

    const uploadedHeaders = new Map<string, { contentType: string; cacheControl: string }>();

    const mockR2 = {
      upload: vi.fn(
        async (
          key: string,
          _stream: unknown,
          contentType?: string,
          options?: { cacheControl?: string },
        ) => {
          uploadedHeaders.set(key, {
            contentType: contentType || '',
            cacheControl: options?.cacheControl || '',
          });
          return {
            key,
            etag: 'etag-test',
            publicUrl: `https://media.quantube.in/${key}`,
          };
        },
      ),
      getPublicUrl: vi.fn((key: string) => `https://media.quantube.in/${key}`),
    };

    const mockPrisma = {
      video: {
        update: vi.fn(async ({ where, data }) => ({ id: where.id, ...data })),
      },
    };

    const uploader = new HlsStorageUploader({
      r2Client: mockR2 as never,
      concurrency: 4,
      prisma: mockPrisma,
    });

    const result = await uploader.uploadAndFinalize('vid-999', hlsDir, 'videos/vid-999');

    expect(result.videoId).toBe('vid-999');
    expect(result.masterManifestUrl).toBe('https://media.quantube.in/videos/vid-999/master.m3u8');
    expect(result.uploadedCount).toBe(6);

    // Verify .ts headers: public, max-age=31536000, immutable
    const segHeader = uploadedHeaders.get('videos/vid-999/1080p/segment_000.ts');
    expect(segHeader?.cacheControl).toBe('public, max-age=31536000, immutable');
    expect(segHeader?.contentType).toBe('video/MP2T');

    // Verify master.m3u8 headers: no-cache
    const masterHeader = uploadedHeaders.get('videos/vid-999/master.m3u8');
    expect(masterHeader?.cacheControl).toBe('no-cache');
    expect(masterHeader?.contentType).toBe('application/vnd.apple.mpegurl');

    // Verify database update
    expect(mockPrisma.video.update).toHaveBeenLastCalledWith({
      where: { id: 'vid-999' },
      data: expect.objectContaining({
        processingStatus: 'COMPLETED',
        videoUrl: 'https://media.quantube.in/videos/vid-999/master.m3u8',
      }),
    });
  });

  it('handles database update failures gracefully', async () => {
    const brokenPrisma = {
      video: {
        update: vi.fn(async () => {
          throw new Error('Database connection failed');
        }),
      },
    };

    const uploader = new HlsStorageUploader({
      prisma: brokenPrisma,
    });

    const success = await uploader.updateVideoStatus(
      'vid-err',
      'READY',
      'https://media.quantube.in/master.m3u8',
    );
    expect(success).toBe(false);
  });
});
