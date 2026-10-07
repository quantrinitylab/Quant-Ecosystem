import { describe, it, expect, vi } from 'vitest';
import { MessageIndexHandler, type MessageEvent } from './message.handler';
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
    embedText: vi.fn().mockResolvedValue([0.4, 0.5, 0.6]),
  } as unknown as BatchEmbedder;

  return { searchClient, vectorClient, embedder };
}

function createMessageEvent(overrides: Partial<MessageEvent> = {}): MessageEvent {
  return {
    id: 'msg-1',
    content: 'Hey, how are you?',
    conversationId: 'conv-1',
    senderId: 'user-1',
    type: 'text',
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('MessageIndexHandler', () => {
  it('indexes message to MeiliSearch with correct fields', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new MessageIndexHandler(searchClient, vectorClient, embedder);
    const event = createMessageEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalledWith('messages', {
      id: 'msg-1',
      content: 'Hey, how are you?',
      conversationId: 'conv-1',
      senderId: 'user-1',
      type: 'text',
      createdAt: '2024-01-15T10:00:00Z',
    });
  });

  it('generates embedding from content and upserts to Qdrant', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new MessageIndexHandler(searchClient, vectorClient, embedder);
    const event = createMessageEvent();

    await handler.handle(event);

    expect(embedder.embedText).toHaveBeenCalledWith('Hey, how are you?');
    expect(vectorClient.upsertPoints).toHaveBeenCalledWith('messages', [
      {
        id: 'msg-1',
        vector: [0.4, 0.5, 0.6],
        payload: {
          type: 'message',
          conversationId: 'conv-1',
          senderId: 'user-1',
          createdAt: '2024-01-15T10:00:00Z',
        },
      },
    ]);
  });

  it('skips vector upsert when embedding returns empty array', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    (embedder.embedText as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const handler = new MessageIndexHandler(searchClient, vectorClient, embedder);
    const event = createMessageEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalled();
    expect(vectorClient.upsertPoints).not.toHaveBeenCalled();
  });

  it('throws on invalid payload', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new MessageIndexHandler(searchClient, vectorClient, embedder);

    await expect(handler.handle({ id: 'bad' })).rejects.toThrow();
  });
});
