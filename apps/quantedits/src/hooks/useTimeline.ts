// ============================================================================
// QuantEdits - useTimeline Hook
// Timeline state: tracks, clips, playhead, zoom, selection, undo/redo, clipboard
// ============================================================================

import { useState, useCallback, useRef, useMemo } from 'react';

interface Clip {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  type: 'video' | 'audio' | 'text' | 'effect';
  thumbnail: string;
  volume: number;
  opacity: number;
  speed: number;
  filters: Record<string, number>;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  locked: boolean;
}

interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'effects';
  locked: boolean;
  visible: boolean;
  muted: boolean;
  height: number;
  clips: Clip[];
  color: string;
}

interface TimelineState {
  tracks: Track[];
  selectedClipIds: Set<string>;
  playhead: number;
  duration: number;
  zoom: number;
  scrollX: number;
  isPlaying: boolean;
  playbackSpeed: number;
  snapEnabled: boolean;
  snapPoints: number[];
  loopStart: number | null;
  loopEnd: number | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  timestamp: number;
  tracks: Track[];
}

interface UseTimelineReturn {
  state: TimelineState;
  tracks: Track[];
  selectedClips: Clip[];
  canUndo: boolean;
  canRedo: boolean;
  totalDuration: number;
  setPlayhead: (time: number) => void;
  setZoom: (zoom: number) => void;
  setScrollX: (x: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleSnap: () => void;
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  deselectAll: () => void;
  addTrack: (type: Track['type']) => void;
  removeTrack: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  addClip: (trackId: string, clip: Omit<Clip, 'id' | 'trackId'>) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, newTrackId: string, newStartTime: number) => void;
  trimClip: (clipId: string, side: 'start' | 'end', amount: number) => void;
  splitClip: (clipId: string, time: number) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  copyClips: () => void;
  pasteClips: () => void;
  cutClips: () => void;
  deleteSelectedClips: () => void;
  undo: () => void;
  redo: () => void;
  setLoop: (start: number | null, end: number | null) => void;
  getSnapPoint: (time: number, threshold?: number) => number;
}

export function useTimeline(initialTracks: Track[] = []): UseTimelineReturn {
  const [state, setState] = useState<TimelineState>({
    tracks: initialTracks,
    selectedClipIds: new Set(),
    playhead: 0,
    duration: 120,
    zoom: 1,
    scrollX: 0,
    isPlaying: false,
    playbackSpeed: 1,
    snapEnabled: true,
    snapPoints: [],
    loopStart: null,
    loopEnd: null,
  });

  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [clipboard, setClipboard] = useState<Clip[]>([]);
  const playbackRef = useRef<number | null>(null);

  const saveToHistory = useCallback((action: string) => {
    setUndoStack(prev => {
      const entry: HistoryEntry = { id: `hist-${Date.now()}`, action, timestamp: Date.now(), tracks: JSON.parse(JSON.stringify(state.tracks)) };
      return [...prev.slice(-49), entry];
    });
    setRedoStack([]);
  }, [state.tracks]);

  const totalDuration = useMemo(() => {
    let max = 0;
    state.tracks.forEach(track => {
      track.clips.forEach(clip => {
        const end = clip.startTime + clip.duration;
        if (end > max) max = end;
      });
    });
    return Math.max(max, state.duration);
  }, [state.tracks, state.duration]);

  const selectedClips = useMemo(() => {
    const clips: Clip[] = [];
    state.tracks.forEach(track => {
      track.clips.forEach(clip => {
        if (state.selectedClipIds.has(clip.id)) clips.push(clip);
      });
    });
    return clips;
  }, [state.tracks, state.selectedClipIds]);

  const snapPoints = useMemo(() => {
    const points: number[] = [0, totalDuration];
    state.tracks.forEach(track => {
      track.clips.forEach(clip => {
        points.push(clip.startTime);
        points.push(clip.startTime + clip.duration);
      });
    });
    return [...new Set(points)].sort((a, b) => a - b);
  }, [state.tracks, totalDuration]);

  const getSnapPoint = useCallback((time: number, threshold: number = 0.5): number => {
    if (!state.snapEnabled) return time;
    const thresholdInTime = threshold / state.zoom;
    for (const point of snapPoints) {
      if (Math.abs(time - point) < thresholdInTime) return point;
    }
    return time;
  }, [state.snapEnabled, state.zoom, snapPoints]);

  const setPlayhead = useCallback((time: number) => {
    setState(prev => ({ ...prev, playhead: Math.max(0, Math.min(totalDuration, time)) }));
  }, [totalDuration]);

  const setZoom = useCallback((zoom: number) => {
    setState(prev => ({ ...prev, zoom: Math.max(0.1, Math.min(10, zoom)) }));
  }, []);

  const setScrollX = useCallback((x: number) => {
    setState(prev => ({ ...prev, scrollX: Math.max(0, x) }));
  }, []);

  const play = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false }));
    if (playbackRef.current) { cancelAnimationFrame(playbackRef.current); playbackRef.current = null; }
  }, []);

  const stop = useCallback(() => {
    setState(prev => ({ ...prev, isPlaying: false, playhead: 0 }));
    if (playbackRef.current) { cancelAnimationFrame(playbackRef.current); playbackRef.current = null; }
  }, []);

  const setPlaybackSpeed = useCallback((speed: number) => {
    setState(prev => ({ ...prev, playbackSpeed: speed }));
  }, []);

  const toggleSnap = useCallback(() => {
    setState(prev => ({ ...prev, snapEnabled: !prev.snapEnabled }));
  }, []);

  const selectClip = useCallback((clipId: string, addToSelection: boolean = false) => {
    setState(prev => {
      const next = addToSelection ? new Set(prev.selectedClipIds) : new Set<string>();
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return { ...prev, selectedClipIds: next };
    });
  }, []);

  const deselectAll = useCallback(() => {
    setState(prev => ({ ...prev, selectedClipIds: new Set() }));
  }, []);

  const addTrack = useCallback((type: Track['type']) => {
    saveToHistory('add track');
    const colors = { video: '#6366f1', audio: '#10b981', text: '#f59e0b', effects: '#ec4899' };
    const newTrack: Track = { id: `track-${Date.now()}`, name: `${type} ${state.tracks.filter(t => t.type === type).length + 1}`, type, locked: false, visible: true, muted: false, height: type === 'video' ? 60 : 40, clips: [], color: colors[type] };
    setState(prev => ({ ...prev, tracks: [...prev.tracks, newTrack] }));
  }, [state.tracks, saveToHistory]);

  const removeTrack = useCallback((trackId: string) => {
    saveToHistory('remove track');
    setState(prev => ({ ...prev, tracks: prev.tracks.filter(t => t.id !== trackId) }));
  }, [saveToHistory]);

  const toggleTrackLock = useCallback((trackId: string) => {
    setState(prev => ({ ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, locked: !t.locked } : t) }));
  }, []);

  const toggleTrackVisibility = useCallback((trackId: string) => {
    setState(prev => ({ ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, visible: !t.visible } : t) }));
  }, []);

  const toggleTrackMute = useCallback((trackId: string) => {
    setState(prev => ({ ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, muted: !t.muted } : t) }));
  }, []);

  const addClip = useCallback((trackId: string, clipData: Omit<Clip, 'id' | 'trackId'>) => {
    saveToHistory('add clip');
    const clip: Clip = { ...clipData, id: `clip-${Date.now()}-${Math.random().toString(36).slice(2)}`, trackId };
    setState(prev => ({ ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t) }));
  }, [saveToHistory]);

  const removeClip = useCallback((clipId: string) => {
    saveToHistory('remove clip');
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => ({ ...t, clips: t.clips.filter(c => c.id !== clipId) })),
      selectedClipIds: (() => { const s = new Set(prev.selectedClipIds); s.delete(clipId); return s; })(),
    }));
  }, [saveToHistory]);

  const moveClip = useCallback((clipId: string, newTrackId: string, newStartTime: number) => {
    saveToHistory('move clip');
    const snappedTime = getSnapPoint(newStartTime);
    setState(prev => {
      let movedClip: Clip | null = null;
      const tracksWithout = prev.tracks.map(t => {
        const clip = t.clips.find(c => c.id === clipId);
        if (clip) movedClip = { ...clip, trackId: newTrackId, startTime: snappedTime };
        return { ...t, clips: t.clips.filter(c => c.id !== clipId) };
      });
      if (!movedClip) return prev;
      return { ...prev, tracks: tracksWithout.map(t => t.id === newTrackId ? { ...t, clips: [...t.clips, movedClip!] } : t) };
    });
  }, [saveToHistory, getSnapPoint]);

  const trimClip = useCallback((clipId: string, side: 'start' | 'end', amount: number) => {
    saveToHistory('trim clip');
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => ({
        ...t,
        clips: t.clips.map(c => {
          if (c.id !== clipId) return c;
          if (side === 'start') return { ...c, startTime: c.startTime + amount, duration: c.duration - amount, trimStart: c.trimStart + amount };
          return { ...c, duration: c.duration + amount, trimEnd: c.trimEnd - amount };
        }),
      })),
    }));
  }, [saveToHistory]);

  const splitClip = useCallback((clipId: string, time: number) => {
    saveToHistory('split clip');
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => {
        const clipIdx = t.clips.findIndex(c => c.id === clipId);
        if (clipIdx === -1) return t;
        const clip = t.clips[clipIdx];
        const splitPoint = time - clip.startTime;
        if (splitPoint <= 0 || splitPoint >= clip.duration) return t;
        const first: Clip = { ...clip, duration: splitPoint };
        const second: Clip = { ...clip, id: `${clip.id}-split-${Date.now()}`, startTime: clip.startTime + splitPoint, duration: clip.duration - splitPoint, trimStart: clip.trimStart + splitPoint };
        const newClips = [...t.clips]; newClips.splice(clipIdx, 1, first, second);
        return { ...t, clips: newClips };
      }),
    }));
  }, [saveToHistory]);

  const updateClip = useCallback((clipId: string, updates: Partial<Clip>) => {
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => ({ ...t, clips: t.clips.map(c => c.id === clipId ? { ...c, ...updates } : c) })),
    }));
  }, []);

  const copyClips = useCallback(() => {
    setClipboard(selectedClips.map(c => ({ ...c })));
  }, [selectedClips]);

  const pasteClips = useCallback(() => {
    if (clipboard.length === 0) return;
    saveToHistory('paste');
    const offset = state.playhead;
    clipboard.forEach(clip => {
      const pastedClip: Clip = { ...clip, id: `clip-paste-${Date.now()}-${Math.random().toString(36).slice(2)}`, startTime: offset };
      setState(prev => ({ ...prev, tracks: prev.tracks.map(t => t.id === clip.trackId ? { ...t, clips: [...t.clips, pastedClip] } : t) }));
    });
  }, [clipboard, state.playhead, saveToHistory]);

  const cutClips = useCallback(() => {
    copyClips();
    deleteSelectedClips();
  }, []);

  const deleteSelectedClips = useCallback(() => {
    if (state.selectedClipIds.size === 0) return;
    saveToHistory('delete');
    setState(prev => ({
      ...prev,
      tracks: prev.tracks.map(t => ({ ...t, clips: t.clips.filter(c => !prev.selectedClipIds.has(c.id)) })),
      selectedClipIds: new Set(),
    }));
  }, [state.selectedClipIds, saveToHistory]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, { id: `redo-${Date.now()}`, action: 'undo', timestamp: Date.now(), tracks: JSON.parse(JSON.stringify(state.tracks)) }]);
    setState(s => ({ ...s, tracks: prev.tracks }));
    setUndoStack(u => u.slice(0, -1));
  }, [undoStack, state.tracks]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, { id: `undo-${Date.now()}`, action: 'redo', timestamp: Date.now(), tracks: JSON.parse(JSON.stringify(state.tracks)) }]);
    setState(s => ({ ...s, tracks: next.tracks }));
    setRedoStack(r => r.slice(0, -1));
  }, [redoStack, state.tracks]);

  const setLoop = useCallback((start: number | null, end: number | null) => {
    setState(prev => ({ ...prev, loopStart: start, loopEnd: end }));
  }, []);

  return {
    state, tracks: state.tracks, selectedClips, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, totalDuration,
    setPlayhead, setZoom, setScrollX, play, pause, stop, setPlaybackSpeed, toggleSnap, selectClip, deselectAll,
    addTrack, removeTrack, toggleTrackLock, toggleTrackVisibility, toggleTrackMute,
    addClip, removeClip, moveClip, trimClip, splitClip, updateClip,
    copyClips, pasteClips, cutClips, deleteSelectedClips, undo, redo, setLoop, getSnapPoint,
  };
}

export default useTimeline;
