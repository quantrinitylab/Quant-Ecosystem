import { describe, it, expect } from 'vitest';
import { FollowingMode } from '../personalization/following-mode';
import type { SocialGraph, ContentStore, ContentPost } from '../personalization/following-mode';

describe('FollowingMode', () => {
  function createMockPosts(): ContentPost[] {
    return [
      { id: 'p1', authorId: 'author1', content: 'Post 1', timestamp: 1000, metadata: {} },
      { id: 'p2', authorId: 'author2', content: 'Post 2', timestamp: 2000, metadata: {} },
      { id: 'p3', authorId: 'author1', content: 'Post 3', timestamp: 3000, metadata: {} },
      { id: 'p4', authorId: 'author3', content: 'Post 4', timestamp: 4000, metadata: {} },
      { id: 'p5', authorId: 'author2', content: 'Post 5', timestamp: 5000, metadata: {} },
    ];
  }

  function createFollowingMode(following: string[], posts: ContentPost[]): FollowingMode {
    const socialGraph: SocialGraph = {
      getFollowing: () => following,
    };

    const contentStore: ContentStore = {
      getPostsByAuthors: (authorIds, options) => {
        const filtered = posts
          .filter((p) => authorIds.includes(p.authorId))
          .sort((a, b) => b.timestamp - a.timestamp);
        return filtered.slice(options.offset, options.offset + options.limit);
      },
      countPostsByAuthors: (authorIds) => {
        return posts.filter((p) => authorIds.includes(p.authorId)).length;
      },
    };

    return new FollowingMode(socialGraph, contentStore);
  }

  describe('getFeed', () => {
    it('should return only posts from followed authors', () => {
      const posts = createMockPosts();
      const mode = createFollowingMode(['author1', 'author2'], posts);

      const result = mode.getFeed('user1', 1, 10);

      // Should not include author3's posts
      expect(result.items.every((item) => ['author1', 'author2'].includes(item.authorId))).toBe(
        true,
      );
      expect(result.items.find((item) => item.authorId === 'author3')).toBeUndefined();
    });

    it('should sort posts in reverse chronological order', () => {
      const posts = createMockPosts();
      const mode = createFollowingMode(['author1', 'author2'], posts);

      const result = mode.getFeed('user1', 1, 10);

      for (let i = 0; i < result.items.length - 1; i++) {
        expect(result.items[i]!.timestamp).toBeGreaterThanOrEqual(result.items[i + 1]!.timestamp);
      }
    });

    it('should paginate correctly', () => {
      const posts = createMockPosts();
      const mode = createFollowingMode(['author1', 'author2', 'author3'], posts);

      const page1 = mode.getFeed('user1', 1, 2);
      const page2 = mode.getFeed('user1', 2, 2);

      expect(page1.items).toHaveLength(2);
      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(2);

      expect(page2.items).toHaveLength(2);
      expect(page2.page).toBe(2);

      // Pages should not overlap
      const page1Ids = page1.items.map((i) => i.id);
      const page2Ids = page2.items.map((i) => i.id);
      expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
    });

    it('should return empty feed when user follows no one', () => {
      const posts = createMockPosts();
      const mode = createFollowingMode([], posts);

      const result = mode.getFeed('user1', 1, 10);

      expect(result.items).toHaveLength(0);
      expect(result.totalAvailable).toBe(0);
    });

    it('should include totalAvailable count', () => {
      const posts = createMockPosts();
      const mode = createFollowingMode(['author1', 'author2', 'author3'], posts);

      const result = mode.getFeed('user1', 1, 2);

      expect(result.totalAvailable).toBe(5);
    });
  });
});
