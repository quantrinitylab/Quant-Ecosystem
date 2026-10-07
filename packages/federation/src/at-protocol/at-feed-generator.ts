import { z } from 'zod';

export const FeedAlgorithmSchema = z.object({
  feedId: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  createdAt: z.string(),
});

export type FeedAlgorithm = z.infer<typeof FeedAlgorithmSchema>;

export interface FeedItem {
  post: string; // AT URI
  feedContext?: string;
}

export interface FeedResult {
  feed: FeedItem[];
  cursor?: string;
}

export type FeedGeneratorFn = (cursor?: string, limit?: number) => FeedResult;

export class ATFeedGenerator {
  private feeds: Map<string, FeedAlgorithm> = new Map();
  private algorithms: Map<string, FeedGeneratorFn> = new Map();
  private subscriptions: Map<string, Set<string>> = new Map();

  registerFeed(feedId: string, algorithm: FeedGeneratorFn): FeedAlgorithm {
    const feed: FeedAlgorithm = {
      feedId,
      displayName: feedId,
      createdAt: new Date().toISOString(),
    };

    this.feeds.set(feedId, feed);
    this.algorithms.set(feedId, algorithm);

    return feed;
  }

  generateFeed(feedId: string, cursor?: string, limit = 50): FeedResult | null {
    const algorithm = this.algorithms.get(feedId);
    if (!algorithm) return null;
    return algorithm(cursor, limit);
  }

  getSubscriptions(did: string): string[] {
    const subs = this.subscriptions.get(did);
    return subs ? [...subs] : [];
  }

  subscribe(did: string, feedId: string): boolean {
    if (!this.feeds.has(feedId)) return false;

    const subs = this.subscriptions.get(did) ?? new Set();
    if (subs.has(feedId)) return false;
    subs.add(feedId);
    this.subscriptions.set(did, subs);
    return true;
  }

  unsubscribe(did: string, feedId: string): boolean {
    const subs = this.subscriptions.get(did);
    if (!subs) return false;
    return subs.delete(feedId);
  }

  getRegisteredFeeds(): FeedAlgorithm[] {
    return [...this.feeds.values()];
  }
}
