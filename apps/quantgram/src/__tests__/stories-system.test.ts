import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createStory,
  getActiveStoryBundles,
  markStoryViewed,
  deleteStory,
  calculateStorySegmentProgress,
  clearStoriesForTesting,
  STORY_TTL_MS,
  type StoryItem,
} from '../services/stories.service';

describe('Whoxa & Chatter 24-Hour Stories & Segmented Progress Engine', () => {
  beforeEach(() => {
    clearStoriesForTesting();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Story Creation & 24-Hour Expiration Window', () => {
    it('sets a strict 24-hour expiration window upon creation', () => {
      const fixedTime = new Date('2026-09-27T10:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedTime);

      const user = {
        userId: 'creator_1',
        username: 'alice',
        displayName: 'Alice In Wonderland',
        avatarUrl: 'https://cdn.quant.network/avatars/alice.png',
      };

      const story = createStory(user, {
        mediaUrl: 'https://cdn.quant.network/stories/alice_1.jpg',
        mediaType: 'image',
        caption: 'Morning vibes in Neo-Tokyo! 🌸',
      });

      expect(story).toBeDefined();
      expect(story.id).toMatch(/^story_/);
      expect(story.userId).toBe('creator_1');
      expect(story.mediaUrl).toBe('https://cdn.quant.network/stories/alice_1.jpg');
      expect(story.mediaType).toBe('image');
      expect(story.caption).toBe('Morning vibes in Neo-Tokyo! 🌸');
      expect(story.durationSeconds).toBe(5); // Default 5s for image
      expect(story.viewers).toEqual([]);

      const createdTime = new Date(story.createdAt).getTime();
      const expiresTime = new Date(story.expiresAt).getTime();

      expect(createdTime).toBe(fixedTime.getTime());
      expect(expiresTime - createdTime).toBe(STORY_TTL_MS);
      expect(expiresTime - createdTime).toBe(24 * 60 * 60 * 1000);
      expect(story.expiresAt).toBe(new Date('2026-09-28T10:00:00.000Z').toISOString());
    });

    it('respects custom durations and video default durations', () => {
      const user = {
        userId: 'creator_2',
        username: 'bob',
        displayName: 'Bob The Builder',
      };

      const videoStory = createStory(user, {
        mediaUrl: 'https://cdn.quant.network/stories/bob_clip.mp4',
        mediaType: 'video',
      });
      expect(videoStory.durationSeconds).toBe(15); // Default 15s for video

      const customStory = createStory(user, {
        mediaUrl: 'https://cdn.quant.network/stories/bob_custom.mp4',
        mediaType: 'video',
        durationSeconds: 30,
      });
      expect(customStory.durationSeconds).toBe(30);
    });
  });

  describe('Active Story Bundles & 24-Hour Expiration Filtering', () => {
    it('excludes stories older than 24 hours', () => {
      const startTime = new Date('2026-09-27T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(startTime);

      const userA = { userId: 'user_a', username: 'alex', displayName: 'Alex' };
      const userB = { userId: 'user_b', username: 'bella', displayName: 'Bella' };

      // User A posts story at 12:00
      const storyA = createStory(userA, {
        mediaUrl: 'https://cdn.quant.network/stories/a1.jpg',
        mediaType: 'image',
      });

      // Advance time by 10 hours (22:00)
      vi.advanceTimersByTime(10 * 3600 * 1000);

      // User B posts story at 22:00
      const storyB = createStory(userB, {
        mediaUrl: 'https://cdn.quant.network/stories/b1.jpg',
        mediaType: 'image',
      });

      // At 22:00, both are active
      let bundles = getActiveStoryBundles('viewer_1');
      expect(bundles).toHaveLength(2);

      // Advance time past 24 hours from User A's post (+15 hours from 22:00 = 37:00 total elapsed, storyA is 25h old, storyB is 15h old)
      vi.advanceTimersByTime(15 * 3600 * 1000);

      bundles = getActiveStoryBundles('viewer_1');
      // Story A has expired (25h old), User B's story is still active (15h old)
      expect(bundles).toHaveLength(1);
      expect(bundles[0].userId).toBe('user_b');
      expect(bundles[0].stories[0].id).toBe(storyB.id);

      // Advance time by another 10 hours (storyB is now 25h old)
      vi.advanceTimersByTime(10 * 3600 * 1000);
      bundles = getActiveStoryBundles('viewer_1');
      expect(bundles).toHaveLength(0);
    });

    it('retains only active stories when a user has both expired and active stories', () => {
      const startTime = new Date('2026-09-27T08:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(startTime);

      const user = { userId: 'user_creator', username: 'charlie', displayName: 'Charlie' };

      // Charlie posts story 1
      const story1 = createStory(user, {
        mediaUrl: 'https://cdn.quant.network/stories/c1.jpg',
        mediaType: 'image',
      });

      // 20 hours later, Charlie posts story 2
      vi.advanceTimersByTime(20 * 3600 * 1000);
      const story2 = createStory(user, {
        mediaUrl: 'https://cdn.quant.network/stories/c2.jpg',
        mediaType: 'image',
      });

      // 5 hours later (25h after story 1, 5h after story 2)
      vi.advanceTimersByTime(5 * 3600 * 1000);

      const bundles = getActiveStoryBundles('viewer_x');
      expect(bundles).toHaveLength(1);
      expect(bundles[0].userId).toBe('user_creator');
      expect(bundles[0].stories).toHaveLength(1);
      expect(bundles[0].stories[0].id).toBe(story2.id);
    });
  });

  describe('Viewer Tracking & Unseen Status Receipts', () => {
    it('viewing story adds viewer to list and updates unseen status', () => {
      const creator = {
        userId: 'creator_view_test',
        username: 'diana',
        displayName: 'Diana Prince',
        avatarUrl: 'https://cdn.quant.network/avatars/diana.png',
      };

      const viewer = {
        userId: 'viewer_clark',
        username: 'clark_kent',
        avatarUrl: 'https://cdn.quant.network/avatars/clark.png',
      };

      const story = createStory(creator, {
        mediaUrl: 'https://cdn.quant.network/stories/diana_1.jpg',
        mediaType: 'image',
      });

      // Before viewing: bundle hasUnseenStories is true for viewer_clark
      let bundles = getActiveStoryBundles(viewer.userId);
      expect(bundles).toHaveLength(1);
      expect(bundles[0].hasUnseenStories).toBe(true);

      // Mark story as viewed
      const viewResult = markStoryViewed(story.id, viewer);
      expect(viewResult.success).toBe(true);
      expect(viewResult.viewCount).toBe(1);

      // After viewing: bundle hasUnseenStories is now false for viewer_clark
      bundles = getActiveStoryBundles(viewer.userId);
      expect(bundles[0].hasUnseenStories).toBe(false);
      expect(bundles[0].stories[0].viewers).toHaveLength(1);
      expect(bundles[0].stories[0].viewers[0].userId).toBe('viewer_clark');
      expect(bundles[0].stories[0].viewers[0].username).toBe('clark_kent');

      // Another viewer should still see hasUnseenStories as true
      const otherBundles = getActiveStoryBundles('viewer_bruce');
      expect(otherBundles[0].hasUnseenStories).toBe(true);

      // Idempotency: duplicate view call does not increase view count
      const duplicateView = markStoryViewed(story.id, viewer);
      expect(duplicateView.success).toBe(true);
      expect(duplicateView.viewCount).toBe(1);

      // Second distinct viewer adds to count
      const secondView = markStoryViewed(story.id, {
        userId: 'viewer_bruce',
        username: 'bruce_wayne',
      });
      expect(secondView.success).toBe(true);
      expect(secondView.viewCount).toBe(2);
    });

    it('returns success: false when marking a non-existent story viewed', () => {
      const result = markStoryViewed('non_existent_id', {
        userId: 'viewer_1',
        username: 'ghost',
      });
      expect(result.success).toBe(false);
      expect(result.viewCount).toBe(0);
    });
  });

  describe('Bundle Ordering & Unseen-Priority Sorting', () => {
    it('prioritizes users with unseen stories over seen stories, then by latest timestamp descending', () => {
      const fixedTime = new Date('2026-09-27T14:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedTime);

      const currentUserId = 'viewer_current';

      const userA = { userId: 'user_a', username: 'user_a', displayName: 'User Alpha' };
      const userB = { userId: 'user_b', username: 'user_b', displayName: 'User Beta' };
      const userC = { userId: 'user_c', username: 'user_c', displayName: 'User Charlie' };

      // User A posts at 14:00
      const storyA = createStory(userA, { mediaUrl: 'a.jpg', mediaType: 'image' });

      // User B posts at 14:05 (newer than A)
      vi.advanceTimersByTime(5 * 60 * 1000);
      const storyB = createStory(userB, { mediaUrl: 'b.jpg', mediaType: 'image' });

      // User C posts at 14:10 (newest)
      vi.advanceTimersByTime(5 * 60 * 1000);
      const storyC = createStory(userC, { mediaUrl: 'c.jpg', mediaType: 'image' });

      // Mark User C's and User B's stories as seen by currentUserId
      markStoryViewed(storyC.id, { userId: currentUserId, username: 'viewer' });
      markStoryViewed(storyB.id, { userId: currentUserId, username: 'viewer' });

      // User A's story is UNSEEN by currentUserId, but older than B and C.
      // Expected ordering:
      // 1. User A (hasUnseenStories: true) -> prioritized first!
      // 2. User C (hasUnseenStories: false, latest: 14:10)
      // 3. User B (hasUnseenStories: false, latest: 14:05)
      const bundles = getActiveStoryBundles(currentUserId);
      expect(bundles).toHaveLength(3);

      expect(bundles[0].userId).toBe('user_a');
      expect(bundles[0].hasUnseenStories).toBe(true);

      expect(bundles[1].userId).toBe('user_c');
      expect(bundles[1].hasUnseenStories).toBe(false);

      expect(bundles[2].userId).toBe('user_b');
      expect(bundles[2].hasUnseenStories).toBe(false);
    });

    it('sorts multiple unseen bundles by latestStoryTimestamp descending', () => {
      const fixedTime = new Date('2026-09-27T15:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(fixedTime);

      const user1 = { userId: 'u1', username: 'u1', displayName: 'User 1' };
      const user2 = { userId: 'u2', username: 'u2', displayName: 'User 2' };

      createStory(user1, { mediaUrl: '1.jpg', mediaType: 'image' });
      vi.advanceTimersByTime(10 * 60 * 1000);
      createStory(user2, { mediaUrl: '2.jpg', mediaType: 'image' });

      const bundles = getActiveStoryBundles('viewer_new');
      expect(bundles[0].userId).toBe('u2'); // Newer unseen first
      expect(bundles[1].userId).toBe('u1');
    });
  });

  describe('Story Deletion & Authorization', () => {
    it('allows owner to delete story and prevents unauthorized deletion', () => {
      const owner = { userId: 'owner_123', username: 'owner', displayName: 'Owner' };
      const story = createStory(owner, { mediaUrl: 'del.jpg', mediaType: 'image' });

      // Unauthorized user fails
      const deleteFail = deleteStory(story.id, 'hacker_456');
      expect(deleteFail).toBe(false);

      // Authorized owner succeeds
      const deleteSuccess = deleteStory(story.id, 'owner_123');
      expect(deleteSuccess).toBe(true);

      // Deleting already deleted story returns false
      expect(deleteStory(story.id, 'owner_123')).toBe(false);

      // Active bundles no longer contains the story
      const bundles = getActiveStoryBundles('viewer');
      expect(bundles).toHaveLength(0);
    });
  });

  describe('Segmented Progress Bar Calculation', () => {
    it('computes 1.0 for past slides, partial progress for active slide, and 0.0 for upcoming slides', () => {
      // 3 stories total, on story 1 (0-indexed: 0=past, 1=active, 2=upcoming) with 45% completion
      const segments = calculateStorySegmentProgress(1, 3, 0.45);
      expect(segments).toEqual([1.0, 0.45, 0.0]);
    });

    it('handles first slide active', () => {
      const segments = calculateStorySegmentProgress(0, 4, 0.8);
      expect(segments).toEqual([0.8, 0.0, 0.0, 0.0]);
    });

    it('handles last slide active', () => {
      const segments = calculateStorySegmentProgress(2, 3, 0.95);
      expect(segments).toEqual([1.0, 1.0, 0.95]);
    });

    it('clamps out-of-bounds currentSlideProgress between 0.0 and 1.0', () => {
      const segmentsNegative = calculateStorySegmentProgress(1, 3, -0.5);
      expect(segmentsNegative).toEqual([1.0, 0.0, 0.0]);

      const segmentsOver = calculateStorySegmentProgress(1, 3, 1.5);
      expect(segmentsOver).toEqual([1.0, 1.0, 0.0]);
    });

    it('returns empty array when totalStories is 0 or negative', () => {
      expect(calculateStorySegmentProgress(0, 0, 0.5)).toEqual([]);
      expect(calculateStorySegmentProgress(0, -1, 0.5)).toEqual([]);
    });

    it('computes all 1.0 if activeStoryIndex is beyond totalStories (all finished)', () => {
      const segments = calculateStorySegmentProgress(5, 3, 0.5);
      expect(segments).toEqual([1.0, 1.0, 1.0]);
    });
  });
});
