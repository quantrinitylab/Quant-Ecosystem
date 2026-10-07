import { describe, it, expect, vi } from 'vitest';
import {
  buildHandlerMap,
  routeEvent,
  retryWithBackoff,
  deadLetterPublish,
  type IndexerDeps,
  type EventPayload,
} from './main';
import type { Producer } from 'kafkajs';
import type { SearchClient, VectorClient } from '@quant/search';
import { SavedSearchService } from '@quant/search';
import type { BatchEmbedder } from './embedder';

function createMockDeps(): IndexerDeps {
  const searchClient = {
    indexDocument: vi.fn().mockResolvedValue(undefined),
  } as unknown as SearchClient;

  const vectorClient = {
    upsertPoints: vi.fn().mockResolvedValue(undefined),
  } as unknown as VectorClient;

  const embedder = {
    embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
  } as unknown as BatchEmbedder;

  const savedSearchService = new SavedSearchService();

  return { searchClient, vectorClient, embedder, savedSearchService };
}

describe('Event Routing', () => {
  it('routes email.created to email handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);

    const event: EventPayload = {
      type: 'email.created',
      payload: {
        id: 'email-1',
        subject: 'Test',
        bodyPlain: 'Body',
        fromAddress: 'a@b.com',
        fromName: 'A',
        toAddresses: ['b@c.com'],
        userId: 'user-1',
        folderId: 'inbox',
        receivedAt: '2024-01-15T10:00:00Z',
        isRead: false,
        isStarred: false,
      },
    };

    await routeEvent(handlers, event);

    expect(deps.searchClient.indexDocument).toHaveBeenCalledWith('emails', expect.any(Object));
  });

  it('routes message.created to message handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);

    const event: EventPayload = {
      type: 'message.created',
      payload: {
        id: 'msg-1',
        content: 'Hello',
        conversationId: 'conv-1',
        senderId: 'user-1',
        type: 'text',
        createdAt: '2024-01-15T10:00:00Z',
      },
    };

    await routeEvent(handlers, event);

    expect(deps.searchClient.indexDocument).toHaveBeenCalledWith('messages', expect.any(Object));
  });

  it('routes post.created to post handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);

    const event: EventPayload = {
      type: 'post.created',
      payload: {
        id: 'post-1',
        content: 'Hello world',
        hashtags: ['#hello'],
        userId: 'user-1',
        communityId: 'c-1',
        visibility: 'public',
        type: 'text',
        publishedAt: '2024-01-15T10:00:00Z',
      },
    };

    await routeEvent(handlers, event);

    expect(deps.searchClient.indexDocument).toHaveBeenCalledWith('posts', expect.any(Object));
  });

  it('routes post.updated to post handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);

    const event: EventPayload = {
      type: 'post.updated',
      payload: {
        id: 'post-1',
        content: 'Updated',
        hashtags: [],
        userId: 'user-1',
        communityId: 'c-1',
        visibility: 'public',
        type: 'text',
        publishedAt: '2024-01-15T10:00:00Z',
      },
    };

    await routeEvent(handlers, event);

    expect(deps.searchClient.indexDocument).toHaveBeenCalledWith('posts', expect.any(Object));
  });

  it('routes video.transcribed to video handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);

    const event: EventPayload = {
      type: 'video.transcribed',
      payload: {
        id: 'vid-1',
        title: 'Title',
        description: 'Desc',
        tags: ['tag1'],
        transcript: 'Transcript text',
        userId: 'user-1',
        channelId: 'ch-1',
        visibility: 'public',
        category: 'tech',
        viewCount: 100,
        publishedAt: '2024-01-15T10:00:00Z',
      },
    };

    await routeEvent(handlers, event);

    expect(deps.searchClient.indexDocument).toHaveBeenCalledWith('videos', expect.any(Object));
  });

  it('routes file.uploaded to file handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);

    const event: EventPayload = {
      type: 'file.uploaded',
      payload: {
        id: 'file-1',
        filename: 'doc.pdf',
        description: 'A document',
        tags: ['doc'],
        extractedText: 'Contents of the document',
        mimeType: 'application/pdf',
        userId: 'user-1',
        size: 5000,
        createdAt: '2024-01-15T10:00:00Z',
      },
    };

    await routeEvent(handlers, event);

    expect(deps.searchClient.indexDocument).toHaveBeenCalledWith('files', expect.any(Object));
  });

  it('routes user.created to user handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);

    const event: EventPayload = {
      type: 'user.created',
      payload: {
        id: 'user-1',
        username: 'john',
        displayName: 'John',
        bio: 'Hi',
        role: 'user',
        status: 'active',
        createdAt: '2024-01-15T10:00:00Z',
      },
    };

    await routeEvent(handlers, event);

    expect(deps.searchClient.indexDocument).toHaveBeenCalledWith('users', expect.any(Object));
  });

  it('routes user.updated to user handler', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);

    const event: EventPayload = {
      type: 'user.updated',
      payload: {
        id: 'user-1',
        username: 'john',
        displayName: 'John D.',
        bio: 'Updated',
        role: 'admin',
        status: 'active',
        createdAt: '2024-01-15T10:00:00Z',
      },
    };

    await routeEvent(handlers, event);

    expect(deps.searchClient.indexDocument).toHaveBeenCalledWith('users', expect.any(Object));
  });

  it('does not throw for unknown event types', async () => {
    const deps = createMockDeps();
    const handlers = buildHandlerMap(deps);

    const event: EventPayload = {
      type: 'unknown.event',
      payload: {},
    };

    await expect(routeEvent(handlers, event)).resolves.toBeUndefined();
    expect(deps.searchClient.indexDocument).not.toHaveBeenCalled();
  });
});

function createMockProducer(): Producer {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  } as unknown as Producer;
}

function createMockLogger() {
  return {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  } as unknown as Parameters<typeof retryWithBackoff>[5];
}

describe('retryWithBackoff', () => {
  it('succeeds on third attempt after two failures', async () => {
    const producer = createMockProducer();
    const mockLogger = createMockLogger();
    const event: EventPayload = { type: 'test.event', payload: { id: '1' } };

    let callCount = 0;
    const handler = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw new Error(`fail-${callCount}`);
      }
    });

    await retryWithBackoff(handler, 3, event, producer, 'test-topic', mockLogger);

    expect(handler).toHaveBeenCalledTimes(3);
    expect(producer.send as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('publishes to DLQ after all retries are exhausted', async () => {
    const producer = createMockProducer();
    const mockLogger = createMockLogger();
    const event: EventPayload = { type: 'test.event', payload: { id: '2' } };

    const handler = vi.fn().mockRejectedValue(new Error('permanent failure'));

    await expect(
      retryWithBackoff(handler, 3, event, producer, 'test-topic', mockLogger),
    ).rejects.toThrow('permanent failure');

    expect(handler).toHaveBeenCalledTimes(3);
    expect(producer.send as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(1);

    const sendCall = (producer.send as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(sendCall.topic).toBe('test-topic.dlq');

    const payload = JSON.parse(sendCall.messages[0].value as string);
    expect(payload.originalEvent).toEqual(event);
    expect(payload.error).toBe('permanent failure');
    expect(payload.failedAt).toBeDefined();
  });
});

describe('deadLetterPublish', () => {
  it('logs error and does not throw when DLQ publish fails', async () => {
    const producer = createMockProducer();
    (producer.send as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('kafka down'));
    const mockLogger = createMockLogger();
    const event: EventPayload = { type: 'test.event', payload: { id: '3' } };

    await expect(
      deadLetterPublish(producer, 'test-topic', event, new Error('original'), mockLogger),
    ).resolves.toBeUndefined();

    expect(mockLogger.error as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'test.event' }),
      'Failed to publish to dead letter queue',
    );
  });
});
