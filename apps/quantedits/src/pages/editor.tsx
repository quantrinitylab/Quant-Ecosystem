// ============================================================================
// QuantEdits - Timeline Video Editor
// Toolbar, timeline with multi-track, playback controls, properties, preview
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

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
  filters: FilterSettings;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
}

interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'effects';
  locked: boolean;
  visible: boolean;
  height: number;
  clips: Clip[];
}

interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  hue: number;
}

interface HistoryEntry {
  id: string;
  action: string;
  timestamp: number;
  state: Track[];
}

interface EditorProps {
  projectId: string;
}

type ToolType = 'select' | 'cut' | 'text' | 'draw' | 'crop';
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '4:3';

const TimelineEditor: React.FC<EditorProps> = ({ projectId }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [duration, setDuration] = useState(120);
  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  const playbackRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadProject = async () => {
      setLoading(true);
      try {
        const mockTracks: Track[] = [
          {
            id: 'track-video-1', name: 'Video 1', type: 'video', locked: false, visible: true, height: 60,
            clips: [
              { id: 'clip-1', trackId: 'track-video-1', name: 'Intro.mp4', startTime: 0, duration: 15, trimStart: 0, trimEnd: 0, type: 'video', thumbnail: '/clips/intro.jpg', volume: 1, opacity: 1, filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0 }, position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
              { id: 'clip-2', trackId: 'track-video-1', name: 'Main.mp4', startTime: 15, duration: 45, trimStart: 0, trimEnd: 0, type: 'video', thumbnail: '/clips/main.jpg', volume: 1, opacity: 1, filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0 }, position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
            ],
          },
          {
            id: 'track-audio-1', name: 'Audio 1', type: 'audio', locked: false, visible: true, height: 40,
            clips: [
              { id: 'clip-3', trackId: 'track-audio-1', name: 'BGM.mp3', startTime: 0, duration: 60, trimStart: 0, trimEnd: 0, type: 'audio', thumbnail: '', volume: 0.7, opacity: 1, filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0 }, position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 },
            ],
          },
          {
            id: 'track-text-1', name: 'Text', type: 'text', locked: false, visible: true, height: 40,
            clips: [
              { id: 'clip-4', trackId: 'track-text-1', name: 'Title', startTime: 0, duration: 5, trimStart: 0, trimEnd: 0, type: 'text', thumbnail: '', volume: 1, opacity: 1, filters: { brightness: 0, contrast: 0, saturation: 0, blur: 0, hue: 0 }, position: { x: 0.5, y: 0.2 }, scale: { x: 1, y: 1 }, rotation: 0 },
            ],
          },
          { id: 'track-effects', name: 'Effects', type: 'effects', locked: false, visible: true, height: 40, clips: [] },
        ];
        setTracks(mockTracks);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project');
        setLoading(false);
      }
    };
    loadProject();
  }, [projectId]);

  const saveToHistory = useCallback((action: string) => {
    const entry: HistoryEntry = { id: `hist-${Date.now()}`, action, timestamp: Date.now(), state: JSON.parse(JSON.stringify(tracks)) };
    setUndoStack(prev => [...prev.slice(-49), entry]);
    setRedoStack([]);
  }, [tracks]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, { id: `redo-${Date.now()}`, action: 'undo', timestamp: Date.now(), state: JSON.parse(JSON.stringify(tracks)) }]);
    setTracks(prev.state);
    setUndoStack(u => u.slice(0, -1));
  }, [undoStack, tracks]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, { id: `undo-${Date.now()}`, action: 'redo', timestamp: Date.now(), state: JSON.parse(JSON.stringify(tracks)) }]);
    setTracks(next.state);
    setRedoStack(r => r.slice(0, -1));
  }, [redoStack, tracks]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    if (playbackRef.current) {
      cancelAnimationFrame(playbackRef.current);
      playbackRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    let lastTime = performance.now();
    const animate = (now: number) => {
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      setPlayhead(prev => {
        const next = prev + delta * playbackSpeed;
        if (next >= duration) { setIsPlaying(false); return 0; }
        return next;
      });
      playbackRef.current = requestAnimationFrame(animate);
    };
    playbackRef.current = requestAnimationFrame(animate);
    return () => { if (playbackRef.current) cancelAnimationFrame(playbackRef.current); };
  }, [isPlaying, playbackSpeed, duration]);

  const handleCut = useCallback(() => {
    if (!selectedClip) return;
    saveToHistory('cut');
    const clipTime = playhead - selectedClip.startTime;
    if (clipTime <= 0 || clipTime >= selectedClip.duration) return;
    setTracks(prev => prev.map(track => {
      const clipIdx = track.clips.findIndex(c => c.id === selectedClip.id);
      if (clipIdx === -1) return track;
      const clip = track.clips[clipIdx];
      const firstHalf: Clip = { ...clip, duration: clipTime };
      const secondHalf: Clip = { ...clip, id: `${clip.id}-split`, startTime: clip.startTime + clipTime, duration: clip.duration - clipTime, trimStart: clip.trimStart + clipTime };
      const newClips = [...track.clips];
      newClips.splice(clipIdx, 1, firstHalf, secondHalf);
      return { ...track, clips: newClips };
    }));
  }, [selectedClip, playhead, saveToHistory]);

  const handleCopy = useCallback(() => {
    if (selectedClip) setClipboard({ ...selectedClip });
  }, [selectedClip]);

  const handlePaste = useCallback(() => {
    if (!clipboard) return;
    saveToHistory('paste');
    const pastedClip: Clip = { ...clipboard, id: `clip-paste-${Date.now()}`, startTime: playhead };
    setTracks(prev => prev.map(track => {
      if (track.id === clipboard.trackId) return { ...track, clips: [...track.clips, pastedClip] };
      return track;
    }));
  }, [clipboard, playhead, saveToHistory]);

  const handleDeleteClip = useCallback(() => {
    if (!selectedClip) return;
    saveToHistory('delete');
    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.filter(c => c.id !== selectedClip.id),
    })));
    setSelectedClip(null);
  }, [selectedClip, saveToHistory]);

  const handleClipSelect = useCallback((clip: Clip) => {
    setSelectedClip(clip);
  }, []);

  const handleAddTrack = useCallback((type: Track['type']) => {
    const newTrack: Track = {
      id: `track-${type}-${Date.now()}`,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${tracks.filter(t => t.type === type).length + 1}`,
      type,
      locked: false,
      visible: true,
      height: type === 'video' ? 60 : 40,
      clips: [],
    };
    setTracks(prev => [...prev, newTrack]);
  }, [tracks]);

  const handleToggleTrackLock = useCallback((trackId: string) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, locked: !t.locked } : t));
  }, []);

  const handleToggleTrackVisibility = useCallback((trackId: string) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, visible: !t.visible } : t));
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  }, []);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = (x / rect.width) * duration / zoom;
    setPlayhead(Math.max(0, Math.min(duration, time)));
  }, [duration, zoom]);

  const updateClipProperty = useCallback((property: string, value: number | string) => {
    if (!selectedClip) return;
    saveToHistory(`update ${property}`);
    setTracks(prev => prev.map(track => ({
      ...track,
      clips: track.clips.map(clip => {
        if (clip.id !== selectedClip.id) return clip;
        if (property === 'volume') return { ...clip, volume: value as number };
        if (property === 'opacity') return { ...clip, opacity: value as number };
        if (property === 'rotation') return { ...clip, rotation: value as number };
        if (property.startsWith('filter.')) {
          const filterKey = property.split('.')[1] as keyof FilterSettings;
          return { ...clip, filters: { ...clip.filters, [filterKey]: value } };
        }
        return clip;
      }),
    })));
    setSelectedClip(prev => prev ? { ...prev, [property]: value } : null);
  }, [selectedClip, saveToHistory]);

  if (loading) {
    return (
      <div className="editor-loading">
        <div className="loading-spinner" />
        <p>Loading project...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="editor-error">
        <h3>Error loading project</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="timeline-editor">
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <button className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')} title="Select (V)">&#9654;</button>
          <button className={`tool-btn ${activeTool === 'cut' ? 'active' : ''}`} onClick={() => setActiveTool('cut')} title="Cut (C)">&#9986;</button>
          <button className={`tool-btn ${activeTool === 'text' ? 'active' : ''}`} onClick={() => setActiveTool('text')} title="Text (T)">T</button>
          <button className={`tool-btn ${activeTool === 'draw' ? 'active' : ''}`} onClick={() => setActiveTool('draw')} title="Draw (D)">&#9998;</button>
          <button className={`tool-btn ${activeTool === 'crop' ? 'active' : ''}`} onClick={() => setActiveTool('crop')} title="Crop (R)">&#9634;</button>
          <div className="toolbar-divider" />
          <button className="tool-btn" onClick={handleCut} disabled={!selectedClip} title="Split (S)">&#8967;</button>
          <button className="tool-btn" onClick={handleCopy} disabled={!selectedClip} title="Copy">&#128203;</button>
          <button className="tool-btn" onClick={handlePaste} disabled={!clipboard} title="Paste">&#128204;</button>
          <button className="tool-btn" onClick={handleDeleteClip} disabled={!selectedClip} title="Delete">&#128465;</button>
        </div>
        <div className="toolbar-center">
          <button className="tool-btn" onClick={handleUndo} disabled={undoStack.length === 0} title="Undo">&#8630;</button>
          <button className="tool-btn" onClick={handleRedo} disabled={redoStack.length === 0} title="Redo">&#8631;</button>
          <span className="history-count">{undoStack.length} changes</span>
        </div>
        <div className="toolbar-right">
          <label className="snap-toggle">
            <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
            Snap
          </label>
          <div className="zoom-control">
            <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}>-</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(4, z + 0.25))}>+</button>
          </div>
        </div>
      </div>

      <div className="editor-main">
        <div className="preview-panel">
          <div className="preview-window" ref={previewRef}>
            <div className={`preview-canvas aspect-${aspectRatio.replace(':', '-')}`}>
              <div className="preview-content">
                {selectedClip && selectedClip.type === 'video' && (
                  <img src={selectedClip.thumbnail} alt="Preview" className="preview-frame" />
                )}
                {selectedClip && selectedClip.type === 'text' && (
                  <div className="preview-text" style={{ left: `${selectedClip.position.x * 100}%`, top: `${selectedClip.position.y * 100}%` }}>
                    {selectedClip.name}
                  </div>
                )}
                {!selectedClip && <div className="preview-placeholder">Select a clip to preview</div>}
              </div>
            </div>
          </div>
          <div className="preview-controls">
            <div className="aspect-ratio-selector">
              {(['16:9', '9:16', '1:1', '4:5', '4:3'] as AspectRatio[]).map(ratio => (
                <button key={ratio} className={`ratio-btn ${aspectRatio === ratio ? 'active' : ''}`} onClick={() => setAspectRatio(ratio)}>{ratio}</button>
              ))}
            </div>
          </div>
        </div>

        {showProperties && selectedClip && (
          <div className="properties-panel">
            <div className="properties-header">
              <h3>Properties</h3>
              <button className="close-panel-btn" onClick={() => setShowProperties(false)}>x</button>
            </div>
            <div className="property-group">
              <label>Name</label>
              <span className="property-value">{selectedClip.name}</span>
            </div>
            <div className="property-group">
              <label>Position X</label>
              <input type="range" min={0} max={1} step={0.01} value={selectedClip.position.x} onChange={(e) => updateClipProperty('position.x', parseFloat(e.target.value))} />
            </div>
            <div className="property-group">
              <label>Position Y</label>
              <input type="range" min={0} max={1} step={0.01} value={selectedClip.position.y} onChange={(e) => updateClipProperty('position.y', parseFloat(e.target.value))} />
            </div>
            <div className="property-group">
              <label>Rotation</label>
              <input type="range" min={0} max={360} value={selectedClip.rotation} onChange={(e) => updateClipProperty('rotation', parseInt(e.target.value))} />
              <span>{selectedClip.rotation}deg</span>
            </div>
            <div className="property-group">
              <label>Opacity</label>
              <input type="range" min={0} max={1} step={0.01} value={selectedClip.opacity} onChange={(e) => updateClipProperty('opacity', parseFloat(e.target.value))} />
              <span>{Math.round(selectedClip.opacity * 100)}%</span>
            </div>
            <div className="property-group">
              <label>Volume</label>
              <input type="range" min={0} max={1} step={0.01} value={selectedClip.volume} onChange={(e) => updateClipProperty('volume', parseFloat(e.target.value))} />
              <span>{Math.round(selectedClip.volume * 100)}%</span>
            </div>
            <h4>Filters</h4>
            <div className="property-group">
              <label>Brightness</label>
              <input type="range" min={-100} max={100} value={selectedClip.filters.brightness} onChange={(e) => updateClipProperty('filter.brightness', parseInt(e.target.value))} />
            </div>
            <div className="property-group">
              <label>Contrast</label>
              <input type="range" min={-100} max={100} value={selectedClip.filters.contrast} onChange={(e) => updateClipProperty('filter.contrast', parseInt(e.target.value))} />
            </div>
            <div className="property-group">
              <label>Saturation</label>
              <input type="range" min={-100} max={100} value={selectedClip.filters.saturation} onChange={(e) => updateClipProperty('filter.saturation', parseInt(e.target.value))} />
            </div>
            <div className="property-group">
              <label>Blur</label>
              <input type="range" min={0} max={20} value={selectedClip.filters.blur} onChange={(e) => updateClipProperty('filter.blur', parseInt(e.target.value))} />
            </div>
          </div>
        )}
      </div>

      <div className="playback-bar">
        <div className="playback-controls">
          <button className="playback-btn" onClick={() => setPlayhead(0)} title="Start">|&lt;</button>
          <button className="playback-btn" onClick={() => setPlayhead(p => Math.max(0, p - 5))} title="Back 5s">&lt;&lt;</button>
          {isPlaying ? (
            <button className="playback-btn play-btn" onClick={handlePause} title="Pause">&#9646;&#9646;</button>
          ) : (
            <button className="playback-btn play-btn" onClick={handlePlay} title="Play">&#9654;</button>
          )}
          <button className="playback-btn" onClick={() => setPlayhead(p => Math.min(duration, p + 5))} title="Forward 5s">&gt;&gt;</button>
          <button className="playback-btn" onClick={() => setPlayhead(duration)} title="End">&gt;|</button>
        </div>
        <div className="time-display">
          <span className="current-time">{formatTime(playhead)}</span>
          <span className="time-separator">/</span>
          <span className="total-time">{formatTime(duration)}</span>
        </div>
        <div className="speed-control">
          <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}>
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>
        </div>
        <div className="volume-control">
          <button onClick={() => setIsMuted(!isMuted)}>{isMuted ? '🔇' : '🔊'}</button>
          <input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(false); }} />
        </div>
      </div>

      <div className="timeline-panel" ref={timelineRef} onClick={handleTimelineClick}>
        <div className="time-ruler">
          {Array.from({ length: Math.ceil(duration * zoom) }, (_, i) => (
            <div key={i} className="time-marker" style={{ left: `${(i / (duration * zoom)) * 100}%` }}>
              <span className="time-label">{formatTime(i / zoom)}</span>
            </div>
          ))}
        </div>
        <div className="playhead-line" style={{ left: `${(playhead / duration) * 100}%` }}>
          <div className="playhead-handle" />
        </div>
        <div className="tracks-container">
          {tracks.map(track => (
            <div key={track.id} className={`track ${track.locked ? 'locked' : ''} ${!track.visible ? 'hidden' : ''}`} style={{ height: track.height }}>
              <div className="track-header">
                <span className="track-name">{track.name}</span>
                <div className="track-controls">
                  <button className="track-btn" onClick={() => handleToggleTrackVisibility(track.id)} title={track.visible ? 'Hide' : 'Show'}>
                    {track.visible ? '👁' : '👁‍🗨'}
                  </button>
                  <button className="track-btn" onClick={() => handleToggleTrackLock(track.id)} title={track.locked ? 'Unlock' : 'Lock'}>
                    {track.locked ? '🔒' : '🔓'}
                  </button>
                </div>
              </div>
              <div className="track-content">
                {track.clips.map(clip => (
                  <div
                    key={clip.id}
                    className={`clip clip-${clip.type} ${selectedClip?.id === clip.id ? 'selected' : ''}`}
                    style={{
                      left: `${(clip.startTime / duration) * 100}%`,
                      width: `${(clip.duration / duration) * 100}%`,
                      opacity: clip.opacity,
                    }}
                    onClick={(e) => { e.stopPropagation(); handleClipSelect(clip); }}
                  >
                    <div className="clip-content">
                      {clip.type === 'video' && clip.thumbnail && <img src={clip.thumbnail} alt="" className="clip-thumb" />}
                      <span className="clip-name">{clip.name}</span>
                    </div>
                    <div className="clip-handles">
                      <div className="handle handle-left" />
                      <div className="handle handle-right" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="add-track-bar">
          <button onClick={() => handleAddTrack('video')}>+ Video</button>
          <button onClick={() => handleAddTrack('audio')}>+ Audio</button>
          <button onClick={() => handleAddTrack('text')}>+ Text</button>
          <button onClick={() => handleAddTrack('effects')}>+ Effects</button>
        </div>
      </div>
    </div>
  );
};

export default TimelineEditor;
