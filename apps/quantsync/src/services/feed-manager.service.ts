// ============================================================================
// QuantSync - Feed Manager Service
// Cursor-based pagination, deduplication, and seen-tracking for social feeds
// ============================================================================

export interface FeedItem {
  id: string;
  type: 'post' | 'repost' | 'reply';
  content: string;
  author: { id: string; name: string };
  createdAt: number;
  engagementScore: number;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class FeedManagerService {
  private feedItems: FeedItem[] = [];
  private seenIds: Set<string> = new Set();

  addToFeed(item: FeedItem): void {
    // Prevent duplicates
    if (!this.feedItems.some((existing) => existing.id === item.id)) {
      this.feedItems.push(item);
      // Sort by engagement score descending, then by createdAt descending
      this.feedItems.sort((a, b) => {
        if (b.engagementScore !== a.engagementScore) {
          return b.engagementScore - a.engagementScore;
        }
        return b.createdAt - a.createdAt;
      });
    }
  }

  loadPage(cursor: string | null, pageSize: number): FeedPage {
    let startIndex = 0;

    if (cursor) {
      const cursorIndex = this.feedItems.findIndex((item) => item.id === cursor);
      if (cursorIndex !== -1) {
        startIndex = cursorIndex + 1;
      }
    }

    const items = this.feedItems.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < this.feedItems.length;
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem ? lastItem.id : null;

    return { items, nextCursor, hasMore };
  }

  refresh(): FeedPage {
    return this.loadPage(null, 20);
  }

  markSeen(itemIds: string[]): void {
    for (const id of itemIds) {
      this.seenIds.add(id);
    }
  }

  getSeenCount(): number {
    return this.seenIds.size;
  }

  deduplicateItems(items: FeedItem[]): FeedItem[] {
    const seen = new Set<string>();
    const deduplicated: FeedItem[] = [];

    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }
}
