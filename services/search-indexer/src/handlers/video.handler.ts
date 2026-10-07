// ============================================================================
// Video Index Handler - Indexes video events to MeiliSearch + Qdrant
// ============================================================================

import { z } from 'zod';
import type { SearchClient, VectorClient } from '@quant/search';
import type { BatchEmbedder } from '../embedder';

export const VideoEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  transcript: z.string(),
  userId: z.string(),
  channelId: z.string(),
  visibility: z.string(),
  category: z.string(),
  viewCount: z.number(),
  publishedAt: z.string(),
});

export type VideoEvent = z.infer<typeof VideoEventSchema>;

const VIDEOS_INDEX = 'videos';
const VIDEOS_COLLECTION = 'videos';

/**
 * VideoIndexHandler
 *
 * Handles video.transcribed events. Only indexes once the transcript
 * is available (the event fires after transcription is complete).
 * Embeds title + description + transcript for rich vector search.
 */
export class VideoIndexHandler {
  constructor(
    private readonly searchClient: SearchClient,
    private readonly vectorClient: VectorClient,
    private readonly embedder: BatchEmbedder,
  ) {}

  async handle(payload: unknown): Promise<void> {
    const event = VideoEventSchema.parse(payload);

    const textToEmbed = `${event.title} ${event.description} ${event.transcript}`.trim();
    const vector = await this.embedder.embedText(textToEmbed);

    await this.searchClient.indexDocument(VIDEOS_INDEX, {
      id: event.id,
      title: event.title,
      description: event.description,
      tags: event.tags,
      userId: event.userId,
      channelId: event.channelId,
      visibility: event.visibility,
      category: event.category,
      viewCount: event.viewCount,
      publishedAt: event.publishedAt,
    });

    if (vector.length > 0) {
      await this.vectorClient.upsertPoints(VIDEOS_COLLECTION, [
        {
          id: event.id,
          vector,
          payload: {
            type: 'video',
            userId: event.userId,
            channelId: event.channelId,
            visibility: event.visibility,
            category: event.category,
            publishedAt: event.publishedAt,
          },
        },
      ]);
    }
  }
}
