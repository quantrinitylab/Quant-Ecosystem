// ============================================================================
// QuantTube - usePodcasts Hook
// Podcast subscriptions, queue, playback
// ============================================================================

import { useState, useCallback } from 'react';

interface Podcast {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  episodeCount: number;
  isSubscribed: boolean;
}

interface Episode {
  id: string;
  podcastId: string;
  title: string;
  duration: number;
  progress: number;
  isPlayed: boolean;
}

interface PodcastsState {
  subscriptions: Podcast[];
  queue: Episode[];
  playingEpisodeId: string | null;
  currentTime: number;
  loading: boolean;
  error: string | null;
}

interface PodcastsActions {
  subscribe: (podcast: Podcast) => void;
  unsubscribe: (podcastId: string) => void;
  addToQueue: (episode: Episode) => void;
  removeFromQueue: (episodeId: string) => void;
  playEpisode: (episodeId: string) => void;
  pauseEpisode: () => void;
  seekTo: (time: number) => void;
  markPlayed: (episodeId: string) => void;
  clearQueue: () => void;
  reorderQueue: (fromIdx: number, toIdx: number) => void;
}

export function usePodcasts(): [PodcastsState, PodcastsActions] {
  const [state, setState] = useState<PodcastsState>({
    subscriptions: [],
    queue: [],
    playingEpisodeId: null,
    currentTime: 0,
    loading: false,
    error: null,
  });

  const subscribe = useCallback((podcast: Podcast) => {
    setState(prev => ({
      ...prev,
      subscriptions: [...prev.subscriptions, { ...podcast, isSubscribed: true }],
    }));
  }, []);

  const unsubscribe = useCallback((podcastId: string) => {
    setState(prev => ({
      ...prev,
      subscriptions: prev.subscriptions.filter(p => p.id !== podcastId),
    }));
  }, []);

  const addToQueue = useCallback((episode: Episode) => {
    setState(prev => ({
      ...prev,
      queue: [...prev.queue, episode],
    }));
  }, []);

  const removeFromQueue = useCallback((episodeId: string) => {
    setState(prev => ({
      ...prev,
      queue: prev.queue.filter(e => e.id !== episodeId),
    }));
  }, []);

  const playEpisode = useCallback((episodeId: string) => {
    setState(prev => ({ ...prev, playingEpisodeId: episodeId }));
  }, []);

  const pauseEpisode = useCallback(() => {
    setState(prev => ({ ...prev, playingEpisodeId: null }));
  }, []);

  const seekTo = useCallback((time: number) => {
    setState(prev => ({ ...prev, currentTime: time }));
  }, []);

  const markPlayed = useCallback((episodeId: string) => {
    setState(prev => ({
      ...prev,
      queue: prev.queue.map(e => e.id === episodeId ? { ...e, isPlayed: true, progress: 100 } : e),
    }));
  }, []);

  const clearQueue = useCallback(() => {
    setState(prev => ({ ...prev, queue: [] }));
  }, []);

  const reorderQueue = useCallback((fromIdx: number, toIdx: number) => {
    setState(prev => {
      const newQueue = [...prev.queue];
      const [moved] = newQueue.splice(fromIdx, 1);
      newQueue.splice(toIdx, 0, moved);
      return { ...prev, queue: newQueue };
    });
  }, []);

  return [state, { subscribe, unsubscribe, addToQueue, removeFromQueue, playEpisode, pauseEpisode, seekTo, markPlayed, clearQueue, reorderQueue }];
}

export default usePodcasts;
