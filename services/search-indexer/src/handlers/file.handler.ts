// ============================================================================
// File Index Handler - Indexes file upload events to MeiliSearch + Qdrant
// ============================================================================

import { z } from 'zod';
import type { SearchClient, VectorClient } from '@quant/search';
import type { BatchEmbedder } from '../embedder';

export const FileEventSchema = z.object({
  id: z.string(),
  filename: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  extractedText: z.string(),
  mimeType: z.string(),
  userId: z.string(),
  size: z.number(),
  createdAt: z.string(),
});

export type FileEvent = z.infer<typeof FileEventSchema>;

const FILES_INDEX = 'files';
const FILES_COLLECTION = 'files';

/**
 * FileIndexHandler
 *
 * Handles file.uploaded events by indexing file metadata and extracted
 * text content to both MeiliSearch (full-text) and Qdrant (vector).
 * Text extraction for pdf/docx is assumed to have already happened
 * upstream before the event is published.
 */
export class FileIndexHandler {
  constructor(
    private readonly searchClient: SearchClient,
    private readonly vectorClient: VectorClient,
    private readonly embedder: BatchEmbedder,
  ) {}

  async handle(payload: unknown): Promise<void> {
    const event = FileEventSchema.parse(payload);

    const tagText = event.tags.join(' ');
    const textToEmbed =
      `${event.filename} ${event.description} ${tagText} ${event.extractedText}`.trim();
    const vector = await this.embedder.embedText(textToEmbed);

    await this.searchClient.indexDocument(FILES_INDEX, {
      id: event.id,
      filename: event.filename,
      description: event.description,
      tags: event.tags,
      mimeType: event.mimeType,
      userId: event.userId,
      size: event.size,
      createdAt: event.createdAt,
    });

    if (vector.length > 0) {
      await this.vectorClient.upsertPoints(FILES_COLLECTION, [
        {
          id: event.id,
          vector,
          payload: {
            type: 'file',
            userId: event.userId,
            mimeType: event.mimeType,
            filename: event.filename,
            createdAt: event.createdAt,
          },
        },
      ]);
    }
  }
}
