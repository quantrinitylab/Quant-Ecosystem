// ============================================================================
// QuantMax - useCreator Hook
// Video creation state: recording, effects, sounds, editing
// Powered by React Query + apiClient
// ============================================================================

import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

interface VideoClip {
  id: string;
  duration: number;
  startTime: number;
  endTime: number;
  speed: number;
  filter: string | null;
  thumbnail: string;
}

interface TextOverlay {
  id: string;
  content: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
  startTime: number;
  duration: number;
}

interface SoundTrack {
  id: string;
  name: string;
  artist: string;
  url: string;
  duration: number;
  startOffset: number;
  volume: number;
}

interface CreatorState {
  isRecording: boolean;
  recordDuration: number;
  maxDuration: number;
  clips: VideoClip[];
  textOverlays: TextOverlay[];
  sound: SoundTrack | null;
  speed: number;
  timer: number | null;
  filter: string | null;
  mode: 'camera' | 'gallery' | 'duet' | 'stitch';
  isFrontCamera: boolean;
  flashEnabled: boolean;
}

interface UseCreatorReturn {
  state: CreatorState;
  isPublishing: boolean;
  publishError: string | null;
  startRecording: () => void;
  stopRecording: () => void;
  setSpeed: (speed: number) => void;
  setTimer: (seconds: number | null) => void;
  setFilter: (filter: string | null) => void;
  setMode: (mode: CreatorState['mode']) => void;
  toggleCamera: () => void;
  toggleFlash: () => void;
  addTextOverlay: (text: string) => void;
  updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
  removeTextOverlay: (id: string) => void;
  setSound: (sound: SoundTrack | null) => void;
  trimClip: (clipId: string, startTime: number, endTime: number) => void;
  deleteClip: (clipId: string) => void;
  splitClip: (clipId: string, time: number) => void;
  reorderClips: (fromIndex: number, toIndex: number) => void;
  getTotalDuration: () => number;
  canPublish: () => boolean;
  publish: (caption: string, hashtags: string[]) => void;
}

export function useCreator(maxDuration: number = 180): UseCreatorReturn {
  const [state, setState] = useState<CreatorState>({
    isRecording: false,
    recordDuration: 0,
    maxDuration,
    clips: [],
    textOverlays: [],
    sound: null,
    speed: 1,
    timer: null,
    filter: null,
    mode: 'camera',
    isFrontCamera: true,
    flashEnabled: false,
  });

  const recordingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publishMutation = useMutation({
    mutationFn: async (data: { caption: string; hashtags: string[] }) => {
      const response = await apiClient.createVideo({
        caption: data.caption,
        hashtags: data.hashtags,
        duration: getTotalDuration(),
        clips: state.clips.length,
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to publish video');
      }
      return response.data;
    },
  });

  const startRecording = useCallback(() => {
    if (state.timer) {
      timerRef.current = setTimeout(() => {
        setState((prev) => ({ ...prev, isRecording: true }));
        recordingRef.current = setInterval(() => {
          setState((prev) => {
            const newDuration = prev.recordDuration + 0.1;
            if (newDuration >= prev.maxDuration) {
              if (recordingRef.current) clearInterval(recordingRef.current);
              const newClip: VideoClip = {
                id: `clip-${Date.now()}`,
                duration: newDuration - prev.clips.reduce((s, c) => s + c.duration, 0),
                startTime: 0,
                endTime: newDuration,
                speed: prev.speed,
                filter: prev.filter,
                thumbnail: '',
              };
              return {
                ...prev,
                isRecording: false,
                recordDuration: newDuration,
                clips: [...prev.clips, newClip],
              };
            }
            return { ...prev, recordDuration: newDuration };
          });
        }, 100);
      }, state.timer * 1000);
    } else {
      setState((prev) => ({ ...prev, isRecording: true }));
      recordingRef.current = setInterval(() => {
        setState((prev) => {
          const newDuration = prev.recordDuration + 0.1;
          if (newDuration >= prev.maxDuration) {
            if (recordingRef.current) clearInterval(recordingRef.current);
            return { ...prev, isRecording: false, recordDuration: newDuration };
          }
          return { ...prev, recordDuration: newDuration };
        });
      }, 100);
    }
  }, [state.timer]);

  const stopRecording = useCallback(() => {
    if (recordingRef.current) clearInterval(recordingRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    setState((prev) => {
      if (!prev.isRecording) return prev;
      const clipDuration = prev.recordDuration - prev.clips.reduce((s, c) => s + c.duration, 0);
      if (clipDuration < 0.5) return { ...prev, isRecording: false };
      const newClip: VideoClip = {
        id: `clip-${Date.now()}`,
        duration: clipDuration,
        startTime: 0,
        endTime: clipDuration,
        speed: prev.speed,
        filter: prev.filter,
        thumbnail: '',
      };
      return { ...prev, isRecording: false, clips: [...prev.clips, newClip] };
    });
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, speed }));
  }, []);
  const setTimer = useCallback((seconds: number | null) => {
    setState((prev) => ({ ...prev, timer: seconds }));
  }, []);
  const setFilter = useCallback((filter: string | null) => {
    setState((prev) => ({ ...prev, filter }));
  }, []);
  const setMode = useCallback((mode: CreatorState['mode']) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);
  const toggleCamera = useCallback(() => {
    setState((prev) => ({ ...prev, isFrontCamera: !prev.isFrontCamera }));
  }, []);
  const toggleFlash = useCallback(() => {
    setState((prev) => ({ ...prev, flashEnabled: !prev.flashEnabled }));
  }, []);

  const addTextOverlay = useCallback((text: string) => {
    const overlay: TextOverlay = {
      id: `text-${Date.now()}`,
      content: text,
      x: 50,
      y: 50,
      fontSize: 24,
      color: '#ffffff',
      fontFamily: 'Inter',
      startTime: 0,
      duration: 3,
    };
    setState((prev) => ({ ...prev, textOverlays: [...prev.textOverlays, overlay] }));
  }, []);

  const updateTextOverlay = useCallback((id: string, updates: Partial<TextOverlay>) => {
    setState((prev) => ({
      ...prev,
      textOverlays: prev.textOverlays.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
  }, []);

  const removeTextOverlay = useCallback((id: string) => {
    setState((prev) => ({ ...prev, textOverlays: prev.textOverlays.filter((t) => t.id !== id) }));
  }, []);

  const setSound = useCallback((sound: SoundTrack | null) => {
    setState((prev) => ({ ...prev, sound }));
  }, []);

  const trimClip = useCallback((clipId: string, startTime: number, endTime: number) => {
    setState((prev) => ({
      ...prev,
      clips: prev.clips.map((c) =>
        c.id === clipId ? { ...c, startTime, endTime, duration: endTime - startTime } : c,
      ),
    }));
  }, []);

  const deleteClip = useCallback((clipId: string) => {
    setState((prev) => ({ ...prev, clips: prev.clips.filter((c) => c.id !== clipId) }));
  }, []);

  const splitClip = useCallback((clipId: string, time: number) => {
    setState((prev) => {
      const clip = prev.clips.find((c) => c.id === clipId);
      if (!clip || time <= clip.startTime || time >= clip.endTime) return prev;
      const first = { ...clip, endTime: time, duration: time - clip.startTime };
      const second = {
        ...clip,
        id: `clip-${Date.now()}`,
        startTime: time,
        duration: clip.endTime - time,
      };
      return {
        ...prev,
        clips: prev.clips.map((c) => (c.id === clipId ? first : c)).concat([second]),
      };
    });
  }, []);

  const reorderClips = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      const clips = [...prev.clips];
      const removed = clips.splice(fromIndex, 1);
      if (removed.length === 0 || !removed[0]) return prev;
      clips.splice(toIndex, 0, removed[0]);
      return { ...prev, clips };
    });
  }, []);

  const getTotalDuration = useCallback((): number => {
    return state.clips.reduce((sum, clip) => sum + clip.duration / clip.speed, 0);
  }, [state.clips]);

  const canPublish = useCallback((): boolean => {
    return state.clips.length > 0 && getTotalDuration() >= 1;
  }, [state.clips, getTotalDuration]);

  const publish = useCallback(
    (caption: string, hashtags: string[]) => {
      publishMutation.mutate({ caption, hashtags });
    },
    [publishMutation],
  );

  return {
    state,
    isPublishing: publishMutation.isPending,
    publishError: publishMutation.error?.message ?? null,
    startRecording,
    stopRecording,
    setSpeed,
    setTimer,
    setFilter,
    setMode,
    toggleCamera,
    toggleFlash,
    addTextOverlay,
    updateTextOverlay,
    removeTextOverlay,
    setSound,
    trimClip,
    deleteClip,
    splitClip,
    reorderClips,
    getTotalDuration,
    canPublish,
    publish,
  };
}

export default useCreator;
