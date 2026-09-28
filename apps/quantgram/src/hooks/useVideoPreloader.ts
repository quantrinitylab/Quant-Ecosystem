import { useState, useEffect, useRef } from 'react';

export interface UseVideoPreloaderResult {
  preloadedIndices: Set<number>;
  isPreloaded: (index: number) => boolean;
  getVideoRef: (index: number) => HTMLVideoElement | null;
}

export function calculatePreloadWindow(
  videoUrlsLength: number,
  activeIndex: number,
  preloadWindow: number = 4,
): number[] {
  const minIndex = Math.max(0, activeIndex - 1);
  const maxIndex = Math.min(videoUrlsLength - 1, activeIndex + preloadWindow - 1);
  const indices: number[] = [];
  for (let i = minIndex; i <= maxIndex; i++) {
    indices.push(i);
  }
  return indices;
}

export function useVideoPreloader(
  videoUrls: string[],
  activeIndex: number,
  preloadWindow: number = 4,
): UseVideoPreloaderResult {
  const [preloadedIndices, setPreloadedIndices] = useState<Set<number>>(new Set());
  const videoRefsMap = useRef<Map<number, HTMLVideoElement>>(new Map());

  useEffect(() => {
    const windowIndices = calculatePreloadWindow(videoUrls.length, activeIndex, preloadWindow);
    const newPreloaded = new Set<number>(windowIndices);
    const currentMap = videoRefsMap.current;

    for (const i of windowIndices) {
      if (!currentMap.has(i)) {
        if (typeof document !== 'undefined') {
          const video = document.createElement('video');
          video.src = videoUrls[i];
          video.preload = 'auto';
          video.muted = true;
          video.load();
          currentMap.set(i, video);
        }
      }
    }

    for (const [index, video] of currentMap.entries()) {
      if (!newPreloaded.has(index)) {
        try {
          video.pause();
          video.src = '';
          video.load();
        } catch (e) {
          // ignore cleanup errors
        }
        currentMap.delete(index);
      }
    }

    setPreloadedIndices(newPreloaded);

    return () => {
      for (const video of currentMap.values()) {
        try {
          video.pause();
          video.src = '';
        } catch (e) {
          // ignore
        }
      }
      currentMap.clear();
    };
  }, [activeIndex, videoUrls, preloadWindow]);

  const isPreloaded = (index: number): boolean => {
    return preloadedIndices.has(index);
  };

  const getVideoRef = (index: number): HTMLVideoElement | null => {
    return videoRefsMap.current.get(index) || null;
  };

  return {
    preloadedIndices,
    isPreloaded,
    getVideoRef,
  };
}
