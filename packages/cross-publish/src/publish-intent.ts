import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  SurfaceSchema,
  ContentTypeSchema,
  PublishStatusSchema,
  type PublishIntent,
  type PublishStatus,
  type SurfaceResult,
} from './types.js';

export const PublishIntentSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  contentId: z.string().min(1),
  contentType: ContentTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  surfaces: z.array(SurfaceSchema).min(1),
  mediaUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.coerce.date(),
  status: PublishStatusSchema,
});

export const CreatePublishIntentSchema = z.object({
  userId: z.string().min(1),
  contentId: z.string().min(1),
  contentType: ContentTypeSchema,
  title: z.string().min(1),
  description: z.string(),
  surfaces: z.array(SurfaceSchema).min(1),
  mediaUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export type CreatePublishIntentInput = z.infer<typeof CreatePublishIntentSchema>;

export interface ListFilters {
  status?: PublishStatus;
  contentType?: string;
}

export class PublishIntentService {
  private readonly store = new Map<string, PublishIntent>();
  private readonly results = new Map<string, SurfaceResult[]>();

  create(input: CreatePublishIntentInput): PublishIntent {
    const validated = CreatePublishIntentSchema.parse(input);
    const intent: PublishIntent = {
      id: randomUUID(),
      userId: validated.userId,
      contentId: validated.contentId,
      contentType: validated.contentType,
      title: validated.title,
      description: validated.description,
      surfaces: validated.surfaces,
      mediaUrl: validated.mediaUrl,
      thumbnailUrl: validated.thumbnailUrl,
      metadata: validated.metadata,
      createdAt: new Date(),
      status: 'pending',
    };
    this.store.set(intent.id, intent);
    return intent;
  }

  getById(id: string): PublishIntent | undefined {
    return this.store.get(id);
  }

  updateStatus(id: string, status: PublishStatus, results?: SurfaceResult[]): PublishIntent {
    const intent = this.store.get(id);
    if (!intent) {
      throw new Error(`PublishIntent not found: ${id}`);
    }
    intent.status = status;
    if (results) {
      this.results.set(id, results);
    }
    this.store.set(id, intent);
    return intent;
  }

  getResults(id: string): SurfaceResult[] {
    return this.results.get(id) ?? [];
  }

  list(userId: string, filters?: ListFilters): PublishIntent[] {
    const intents: PublishIntent[] = [];
    for (const intent of this.store.values()) {
      if (intent.userId !== userId) continue;
      if (filters?.status && intent.status !== filters.status) continue;
      if (filters?.contentType && intent.contentType !== filters.contentType) continue;
      intents.push(intent);
    }
    return intents;
  }
}
