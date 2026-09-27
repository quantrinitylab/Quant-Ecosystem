// ============================================================================
// QuantNeon - 24-Hour Disappearing Stories & Segmented Progress Engine
// Whoxa & Chatter Parity: 24h Expiry, Viewer Receipts, User Story Bundles,
// Unseen-Priority Ordering & Segment Progress Calculations
// ============================================================================

export interface StoryItem {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  durationSeconds: number; // e.g. 5s for image, video duration for video
  createdAt: string;
  expiresAt: string; // createdAt + 24 hours
  viewers: Array<{ userId: string; username: string; avatarUrl?: string; viewedAt: string }>;
}

export interface UserStoryBundle {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  stories: StoryItem[];
  hasUnseenStories: boolean;
  latestStoryTimestamp: string;
}

export interface StoryCreatorUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export interface CreateStoryPayload {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  durationSeconds?: number;
}

export interface StoryViewer {
  userId: string;
  username: string;
  avatarUrl?: string;
}

// In-memory data store for stories and user profiles
const storiesStore = new Map<string, StoryItem>();
const userProfilesStore = new Map<
  string,
  { username: string; displayName: string; avatarUrl: string }
>();
let storyIdCounter = 0;

export const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours in milliseconds

/**
 * Creates a new story with a strict 24-hour expiration window.
 */
export function createStory(user: StoryCreatorUser, data: CreateStoryPayload): StoryItem {
  storyIdCounter += 1;
  const id = `story_${Date.now()}_${storyIdCounter}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + STORY_TTL_MS).toISOString();

  // Duration defaults: 5 seconds for images, 15 seconds for videos
  const durationSeconds =
    data.durationSeconds !== undefined && data.durationSeconds > 0
      ? data.durationSeconds
      : data.mediaType === 'video'
        ? 15
        : 5;

  const story: StoryItem = {
    id,
    userId: user.userId,
    mediaUrl: data.mediaUrl,
    mediaType: data.mediaType,
    caption: data.caption,
    durationSeconds,
    createdAt,
    expiresAt,
    viewers: [],
  };

  // Upsert user profile cache
  userProfilesStore.set(user.userId, {
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || '',
  });

  storiesStore.set(id, story);

  return {
    ...story,
    viewers: [...story.viewers],
  };
}

/**
 * Returns active story bundles grouped by user:
 * - Excludes stories where expiresAt <= Date.now()
 * - Computes hasUnseenStories for currentUserId
 * - Sorts unseen bundles first, then by latestStoryTimestamp descending
 */
export function getActiveStoryBundles(currentUserId: string): UserStoryBundle[] {
  const now = Date.now();

  // 1. Filter out expired stories
  const activeStories: StoryItem[] = [];
  storiesStore.forEach((story) => {
    const expiresAtMs = new Date(story.expiresAt).getTime();
    if (expiresAtMs > now) {
      activeStories.push(story);
    }
  });

  // 2. Group stories by userId
  const userStoriesMap = new Map<string, StoryItem[]>();
  for (let i = 0; i < activeStories.length; i++) {
    const story = activeStories[i];
    let list = userStoriesMap.get(story.userId);
    if (!list) {
      list = [];
      userStoriesMap.set(story.userId, list);
    }
    list.push(story);
  }

  // 3. Construct bundles
  const bundles: UserStoryBundle[] = [];
  userStoriesMap.forEach((items, userId) => {
    // Sort stories within bundle chronologically (oldest to newest)
    const sortedStories = [...items].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    // hasUnseenStories: true if there is at least one story not viewed by currentUserId
    const hasUnseenStories = sortedStories.some(
      (story) => !story.viewers.some((viewer) => viewer.userId === currentUserId),
    );

    // latestStoryTimestamp: the createdAt timestamp of the most recent story in the bundle
    const latestStoryTimestamp = sortedStories[sortedStories.length - 1].createdAt;

    // Retrieve user metadata
    const profile = userProfilesStore.get(userId) || {
      username: `user_${userId}`,
      displayName: `User ${userId}`,
      avatarUrl: '',
    };

    bundles.push({
      userId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      stories: sortedStories.map((s) => ({ ...s, viewers: [...s.viewers] })),
      hasUnseenStories,
      latestStoryTimestamp,
    });
  });

  // 4. Sort bundles: Unseen bundles first, then by latestStoryTimestamp descending
  bundles.sort((a, b) => {
    if (a.hasUnseenStories && !b.hasUnseenStories) {
      return -1;
    }
    if (!a.hasUnseenStories && b.hasUnseenStories) {
      return 1;
    }
    const timeA = new Date(a.latestStoryTimestamp).getTime();
    const timeB = new Date(b.latestStoryTimestamp).getTime();
    return timeB - timeA;
  });

  return bundles;
}

/**
 * Records a viewer for a given story.
 * Prevents duplicate views while maintaining timestamp of original view.
 */
export function markStoryViewed(
  storyId: string,
  viewer: StoryViewer,
): { success: boolean; viewCount: number } {
  const story = storiesStore.get(storyId);
  if (!story) {
    return { success: false, viewCount: 0 };
  }

  const existingViewer = story.viewers.find((v) => v.userId === viewer.userId);
  if (!existingViewer) {
    story.viewers.push({
      userId: viewer.userId,
      username: viewer.username,
      avatarUrl: viewer.avatarUrl,
      viewedAt: new Date().toISOString(),
    });
  } else if (viewer.avatarUrl && !existingViewer.avatarUrl) {
    existingViewer.avatarUrl = viewer.avatarUrl;
  }

  return {
    success: true,
    viewCount: story.viewers.length,
  };
}

/**
 * Deletes a story by id, enforcing that only the story author can delete it.
 */
export function deleteStory(storyId: string, userId: string): boolean {
  const story = storiesStore.get(storyId);
  if (!story) {
    return false;
  }

  if (story.userId !== userId) {
    return false;
  }

  return storiesStore.delete(storyId);
}

/**
 * Computes segmented progress array (0.0 to 1.0 per slide) for story viewer playback.
 * - Completed slides (index < activeStoryIndex) = 1.0
 * - Active slide (index === activeStoryIndex) = clamped currentSlideProgress (0.0 to 1.0)
 * - Upcoming slides (index > activeStoryIndex) = 0.0
 */
export function calculateStorySegmentProgress(
  activeStoryIndex: number,
  totalStories: number,
  currentSlideProgress: number,
): number[] {
  if (totalStories <= 0) {
    return [];
  }

  const clampedProgress = Math.max(0.0, Math.min(1.0, currentSlideProgress));
  const segments: number[] = [];

  for (let i = 0; i < totalStories; i++) {
    if (i < activeStoryIndex) {
      segments.push(1.0);
    } else if (i === activeStoryIndex) {
      segments.push(clampedProgress);
    } else {
      segments.push(0.0);
    }
  }

  return segments;
}

/**
 * Helper to reset in-memory state during tests.
 */
export function clearStoriesForTesting(): void {
  storiesStore.clear();
  userProfilesStore.clear();
  storyIdCounter = 0;
}
