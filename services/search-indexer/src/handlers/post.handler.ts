// ============================================================================
// Post Index Handler - Indexes social post events to MeiliSearch + Qdrant
// ============================================================================

import { z } from 'zod';
import type { SearchClient, VectorClient } from '@quant/search';
import type { BatchEmbedder } from '../embedder';

export const PostEventSchema = z.object({
  id: z.string(),
  content: z.string(),
  hashtags: z.array(z.string()),
  userId: z.string(),
  communityId: z.string(),
  visibility: z.string(),
  type: z.string(),
  publishedAt: z.string(),
});

export type PostEvent = z.infer<typeof PostEventSchema>;

const POSTS_INDEX = 'posts';
const POSTS_COLLECTION = 'posts';

/**
 * PostIndexHandler
 *
 * Handles post.created and post.updated events by indexing content
 * to both MeiliSearch (full-text) and Qdrant (vector similarity).
 */
export class PostIndexHandler {
  constructor(
    private readonly searchClient: SearchClient,
    private readonly vectorClient: VectorClient,
    private readonly embedder: BatchEmbedder,
  ) {}

  async handle(payload: unknown): Promise<void> {
    const event = PostEventSchema.parse(payload);

    const hashtagText = event.hashtags.join(' ');
    const textToEmbed = `${event.content} ${hashtagText}`.trim();
    const vector = await this.embedder.embedText(textToEmbed);

    await this.searchClient.indexDocument(POSTS_INDEX, {
      id: event.id,
      content: event.content,
      hashtags: event.hashtags,
      userId: event.userId,
      communityId: event.communityId,
      visibility: event.visibility,
      type: event.type,
      publishedAt: event.publishedAt,
    });

    if (vector.length > 0) {
      await this.vectorClient.upsertPoints(POSTS_COLLECTION, [
        {
          id: event.id,
          vector,
          payload: {
            type: 'post',
            userId: event.userId,
            communityId: event.communityId,
            visibility: event.visibility,
            publishedAt: event.publishedAt,
          },
        },
      ]);
    }
  }
}
