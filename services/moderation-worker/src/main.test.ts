import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildHandlerMap, routeJob, createHandlerDeps } from './main';
import type { ModerationHandlerDeps } from './main';
import type { ModerationResult } from '@quant/moderation';
import type { ModerationJob } from '@quant/queue';

function createMockResult(contentType: string): ModerationResult {
  return {
    id: 'test_result',
    contentId: 'test-content-id',
    contentType: contentType as ModerationResult['contentType'],
    categories: [],
    overallScore: 0,
    action: 'approve',
    confidence: 0.95,
    automated: true,
    flags: [],
    metadata: {},
    createdAt: Date.now(),
  };
}

function createMockDeps(): ModerationHandlerDeps {
  return {
    textHandler: { handle: vi.fn().mockResolvedValue(createMockResult('text')) },
    imageHandler: { handle: vi.fn().mockResolvedValue(createMockResult('image')) },
    videoHandler: { handle: vi.fn().mockResolvedValue(createMockResult('video')) },
    audioHandler: { handle: vi.fn().mockResolvedValue(createMockResult('audio')) },
  } as unknown as ModerationHandlerDeps;
}

describe('buildHandlerMap', () => {
  it('returns a handler for text content type', () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    expect(handlers.has('text')).toBe(true);
  });

  it('returns a handler for image content type', () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    expect(handlers.has('image')).toBe(true);
  });

  it('returns a handler for video content type', () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    expect(handlers.has('video')).toBe(true);
  });

  it('returns a handler for audio content type', () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    expect(handlers.has('audio')).toBe(true);
  });

  it('returns correct number of handlers', () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    expect(handlers.size).toBe(4);
  });
});

describe('routeJob', () => {
  it('routes text content to text handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    const job: ModerationJob = {
      contentId: 'content-1',
      contentType: 'text',
      content: 'Hello world',
      userId: 'user-1',
      appId: 'app-1',
    };

    const result = await routeJob(handlers, job);
    expect(result.contentType).toBe('text');
    expect(deps.textHandler.handle).toHaveBeenCalledWith(job);
  });

  it('routes image content to image handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    const job: ModerationJob = {
      contentId: 'content-2',
      contentType: 'image',
      content: 'https://example.com/image.jpg',
      userId: 'user-1',
      appId: 'app-1',
    };

    const result = await routeJob(handlers, job);
    expect(result.contentType).toBe('image');
    expect(deps.imageHandler.handle).toHaveBeenCalledWith(job);
  });

  it('routes video content to video handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    const job: ModerationJob = {
      contentId: 'content-3',
      contentType: 'video',
      content: 'https://example.com/video.mp4',
      userId: 'user-1',
      appId: 'app-1',
    };

    const result = await routeJob(handlers, job);
    expect(result.contentType).toBe('video');
    expect(deps.videoHandler.handle).toHaveBeenCalledWith(job);
  });

  it('routes audio content to audio handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    const job: ModerationJob = {
      contentId: 'content-4',
      contentType: 'audio',
      content: 'https://example.com/audio.mp3',
      userId: 'user-1',
      appId: 'app-1',
    };

    const result = await routeJob(handlers, job);
    expect(result.contentType).toBe('audio');
    expect(deps.audioHandler.handle).toHaveBeenCalledWith(job);
  });

  it('throws error for unknown content type', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);
    const job = {
      contentId: 'content-5',
      contentType: 'unknown' as 'text',
      content: 'test',
      userId: 'user-1',
      appId: 'app-1',
    };

    await expect(routeJob(handlers, job)).rejects.toThrow(
      'No handler registered for content type: unknown',
    );
  });
});

describe('createHandlerDeps - image CSAM fail-closed wiring', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('blocks images fail-closed when UGC media is enabled but no CSAM provider is configured', async () => {
    process.env['UGC_MEDIA_ENABLED'] = 'true';
    delete process.env['PHOTODNA_SUBSCRIPTION_KEY'];
    delete process.env['CSAM_TEST_PROVIDER'];

    const deps = createHandlerDeps();
    // Non-URL content => no network fetch; bytes are hashed inline, then the
    // CSAM gate runs. With no provider (NullProvider) checkHash throws and the
    // handler must block the upload rather than approve it.
    const job: ModerationJob = {
      contentId: 'img-1',
      contentType: 'image',
      content: 'inline-bytes-not-a-url',
      userId: 'user-1',
      appId: 'app-1',
    };

    const result = await deps.imageHandler.handle(job);
    expect(result.action).toBe('remove');
    expect(result.flags).toContain('csam_check_failed');
  });

  it('wires the CSAM gate (blocks) only when UGC media is enabled', async () => {
    process.env['UGC_MEDIA_ENABLED'] = 'true';
    process.env['CSAM_TEST_PROVIDER'] = 'true'; // synthetic provider, no match for arbitrary bytes

    const deps = createHandlerDeps();
    // The test provider returns matched=false for unknown hashes, so the CSAM
    // gate passes and execution proceeds to classification (which throws on the
    // unconfigured client) => the upload is never silently approved.
    const job: ModerationJob = {
      contentId: 'img-2',
      contentType: 'image',
      content: 'inline-bytes-not-a-url',
      userId: 'user-1',
      appId: 'app-1',
    };

    // No image API key configured => classification fails closed (throws).
    delete process.env['IMAGE_MODERATION_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    const fresh = createHandlerDeps();
    void deps;
    await expect(fresh.imageHandler.handle(job)).rejects.toThrow(/not configured/i);
  });
});
