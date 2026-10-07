import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  FfmpegHlsTranscoder,
  generateMasterPlaylistContent,
  HLS_PROFILES,
  DEFAULT_RESOLUTIONS,
  type HlsResolution,
} from '../src/ffmpeg.js';
import { HlsStorageUploader, getHlsCacheControl, getHlsContentType } from '../src/uploader.js';
import { VideoTranscoderWorker, type TranscodeJobData } from '../src/worker.js';

describe('Wave 37-01: Multi-Bitrate HLS Transcoding Engine', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quant-ffmpeg-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('defines the 4 required HLS profiles with exact bitrates and resolutions', () => {
    expect(DEFAULT_RESOLUTIONS).toEqual(['1080p', '720p', '480p', '360p']);

    // 1080p (4500kbps)
    expect(HLS_PROFILES['1080p']).toEqual({
      name: '1080p',
      width: 1920,
      height: 1080,
      videoBitrate: '4500k',
      audioBitrate: '192k',
      bandwidth: 4500000,
    });

    // 720p (2200kbps)
    expect(HLS_PROFILES['720p']).toEqual({
      name: '720p',
      width: 1280,
      height: 720,
      videoBitrate: '2200k',
      audioBitrate: '128k',
      bandwidth: 2200000,
    });

    // 480p (800kbps)
    expect(HLS_PROFILES['480p']).toEqual({
      name: '480p',
      width: 854,
      height: 480,
      videoBitrate: '800k',
      audioBitrate: '96k',
      bandwidth: 800000,
    });

    // 360p (400kbps)
    expect(HLS_PROFILES['360p']).toEqual({
      name: '360p',
      width: 640,
      height: 360,
      videoBitrate: '400k',
      audioBitrate: '96k',
      bandwidth: 400000,
    });
  });

  it('generates a compliant master.m3u8 with forward slashes and EXT-X-STREAM-INF headers', () => {
    const variants: Array<{ resolution: HlsResolution; relativePath: string }> = [
      { resolution: '1080p', relativePath: '1080p/playlist.m3u8' },
      { resolution: '720p', relativePath: '720p/playlist.m3u8' },
      { resolution: '480p', relativePath: '480p\\playlist.m3u8' }, // test windows backslash normalization
      { resolution: '360p', relativePath: '360p/playlist.m3u8' },
    ];

    const masterContent = generateMasterPlaylistContent(variants);

    expect(masterContent).toContain('#EXTM3U');
    expect(masterContent).toContain('#EXT-X-VERSION:3');

    // 1080p stream tag
    expect(masterContent).toContain('#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080');
    expect(masterContent).toContain('1080p/playlist.m3u8');

    // 720p stream tag
    expect(masterContent).toContain('#EXT-X-STREAM-INF:BANDWIDTH=2200000,RESOLUTION=1280x720');
    expect(masterContent).toContain('720p/playlist.m3u8');

    // 480p stream tag
    expect(masterContent).toContain('#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480');
    expect(masterContent).toContain('480p/playlist.m3u8');
    expect(masterContent).not.toContain('480p\\playlist.m3u8'); // verify normalized to forward slash

    // 360p stream tag
    expect(masterContent).toContain('#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360');
    expect(masterContent).toContain('360p/playlist.m3u8');
  });

  it('transcodes input into 1080p, 720p, 480p, 360p variants with 4s segments and master playlist', async () => {
    const transcoder = new FfmpegHlsTranscoder(4);
    const dummyInput = path.join(tempDir, 'input.mp4');
    await fs.writeFile(dummyInput, Buffer.from('TEST_INPUT_MEDIA_STREAM'));

    const hlsOut = path.join(tempDir, 'hls_out');

    const progressCalls: Array<{ res: string; percent: number }> = [];
    const result = await transcoder.transcode({
      inputPath: dummyInput,
      outputDir: hlsOut,
      segmentDuration: 4,
      onVariantProgress: (res, percent) => {
        progressCalls.push({ res, percent });
      },
    });

    expect(result.variants).toHaveLength(4);
    expect(result.variants.map((v) => v.resolution)).toEqual(['1080p', '720p', '480p', '360p']);

    // Verify master.m3u8 was created and has correct size
    const masterExists = await fs
      .stat(result.masterPlaylistPath)
      .then(() => true)
      .catch(() => false);
    expect(masterExists).toBe(true);

    const masterText = await fs.readFile(result.masterPlaylistPath, 'utf-8');
    expect(masterText).toContain('#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080');
    expect(masterText).toContain('#EXT-X-STREAM-INF:BANDWIDTH=2200000,RESOLUTION=1280x720');
    expect(masterText).toContain('#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480');
    expect(masterText).toContain('#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=640x360');

    // Verify each variant directory and chunks
    for (const res of ['1080p', '720p', '480p', '360p'] as HlsResolution[]) {
      const variantDir = path.join(hlsOut, res);
      const playlist = await fs.readFile(path.join(variantDir, 'playlist.m3u8'), 'utf-8');
      expect(playlist).toContain('#EXTM3U');
      expect(playlist).toContain('#EXT-X-TARGETDURATION:4');
      expect(playlist).toContain('segment_000.ts');
      expect(playlist).toContain('segment_001.ts');

      const seg0 = await fs.readFile(path.join(variantDir, 'segment_000.ts'));
      expect(seg0.length).toBeGreaterThan(0);
      expect(seg0[0]).toBe(0x47); // TS Sync Byte
    }

    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.allGeneratedFiles.length).toBeGreaterThanOrEqual(13); // master + 4*(playlist + 2 ts)
  });
});

describe('Wave 37-02: Cloudflare R2 / S3 Concurrent Streaming Uploader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quant-uploader-test-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('assigns correct Cache-Control and Content-Type per spec', () => {
    expect(getHlsCacheControl('master.m3u8')).toBe('no-cache');
    expect(getHlsCacheControl('1080p/playlist.m3u8')).toBe('no-cache');
    expect(getHlsCacheControl('1080p/segment_000.ts')).toBe('public, max-age=31536000, immutable');
    expect(getHlsCacheControl('video.mp4')).toBe('public, max-age=3600');

    expect(getHlsContentType('master.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(getHlsContentType('variant.m3u8')).toBe('application/vnd.apple.mpegurl');
    expect(getHlsContentType('chunk.ts')).toBe('video/MP2T');
  });

  it('concurrently uploads HLS directory and updates PostgreSQL video status', async () => {
    // Generate dummy HLS files in tempDir
    const hlsDir = path.join(tempDir, 'hls');
    await fs.mkdir(path.join(hlsDir, '1080p'), { recursive: true });
    await fs.mkdir(path.join(hlsDir, '720p'), { recursive: true });

    await fs.writeFile(path.join(hlsDir, 'master.m3u8'), '#EXTM3U\n');
    await fs.writeFile(path.join(hlsDir, '1080p', 'playlist.m3u8'), '#EXTM3U\n');
    await fs.writeFile(path.join(hlsDir, '1080p', 'segment_000.ts'), Buffer.alloc(188, 0x47));
    await fs.writeFile(path.join(hlsDir, '720p', 'playlist.m3u8'), '#EXTM3U\n');
    await fs.writeFile(path.join(hlsDir, '720p', 'segment_000.ts'), Buffer.alloc(188, 0x47));

    // Mock R2 client
    const uploadedMap = new Map<string, { contentType: string; cacheControl: string }>();
    let activeUploads = 0;
    let maxObservedConcurrency = 0;

    const mockR2 = {
      upload: vi.fn(
        async (
          key: string,
          _body: unknown,
          contentType?: string,
          options?: { cacheControl?: string },
        ) => {
          activeUploads++;
          maxObservedConcurrency = Math.max(maxObservedConcurrency, activeUploads);
          // Small delay to simulate async network streaming
          await new Promise((r) => setTimeout(r, 20));
          uploadedMap.set(key, {
            contentType: contentType || '',
            cacheControl: options?.cacheControl || '',
          });
          activeUploads--;
          return {
            key,
            etag: 'mock-etag-123',
            publicUrl: `https://media.quantube.in/${key}`,
          };
        },
      ),
      getPublicUrl: vi.fn((key: string) => `https://media.quantube.in/${key}`),
    };

    // Mock PostgreSQL Prisma client
    const mockPrisma = {
      video: {
        update: vi.fn(async (args: { where: { id: string }; data: unknown }) => {
          return { id: args.where.id, ...args.data };
        }),
      },
    };

    const uploader = new HlsStorageUploader({
      r2Client: mockR2 as never,
      concurrency: 3,
      prisma: mockPrisma,
    });

    const progressTracker: Array<{ current: number; total: number; key: string }> = [];
    const result = await uploader.uploadAndFinalize(
      'vid-test-01',
      hlsDir,
      'videos/vid-test-01',
      (c, t, k) => {
        progressTracker.push({ current: c, total: t, key: k });
      },
    );

    expect(result.videoId).toBe('vid-test-01');
    expect(result.masterManifestUrl).toBe(
      'https://media.quantube.in/videos/vid-test-01/master.m3u8',
    );
    expect(result.uploadedFiles).toHaveLength(5);
    expect(result.totalBytes).toBeGreaterThan(0);

    // Verify concurrency was utilized up to the limit
    expect(maxObservedConcurrency).toBeGreaterThan(1);
    expect(maxObservedConcurrency).toBeLessThanOrEqual(3);

    // Verify cache control for .ts segments vs .m3u8 playlists
    const masterUpload = uploadedMap.get('videos/vid-test-01/master.m3u8');
    expect(masterUpload?.cacheControl).toBe('no-cache');
    expect(masterUpload?.contentType).toBe('application/vnd.apple.mpegurl');

    const tsUpload = uploadedMap.get('videos/vid-test-01/1080p/segment_000.ts');
    expect(tsUpload?.cacheControl).toBe('public, max-age=31536000, immutable');
    expect(tsUpload?.contentType).toBe('video/MP2T');

    // Verify atomic PostgreSQL status updates
    expect(mockPrisma.video.update).toHaveBeenCalledTimes(2);
    // 1st call: transition to PROCESSING
    expect(mockPrisma.video.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'vid-test-01' },
        data: expect.objectContaining({ processingStatus: 'PROCESSING' }),
      }),
    );
    // 2nd call: transition to COMPLETED (READY) with playback URL
    expect(mockPrisma.video.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'vid-test-01' },
        data: expect.objectContaining({
          processingStatus: 'COMPLETED',
          videoUrl: 'https://media.quantube.in/videos/vid-test-01/master.m3u8',
        }),
      }),
    );
  });
});

describe('VideoTranscoderWorker Process Pipeline', () => {
  it('instantiates and handles transcode-video job structure', async () => {
    const mockRedis = {
      on: vi.fn(),
      quit: vi.fn(async () => 'OK'),
    };

    const worker = new VideoTranscoderWorker({
      redisClient: mockRedis as never,
      concurrency: 2,
    });

    expect(worker.concurrency).toBe(2);
    expect(worker.transcoder).toBeDefined();
    expect(worker.uploader).toBeDefined();

    // Mock processJob execution
    const mockJob = {
      id: 'job-101',
      data: {
        videoId: 'video-abc',
        sourceKey: 'raw/video-abc.mp4',
        resolutions: ['720p', '360p'] as HlsResolution[],
      } as TranscodeJobData,
      updateProgress: vi.fn(async () => {}),
    };

    // Spy on uploader and transcoder
    vi.spyOn(worker.uploader, 'uploadHlsDirectory').mockResolvedValue({
      masterManifestUrl: 'https://media.quantube.in/videos/video-abc/master.m3u8',
      variantManifestUrls: {
        '720p': 'https://media.quantube.in/videos/video-abc/720p/playlist.m3u8',
        '360p': 'https://media.quantube.in/videos/video-abc/360p/playlist.m3u8',
      },
      uploadedFiles: [],
      totalBytes: 54321,
      uploadedCount: 6,
    });

    vi.spyOn(worker.uploader, 'updateVideoStatus').mockResolvedValue(true);

    const result = await worker.processJob(mockJob as never);

    expect(result.videoId).toBe('video-abc');
    expect(result.masterManifestUrl).toBe('https://media.quantube.in/videos/video-abc/master.m3u8');
    expect(result.variants).toHaveLength(2);
    expect(result.variants[0]?.resolution).toBe('720p');
    expect(result.variants[1]?.resolution).toBe('360p');
    expect(mockJob.updateProgress).toHaveBeenCalledWith(100);
  });
});
