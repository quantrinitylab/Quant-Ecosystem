// ============================================================================
// QuantEdits - Timeline Component
// Multi-track timeline with clips, playhead, zoom, drag, trim, split, right-click
// ============================================================================

import React, { useState, useCallback, useRef, useMemo } from 'react';

interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startTime: number;
  duration: number;
  type: 'video' | 'audio' | 'text' | 'effect';
  color: string;
  thumbnail: string;
  trimStart: number;
  trimEnd: number;
  locked: boolean;
}

interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'text' | 'effects';
  locked: boolean;
  visible: boolean;
  muted: boolean;
  height: number;
  clips: TimelineClip[];
  color: string;
}

interface TimelineProps {
  tracks: TimelineTrack[];
  playhead: number;
  duration: number;
  zoom: number;
  isPlaying: boolean;
  selectedClipIds: Set<string>;
  onPlayheadChange: (time: number) => void;
  onClipSelect: (clipId: string, addToSelection?: boolean) => void;
  onClipMove: (clipId: string, newTrackId: string, newStartTime: number) => void;
  onClipTrim: (clipId: string, side: 'start' | 'end', newDuration: number) => void;
  onClipSplit: (clipId: string, time: number) => void;
  onClipDelete: (clipId: string) => void;
  onClipDuplicate: (clipId: string) => void;
  onTrackToggleLock: (trackId: string) => void;
  onTrackToggleVisibility: (trackId: string) => void;
  onTrackToggleMute: (trackId: string) => void;
  onZoomChange: (zoom: number) => void;
}

const Timeline: React.FC<TimelineProps> = ({
  tracks,
  playhead,
  duration,
  zoom,
  isPlaying,
  selectedClipIds,
  onPlayheadChange,
  onClipSelect,
  onClipMove,
  onClipTrim,
  onClipSplit,
  onClipDelete,
  onClipDuplicate,
  onTrackToggleLock,
  onTrackToggleVisibility,
  onTrackToggleMute,
  onZoomChange,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragClipId, setDragClipId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimSide, setTrimSide] = useState<'start' | 'end'>('end');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const timelineRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);

  const pixelsPerSecond = useMemo(() => 50 * zoom, [zoom]);
  const totalWidth = useMemo(() => duration * pixelsPerSecond, [duration, pixelsPerSecond]);

  const timeToPixels = useCallback((time: number): number => time * pixelsPerSecond, [pixelsPerSecond]);
  const pixelsToTime = useCallback((pixels: number): number => pixels / pixelsPerSecond, [pixelsPerSecond]);

  const formatTime = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const handleRulerClick = useCallback((e: React.MouseEvent) => {
    if (!rulerRef.current) return;
    const rect = rulerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const time = pixelsToTime(x);
    onPlayheadChange(Math.max(0, Math.min(duration, time)));
  }, [pixelsToTime, duration, scrollLeft, onPlayheadChange]);

  const handleClipMouseDown = useCallback((e: React.MouseEvent, clipId: string, clip: TimelineClip) => {
    if (clip.locked) return;
    e.stopPropagation();
    const target = e.target as HTMLElement;
    if (target.classList.contains('trim-handle-left')) {
      setIsTrimming(true);
      setTrimSide('start');
      setDragClipId(clipId);
      setDragStartX(e.clientX);
    } else if (target.classList.contains('trim-handle-right')) {
      setIsTrimming(true);
      setTrimSide('end');
      setDragClipId(clipId);
      setDragStartX(e.clientX);
    } else {
      setIsDragging(true);
      setDragClipId(clipId);
      setDragStartX(e.clientX);
      setDragStartTime(clip.startTime);
    }
    onClipSelect(clipId, e.ctrlKey || e.metaKey);
  }, [onClipSelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragClipId) return;
    const deltaX = e.clientX - dragStartX;
    const deltaTime = pixelsToTime(deltaX);
    if (isDragging) {
      const newStart = Math.max(0, dragStartTime + deltaTime);
      onClipMove(dragClipId, '', newStart);
    } else if (isTrimming) {
      onClipTrim(dragClipId, trimSide, deltaTime);
    }
  }, [dragClipId, isDragging, isTrimming, dragStartX, dragStartTime, trimSide, pixelsToTime, onClipMove, onClipTrim]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsTrimming(false);
    setDragClipId(null);
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, clipId });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleSplitAtPlayhead = useCallback(() => {
    if (contextMenu) {
      onClipSplit(contextMenu.clipId, playhead);
      setContextMenu(null);
    }
  }, [contextMenu, playhead, onClipSplit]);

  const rulerMarks = useMemo(() => {
    const marks: { time: number; x: number; major: boolean }[] = [];
    const interval = zoom >= 2 ? 1 : zoom >= 1 ? 2 : 5;
    for (let t = 0; t <= duration; t += interval) {
      marks.push({ time: t, x: timeToPixels(t), major: t % (interval * 5) === 0 });
    }
    return marks;
  }, [duration, zoom, timeToPixels]);

  return (
    <div className="timeline-component" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
      <div className="timeline-toolbar">
        <div className="zoom-controls">
          <button onClick={() => onZoomChange(Math.max(0.25, zoom - 0.25))} title="Zoom Out">-</button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button onClick={() => onZoomChange(Math.min(4, zoom + 0.25))} title="Zoom In">+</button>
          <button onClick={() => onZoomChange(1)} title="Reset Zoom">1:1</button>
        </div>
      </div>

      <div className="timeline-ruler" ref={rulerRef} onClick={handleRulerClick} style={{ width: totalWidth }}>
        {rulerMarks.map((mark, i) => (
          <div key={i} className={`ruler-mark ${mark.major ? 'major' : 'minor'}`} style={{ left: mark.x }}>
            {mark.major && <span className="ruler-label">{formatTime(mark.time)}</span>}
          </div>
        ))}
      </div>

      <div className="timeline-body" ref={timelineRef} onScroll={(e) => setScrollLeft((e.target as HTMLElement).scrollLeft)}>
        <div className="playhead-container" style={{ width: totalWidth }}>
          <div className="playhead" style={{ left: timeToPixels(playhead) }}>
            <div className="playhead-head" />
            <div className="playhead-line" />
          </div>
        </div>

        <div className="tracks-list">
          {tracks.map(track => (
            <div key={track.id} className={`timeline-track ${track.locked ? 'locked' : ''} ${!track.visible ? 'hidden-track' : ''}`} style={{ height: track.height }}>
              <div className="track-sidebar">
                <span className="track-name">{track.name}</span>
                <div className="track-buttons">
                  <button onClick={() => onTrackToggleVisibility(track.id)} title="Visibility" className="track-btn">{track.visible ? '👁' : '◌'}</button>
                  <button onClick={() => onTrackToggleLock(track.id)} title="Lock" className="track-btn">{track.locked ? '🔒' : '🔓'}</button>
                  {(track.type === 'audio' || track.type === 'video') && (
                    <button onClick={() => onTrackToggleMute(track.id)} title="Mute" className="track-btn">{track.muted ? '🔇' : '🔊'}</button>
                  )}
                </div>
              </div>
              <div className="track-clips" style={{ width: totalWidth }}>
                {track.clips.map(clip => (
                  <div
                    key={clip.id}
                    className={`timeline-clip ${selectedClipIds.has(clip.id) ? 'selected' : ''} ${clip.locked ? 'locked' : ''} clip-${clip.type}`}
                    style={{ left: timeToPixels(clip.startTime), width: timeToPixels(clip.duration), backgroundColor: clip.color }}
                    onMouseDown={(e) => handleClipMouseDown(e, clip.id, clip)}
                    onContextMenu={(e) => handleContextMenu(e, clip.id)}
                  >
                    <div className="trim-handle-left" />
                    <div className="clip-body">
                      {clip.type === 'video' && clip.thumbnail && (
                        <img src={clip.thumbnail} alt="" className="clip-thumbnail" />
                      )}
                      {clip.type === 'audio' && <div className="audio-waveform-mini" />}
                      <span className="clip-label">{clip.name}</span>
                    </div>
                    <div className="trim-handle-right" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={handleCloseContextMenu}>
          <button onClick={handleSplitAtPlayhead}>Split at Playhead</button>
          <button onClick={() => { onClipDuplicate(contextMenu.clipId); setContextMenu(null); }}>Duplicate</button>
          <button onClick={() => { onClipDelete(contextMenu.clipId); setContextMenu(null); }}>Delete</button>
          <div className="context-divider" />
          <button onClick={handleCloseContextMenu}>Cancel</button>
        </div>
      )}
    </div>
  );
};

export default Timeline;
