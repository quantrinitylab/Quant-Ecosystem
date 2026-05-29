// ============================================================================
// QuantChat - useStories Hook
// Fetch stories, mark viewed, create, reply, viewers list, auto-advance
// ============================================================================
import { useState, useEffect, useCallback, useRef } from 'react';
import { logger } from '@quant/common';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';

interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  type: 'photo' | 'video' | 'text';
  mediaUrl?: string;
  text?: string;
  filter?: string;
  duration: number;
  viewCount: number;
  createdAt: string;
  expiresAt: string;
  isViewed: boolean;
  replies: number;
}
interface StoryGroup {
  userId: string;
  userName: string;
  userAvatar: string;
  stories: Story[];
  hasUnviewed: boolean;
}
interface UseStoriesReturn {
  storyGroups: StoryGroup[];
  currentStory: Story | null;
  loading: boolean;
  error: string | null;
  fetchStories: () => Promise<void>;
  viewStory: (storyId: string) => Promise<void>;
  createStory: (data: {
    type: string;
    mediaUrl?: string;
    text?: string;
    duration?: number;
  }) => Promise<void>;
  replyToStory: (storyId: string, message: string) => Promise<void>;
  getViewers: (storyId: string) => Promise<{ userId: string; name: string; viewedAt: string }[]>;
  deleteStory: (storyId: string) => Promise<void>;
  nextStory: () => void;
  prevStory: () => void;
  setCurrentStoryGroup: (userId: string) => void;
  autoAdvance: boolean;
  setAutoAdvance: (value: boolean) => void;
}

export function useStories(): UseStoriesReturn {
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentGroupIndex, setCurrentGroupIndex] = useState<number>(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState<number>(0);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const advanceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const currentGroup = storyGroups[currentGroupIndex];
  const currentStory = currentGroup?.stories[currentStoryIndex] || null;

  const fetchStories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/stories/feed', {
        headers: { ...getAuthHeaders() },
      });
      if (!response.ok) throw new Error('Failed to fetch stories');
      const data = await response.json();
      setStoryGroups(data.groups || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  useEffect(() => {
    if (autoAdvance && currentStory) {
      advanceTimerRef.current = setTimeout(() => {
        nextStory();
      }, currentStory.duration * 1000);
      return () => {
        if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      };
    }
  }, [currentStory, autoAdvance, currentGroupIndex, currentStoryIndex]);

  const viewStory = useCallback(async (storyId: string) => {
    try {
      await fetch(`/api/stories/${storyId}/view`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
      setStoryGroups((prev) =>
        prev.map((g) => ({
          ...g,
          stories: g.stories.map((s) =>
            s.id === storyId ? { ...s, isViewed: true, viewCount: s.viewCount + 1 } : s,
          ),
        })),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const createStory = useCallback(
    async (data: { type: string; mediaUrl?: string; text?: string; duration?: number }) => {
      try {
        const response = await fetch('/api/stories', {
          method: 'POST',
          headers: {
            ...getAuthHeadersWithContent(),
          },
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error('Create failed');
        await fetchStories();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Create failed');
      }
    },
    [fetchStories],
  );

  const replyToStory = useCallback(async (storyId: string, message: string) => {
    try {
      await fetch(`/api/stories/${storyId}/reply`, {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
        },
        body: JSON.stringify({ message }),
      });
    } catch (err) {
      logger.error('Reply failed:', err);
    }
  }, []);

  const getViewers = useCallback(async (storyId: string) => {
    try {
      const response = await fetch(`/api/stories/${storyId}/viewers`, {
        headers: { ...getAuthHeaders() },
      });
      if (response.ok) {
        const data = await response.json();
        return data.viewers || [];
      }
    } catch {
      /* ignore */
    }
    return [];
  }, []);

  const deleteStory = useCallback(async (storyId: string) => {
    try {
      await fetch(`/api/stories/${storyId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      setStoryGroups((prev) =>
        prev
          .map((g) => ({ ...g, stories: g.stories.filter((s) => s.id !== storyId) }))
          .filter((g) => g.stories.length > 0),
      );
    } catch {
      /* ignore */
    }
  }, []);

  const nextStory = useCallback(() => {
    if (!currentGroup) return;
    if (currentStoryIndex < currentGroup.stories.length - 1) {
      setCurrentStoryIndex((i) => i + 1);
    } else if (currentGroupIndex < storyGroups.length - 1) {
      setCurrentGroupIndex((i) => i + 1);
      setCurrentStoryIndex(0);
    }
    if (currentStory) viewStory(currentStory.id);
  }, [
    currentGroup,
    currentStoryIndex,
    currentGroupIndex,
    storyGroups.length,
    currentStory,
    viewStory,
  ]);

  const prevStory = useCallback(() => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((i) => i - 1);
    } else if (currentGroupIndex > 0) {
      setCurrentGroupIndex((i) => i - 1);
      const prevGroup = storyGroups[currentGroupIndex - 1];
      setCurrentStoryIndex(prevGroup ? prevGroup.stories.length - 1 : 0);
    }
  }, [currentStoryIndex, currentGroupIndex, storyGroups]);

  const setCurrentStoryGroup = useCallback(
    (userId: string) => {
      const idx = storyGroups.findIndex((g) => g.userId === userId);
      if (idx >= 0) {
        setCurrentGroupIndex(idx);
        setCurrentStoryIndex(0);
      }
    },
    [storyGroups],
  );

  return {
    storyGroups,
    currentStory,
    loading,
    error,
    fetchStories,
    viewStory,
    createStory,
    replyToStory,
    getViewers,
    deleteStory,
    nextStory,
    prevStory,
    setCurrentStoryGroup,
    autoAdvance,
    setAutoAdvance,
  };
}

export default useStories;
