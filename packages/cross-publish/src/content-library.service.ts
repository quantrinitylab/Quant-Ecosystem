import { randomUUID } from 'node:crypto';
import type { ContentType, ContentLibraryItem } from './types.js';

export interface StoreContentInput {
  contentType: ContentType;
  title: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl: string;
  metadata?: Record<string, unknown>;
}

export interface ContentListFilters {
  contentType?: ContentType;
}

export class ContentLibraryService {
  private readonly store = new Map<string, ContentLibraryItem>();

  storeContent(userId: string, content: StoreContentInput): ContentLibraryItem {
    const item: ContentLibraryItem = {
      id: randomUUID(),
      userId,
      contentType: content.contentType,
      title: content.title,
      description: content.description,
      mediaUrl: content.mediaUrl,
      thumbnailUrl: content.thumbnailUrl,
      metadata: content.metadata ?? {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.store.set(item.id, item);
    return item;
  }

  getById(id: string): ContentLibraryItem | undefined {
    return this.store.get(id);
  }

  list(userId: string, filters?: ContentListFilters): ContentLibraryItem[] {
    const items: ContentLibraryItem[] = [];
    for (const item of this.store.values()) {
      if (item.userId !== userId) continue;
      if (filters?.contentType && item.contentType !== filters.contentType) continue;
      items.push(item);
    }
    return items;
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }
}
