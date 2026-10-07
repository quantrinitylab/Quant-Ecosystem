import { describe, it, expect, vi } from 'vitest';
import { FileIndexHandler, type FileEvent } from './file.handler';
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
    embedText: vi.fn().mockResolvedValue([0.5, 0.6, 0.7]),
  } as unknown as BatchEmbedder;

  return { searchClient, vectorClient, embedder };
}

function createFileEvent(overrides: Partial<FileEvent> = {}): FileEvent {
  return {
    id: 'file-1',
    filename: 'report.pdf',
    description: 'Q4 financial report',
    tags: ['finance', 'quarterly'],
    extractedText: 'Revenue increased by 20% in Q4 2024.',
    mimeType: 'application/pdf',
    userId: 'user-1',
    size: 1024000,
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('FileIndexHandler', () => {
  it('indexes file to MeiliSearch with correct fields (excludes extractedText)', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new FileIndexHandler(searchClient, vectorClient, embedder);
    const event = createFileEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalledWith('files', {
      id: 'file-1',
      filename: 'report.pdf',
      description: 'Q4 financial report',
      tags: ['finance', 'quarterly'],
      mimeType: 'application/pdf',
      userId: 'user-1',
      size: 1024000,
      createdAt: '2024-01-15T10:00:00Z',
    });
  });

  it('generates embedding from filename + description + tags + extractedText', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new FileIndexHandler(searchClient, vectorClient, embedder);
    const event = createFileEvent();

    await handler.handle(event);

    expect(embedder.embedText).toHaveBeenCalledWith(
      'report.pdf Q4 financial report finance quarterly Revenue increased by 20% in Q4 2024.',
    );
  });

  it('upserts vector to Qdrant with file metadata', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new FileIndexHandler(searchClient, vectorClient, embedder);
    const event = createFileEvent();

    await handler.handle(event);

    expect(vectorClient.upsertPoints).toHaveBeenCalledWith('files', [
      {
        id: 'file-1',
        vector: [0.5, 0.6, 0.7],
        payload: {
          type: 'file',
          userId: 'user-1',
          mimeType: 'application/pdf',
          filename: 'report.pdf',
          createdAt: '2024-01-15T10:00:00Z',
        },
      },
    ]);
  });

  it('skips vector upsert when embedding returns empty array', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    (embedder.embedText as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const handler = new FileIndexHandler(searchClient, vectorClient, embedder);
    const event = createFileEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalled();
    expect(vectorClient.upsertPoints).not.toHaveBeenCalled();
  });

  it('throws on invalid payload', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new FileIndexHandler(searchClient, vectorClient, embedder);

    await expect(handler.handle({ id: 'bad' })).rejects.toThrow();
  });
});
