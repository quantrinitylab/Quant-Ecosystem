// ============================================================================
// Message Index Handler - Indexes chat message events to MeiliSearch + Qdrant
// ============================================================================

import { z } from 'zod';
import type { SearchClient, VectorClient } from '@quant/search';
import type { BatchEmbedder } from '../embedder';

export const MessageEventSchema = z.object({
  id: z.string(),
  content: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  type: z.string(),
  createdAt: z.string(),
});

export type MessageEvent = z.infer<typeof MessageEventSchema>;

const MESSAGES_INDEX = 'messages';
const MESSAGES_COLLECTION = 'messages';

/**
 * MessageIndexHandler
 *
 * Handles message.created events by indexing content to both
 * MeiliSearch (full-text) and Qdrant (vector similarity).
 */
export class MessageIndexHandler {
  constructor(
    private readonly searchClient: SearchClient,
    private readonly vectorClient: VectorClient,
    private readonly embedder: BatchEmbedder,
  ) {}

  async handle(payload: unknown): Promise<void> {
    const event = MessageEventSchema.parse(payload);

    const vector = await this.embedder.embedText(event.content);

    await this.searchClient.indexDocument(MESSAGES_INDEX, {
      id: event.id,
      content: event.content,
      conversationId: event.conversationId,
      senderId: event.senderId,
      type: event.type,
      createdAt: event.createdAt,
    });

    if (vector.length > 0) {
      await this.vectorClient.upsertPoints(MESSAGES_COLLECTION, [
        {
          id: event.id,
          vector,
          payload: {
            type: 'message',
            conversationId: event.conversationId,
            senderId: event.senderId,
            createdAt: event.createdAt,
          },
        },
      ]);
    }
  }
}
