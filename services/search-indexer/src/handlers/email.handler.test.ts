import { describe, it, expect, vi } from 'vitest';
import { EmailIndexHandler, type EmailEvent } from './email.handler';
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
    embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  } as unknown as BatchEmbedder;

  return { searchClient, vectorClient, embedder };
}

function createEmailEvent(overrides: Partial<EmailEvent> = {}): EmailEvent {
  return {
    id: 'email-1',
    subject: 'Test Subject',
    bodyPlain: 'Hello, this is a test email body.',
    fromAddress: 'john@example.com',
    fromName: 'John Doe',
    toAddresses: ['jane@example.com'],
    userId: 'user-1',
    folderId: 'inbox',
    receivedAt: '2024-01-15T10:00:00Z',
    isRead: false,
    isStarred: false,
    ...overrides,
  };
}

describe('EmailIndexHandler', () => {
  it('indexes email to MeiliSearch with correct fields', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new EmailIndexHandler(searchClient, vectorClient, embedder);
    const event = createEmailEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalledWith('emails', {
      id: 'email-1',
      subject: 'Test Subject',
      bodyPlain: 'Hello, this is a test email body.',
      fromAddress: 'john@example.com',
      fromName: 'John Doe',
      toAddresses: ['jane@example.com'],
      userId: 'user-1',
      folderId: 'inbox',
      receivedAt: '2024-01-15T10:00:00Z',
      isRead: false,
      isStarred: false,
    });
  });

  it('generates embedding from subject + body and upserts to Qdrant', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new EmailIndexHandler(searchClient, vectorClient, embedder);
    const event = createEmailEvent();

    await handler.handle(event);

    expect(embedder.embedText).toHaveBeenCalledWith(
      'Test Subject Hello, this is a test email body.',
    );
    expect(vectorClient.upsertPoints).toHaveBeenCalledWith('emails', [
      {
        id: 'email-1',
        vector: [0.1, 0.2, 0.3],
        payload: {
          type: 'email',
          userId: 'user-1',
          subject: 'Test Subject',
          fromName: 'John Doe',
          receivedAt: '2024-01-15T10:00:00Z',
        },
      },
    ]);
  });

  it('skips vector upsert when embedding returns empty array', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    (embedder.embedText as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const handler = new EmailIndexHandler(searchClient, vectorClient, embedder);
    const event = createEmailEvent();

    await handler.handle(event);

    expect(searchClient.indexDocument).toHaveBeenCalled();
    expect(vectorClient.upsertPoints).not.toHaveBeenCalled();
  });

  it('throws on invalid payload', async () => {
    const { searchClient, vectorClient, embedder } = createMockDeps();
    const handler = new EmailIndexHandler(searchClient, vectorClient, embedder);

    await expect(handler.handle({ id: 'bad' })).rejects.toThrow();
  });
});
