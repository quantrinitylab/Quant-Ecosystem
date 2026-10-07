import { z } from 'zod';

export const ATPostSchema = z.object({
  uri: z.string(),
  cid: z.string(),
  did: z.string(),
  content: z.string(),
  createdAt: z.string(),
});

export type ATPost = z.infer<typeof ATPostSchema>;

export const ATTimelineItemSchema = z.object({
  post: ATPostSchema,
  reason: z.string().optional(),
});

export type ATTimelineItem = z.infer<typeof ATTimelineItemSchema>;

export interface ATFeedResponse {
  feed: ATTimelineItem[];
  cursor?: string;
}

export class ATProtocolAdapter {
  private posts: Map<string, ATPost[]> = new Map();
  private follows: Map<string, Set<string>> = new Map();
  private handles: Map<string, string> = new Map();

  createPost(did: string, content: string): ATPost {
    const post: ATPost = {
      uri: `at://${did}/app.bsky.feed.post/${crypto.randomUUID()}`,
      cid: crypto.randomUUID(),
      did,
      content,
      createdAt: new Date().toISOString(),
    };

    const userPosts = this.posts.get(did) ?? [];
    userPosts.push(post);
    this.posts.set(did, userPosts);

    return post;
  }

  deletePost(did: string, uri: string): boolean {
    const userPosts = this.posts.get(did);
    if (!userPosts) return false;

    const idx = userPosts.findIndex((p) => p.uri === uri);
    if (idx === -1) return false;

    userPosts.splice(idx, 1);
    return true;
  }

  follow(did: string, targetDid: string): boolean {
    const following = this.follows.get(did) ?? new Set();
    if (following.has(targetDid)) return false;
    following.add(targetDid);
    this.follows.set(did, following);
    return true;
  }

  unfollow(did: string, targetDid: string): boolean {
    const following = this.follows.get(did);
    if (!following) return false;
    return following.delete(targetDid);
  }

  getTimeline(did: string, limit = 50): ATTimelineItem[] {
    const following = this.follows.get(did) ?? new Set();
    const items: ATTimelineItem[] = [];

    for (const followedDid of following) {
      const posts = this.posts.get(followedDid) ?? [];
      for (const post of posts) {
        items.push({ post });
      }
    }

    // Also include own posts
    const ownPosts = this.posts.get(did) ?? [];
    for (const post of ownPosts) {
      items.push({ post });
    }

    items.sort((a, b) => b.post.createdAt.localeCompare(a.post.createdAt));
    return items.slice(0, limit);
  }

  getFeed(_feedUri: string, cursor?: string): ATFeedResponse {
    // Simulate feed retrieval based on URI
    const allPosts: ATTimelineItem[] = [];
    for (const posts of this.posts.values()) {
      for (const post of posts) {
        allPosts.push({ post });
      }
    }

    allPosts.sort((a, b) => b.post.createdAt.localeCompare(a.post.createdAt));

    let startIdx = 0;
    if (cursor) {
      startIdx = parseInt(cursor, 10) || 0;
    }

    const feed = allPosts.slice(startIdx, startIdx + 20);
    const nextCursor = startIdx + 20 < allPosts.length ? String(startIdx + 20) : undefined;

    return { feed, cursor: nextCursor };
  }

  resolveHandle(handle: string): string | null {
    return this.handles.get(handle) ?? null;
  }

  registerHandle(handle: string, did: string): void {
    this.handles.set(handle, did);
  }
}
