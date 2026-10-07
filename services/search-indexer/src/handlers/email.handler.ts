// ============================================================================
// Email Index Handler - Indexes email events to MeiliSearch + Qdrant
// ============================================================================

import { z } from 'zod';
import type { SearchClient, VectorClient } from '@quant/search';
import type { BatchEmbedder } from '../embedder';

export const EmailEventSchema = z.object({
  id: z.string(),
  subject: z.string(),
  bodyPlain: z.string(),
  fromAddress: z.string(),
  fromName: z.string(),
  toAddresses: z.array(z.string()),
  userId: z.string(),
  folderId: z.string(),
  receivedAt: z.string(),
  isRead: z.boolean(),
  isStarred: z.boolean(),
});

export type EmailEvent = z.infer<typeof EmailEventSchema>;

const EMAILS_INDEX = 'emails';
const EMAILS_COLLECTION = 'emails';

/**
 * EmailIndexHandler
 *
 * Handles email.created events by indexing content to both
 * MeiliSearch (full-text) and Qdrant (vector similarity).
 */
export class EmailIndexHandler {
  constructor(
    private readonly searchClient: SearchClient,
    private readonly vectorClient: VectorClient,
    private readonly embedder: BatchEmbedder,
  ) {}

  async handle(payload: unknown): Promise<void> {
    const event = EmailEventSchema.parse(payload);

    const textToEmbed = `${event.subject} ${event.bodyPlain}`;
    const vector = await this.embedder.embedText(textToEmbed);

    await this.searchClient.indexDocument(EMAILS_INDEX, {
      id: event.id,
      subject: event.subject,
      bodyPlain: event.bodyPlain,
      fromAddress: event.fromAddress,
      fromName: event.fromName,
      toAddresses: event.toAddresses,
      userId: event.userId,
      folderId: event.folderId,
      receivedAt: event.receivedAt,
      isRead: event.isRead,
      isStarred: event.isStarred,
    });

    if (vector.length > 0) {
      await this.vectorClient.upsertPoints(EMAILS_COLLECTION, [
        {
          id: event.id,
          vector,
          payload: {
            type: 'email',
            userId: event.userId,
            subject: event.subject,
            fromName: event.fromName,
            receivedAt: event.receivedAt,
          },
        },
      ]);
    }
  }
}
