import { z } from 'zod';
import { SurfaceSchema, ContentTypeSchema, type PublishIntent, type Surface } from './types.js';
import { PublishIntentService } from './publish-intent.js';

export const CrossPublishJobSchema = z.object({
  intentId: z.string().uuid(),
  surface: SurfaceSchema,
  contentId: z.string().min(1),
  contentType: ContentTypeSchema,
  mediaUrl: z.string().url(),
  title: z.string(),
  description: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export type CrossPublishJob = z.infer<typeof CrossPublishJobSchema>;

export interface QueueAdapter {
  add(jobName: string, payload: CrossPublishJob): Promise<string>;
}

export class PublishFanoutService {
  private readonly intentService: PublishIntentService;
  private readonly queue: QueueAdapter;

  constructor(intentService: PublishIntentService, queue: QueueAdapter) {
    this.intentService = intentService;
    this.queue = queue;
  }

  async fanOut(intent: PublishIntent): Promise<string[]> {
    this.intentService.updateStatus(intent.id, 'processing');

    const jobIds: string[] = [];
    const errors: Array<{ surface: Surface; error: string }> = [];

    for (const surface of intent.surfaces) {
      try {
        const payload: CrossPublishJob = {
          intentId: intent.id,
          surface,
          contentId: intent.contentId,
          contentType: intent.contentType,
          mediaUrl: intent.mediaUrl,
          title: intent.title,
          description: intent.description,
          metadata: intent.metadata,
        };
        const jobId = await this.queue.add(`publish:${surface}`, payload);
        jobIds.push(jobId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ surface, error: message });
      }
    }

    if (errors.length === intent.surfaces.length) {
      this.intentService.updateStatus(intent.id, 'failed');
    } else if (errors.length > 0) {
      this.intentService.updateStatus(intent.id, 'partial');
    }

    return jobIds;
  }

  getStatus(intentId: string): { status: string; results: unknown[] } | undefined {
    const intent = this.intentService.getById(intentId);
    if (!intent) return undefined;
    return {
      status: intent.status,
      results: this.intentService.getResults(intentId),
    };
  }
}
