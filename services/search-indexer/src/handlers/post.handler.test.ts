import { describe, it, expect, vi } from 'vitest';
import { PostIndexHandler, type PostEvent } from './post.handler';
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
    embedText: vi.fn().mockResolvedValue([0.7, 0.8, 0.9]),
  } as unknown as BatchEmbedder;

  return { searchClient, vectorClient, embedder };
}

function createPostEvent(overrides: Partial<PostEvent> = {}): PostEvent {
  return {
    id: 'post-1',
    content: 'Check out this amazing feature!',
    hashtags: ['#tech', '#launch'],
    userId: 'user-1',
    communityId: 'community-1',
    visibility: 'public',
    type: 'text',
    publishedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('PostIndexHandler', () => {
  it('indexes post to MeiliSearch with correct fields', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new PostIndexHandler(searchClient, vectorClient, embedder);
    const event = createPostEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalledWith('posts', {
      id: 'post-1',
      content: 'Check out this amazing feature!',
      hashtags: ['#tech', '#launch'],
      userId: 'user-1',
      communityId: 'community-1',
      visibility: 'public',
      type: 'text',
      publishedAt: '2024-01-15T10:00:00Z',
    });
  });

  it('generates embedding from content + hashtags and upserts to Qdrant', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new PostIndexHandler(searchClient, vectorClient, embedder);
    const event = createPostEvent();

    await handler.handle(event);

    expect(embedder.embedText).toHaveBeenCalledWith(
      'Check out this amazing feature! #tech #launch',
    );
    expect(vectorClient.upsertPoints).toHaveBeenCalledWith('posts', [
      {
        id: 'post-1',
        vector: [0.7, 0.8, 0.9],
        payload: {
          type: 'post',
          userId: 'user-1',
          communityId: 'community-1',
          visibility: 'public',
          publishedAt: '2024-01-15T10:00:00Z',
        },
      },
    ]);
  });

  it('skips vector upsert when embedding returns empty array', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    (embedder.embedText as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const handler = new PostIndexHandler(searchClient, vectorClient, embedder);
    const event = createPostEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalled();
    expect(vectorClient.upsertPoints).not.toHaveBeenCalled();
  });

  it('throws on invalid payload', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new PostIndexHandler(searchClient, vectorClient, embedder);

    await expect(handler.handle({ id: 'bad' })).rejects.toThrow();
  });
});
