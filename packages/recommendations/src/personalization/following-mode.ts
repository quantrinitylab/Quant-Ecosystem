// ============================================================================
// Following Mode - Pure reverse-chronological feed of followed accounts
// ============================================================================

export interface SocialGraph {
  getFollowing(userId: string): string[];
}

export interface ContentPost {
  id: string;
  authorId: string;
  content: string;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface ContentStore {
  getPostsByAuthors(
    authorIds: string[],
    options: { limit: number; offset: number; before?: number },
  ): ContentPost[];
  countPostsByAuthors?(authorIds: string[]): number;
}

export interface FollowingFeedResult {
  items: ContentPost[];
  page: number;
  pageSize: number;
  totalAvailable: number;
}

export class FollowingMode {
  private socialGraph: SocialGraph;
  private contentStore: ContentStore;

  constructor(socialGraph: SocialGraph, contentStore: ContentStore) {
    this.socialGraph = socialGraph;
    this.contentStore = contentStore;
  }

  getFeed(userId: string, page: number, pageSize: number): FollowingFeedResult {
    const following = this.socialGraph.getFollowing(userId);

    if (following.length === 0) {
      return { items: [], page, pageSize, totalAvailable: 0 };
    }

    const offset = (page - 1) * pageSize;

    // Delegate pagination to the content store rather than loading all posts into memory.
    // We fetch one extra item beyond the page to determine if more results exist.
    const items = this.contentStore.getPostsByAuthors(following, {
      limit: pageSize,
      offset,
    });

    // Sort by timestamp descending (pure chronological) within the page
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Use the optional count method if available, otherwise estimate from results
    const totalAvailable = this.contentStore.countPostsByAuthors
      ? this.contentStore.countPostsByAuthors(following)
      : offset + items.length + (items.length === pageSize ? 1 : 0);

    return {
      items,
      page,
      pageSize,
      totalAvailable,
    };
  }
}
