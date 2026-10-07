import { describe, it, expect, vi } from 'vitest';
import { VideoIndexHandler, type VideoEvent } from './video.handler';
import type { SearchClient, VectorClient } from '@quant/search';
import type { BatchEmbedder } from '../embedder';

function createMockDeps() {
  const searchClient = {
    indexDocument: vi.fn().mockResolvedValue(undefined),
  } as unknown as SearchClient;

  const vectorClient = {
    upsertPoints: vi.fn().mockResolvedValue(undefined),
  } as unknown as VectorClient;

  const embedder = {
    embedText: vi.fn().mockResolvedValue([0.2, 0.3, 0.4]),
  } as unknown as BatchEmbedder;

  return { searchClient, vectorClient, embedder };
}

function createVideoEvent(overrides: Partial<VideoEvent> = {}): VideoEvent {
  return {
    id: 'video-1',
    title: 'How to build a search engine',
    description: 'A comprehensive guide to building search engines',
    tags: ['search', 'engineering'],
    transcript: 'Welcome to this tutorial about search engines.',
    userId: 'user-1',
    channelId: 'channel-1',
    visibility: 'public',
    category: 'technology',
    viewCount: 1000,
    publishedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('VideoIndexHandler', () => {
  it('indexes video to MeiliSearch with correct fields (excludes transcript)', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new VideoIndexHandler(searchClient, vectorClient, embedder);
    const event = createVideoEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalledWith('videos', {
      id: 'video-1',
      title: 'How to build a search engine',
      description: 'A comprehensive guide to building search engines',
      tags: ['search', 'engineering'],
      userId: 'user-1',
      channelId: 'channel-1',
      visibility: 'public',
      category: 'technology',
      viewCount: 1000,
      publishedAt: '2024-01-15T10:00:00Z',
    });
  });

  it('generates embedding from title + description + transcript', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new VideoIndexHandler(searchClient, vectorClient, embedder);
    const event = createVideoEvent();

    await handler.handle(event);

    expect(embedder.embedText).toHaveBeenCalledWith(
      'How to build a search engine A comprehensive guide to building search engines Welcome to this tutorial about search engines.',
    );
  });

  it('upserts vector to Qdrant with metadata', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new VideoIndexHandler(searchClient, vectorClient, embedder);
    const event = createVideoEvent();

    await handler.handle(event);

    expect(vectorClient.upsertPoints).toHaveBeenCalledWith('videos', [
      {
        id: 'video-1',
        vector: [0.2, 0.3, 0.4],
        payload: {
          type: 'video',
          userId: 'user-1',
          channelId: 'channel-1',
          visibility: 'public',
          category: 'technology',
          publishedAt: '2024-01-15T10:00:00Z',
        },
      },
    ]);
  });

  it('skips vector upsert when embedding returns empty array', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    (embedder.embedText as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const handler = new VideoIndexHandler(searchClient, vectorClient, embedder);
    const event = createVideoEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalled();
    expect(vectorClient.upsertPoints).not.toHaveBeenCalled();
  });

  it('throws on invalid payload (missing transcript)', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new VideoIndexHandler(searchClient, vectorClient, embedder);

    await expect(handler.handle({ id: 'video-1', title: 'test' })).rejects.toThrow();
  });
});
