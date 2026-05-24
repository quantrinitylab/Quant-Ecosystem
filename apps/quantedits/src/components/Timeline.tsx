// ============================================================================
// QuantEdits - Timeline Component
// Video timeline with tracks, clips, transitions, and playhead
// ============================================================================

import type { Timeline as TimelineType, Track, Clip, Transition } from '../types';

interface TimelineProps {
  timeline: TimelineType;
  currentTime: number;
  zoom: number;
  selectedClipId: string | null;
  onSeek: (time: number) => void;
  onClipSelect: (clipId: string) => void;
  onClipMove: (clipId: string, newStart: number) => void;
  onClipTrim: (clipId: string, trimStart: number, trimEnd: number) => void;
  onClipSplit: (clipId: string, time: number) => void;
  onTrackMute: (trackId: string) => void;
  onTrackLock: (trackId: string) => void;
  onAddTransition: (clipId: string, position: 'in' | 'out', transition: Transition) => void;
}

export function Timeline({ timeline, currentTime, zoom, selectedClipId, onSeek, onClipSelect, onClipMove, onClipTrim, onClipSplit, onTrackMute, onTrackLock, onAddTransition }: TimelineProps) {
  const pixelsPerSecond = 50 * zoom;
  const totalWidth = timeline.duration * pixelsPerSecond;

  const timeToPixels = (time: number) => time * pixelsPerSecond;
  const pixelsToTime = (px: number) => px / pixelsPerSecond;

  const generateTimeMarkers = () => {
    const markers = [];
    const interval = zoom > 2 ? 0.5 : zoom > 1 ? 1 : 5;
    for (let t = 0; t <= timeline.duration; t += interval) {
      markers.push({ time: t, label: formatTime(t), position: timeToPixels(t) });
    }
    return markers;
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 30);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };

  return {
    type: 'div',
    className: 'timeline-container',
    children: [
      // Time ruler
      { type: 'div', className: 'time-ruler', style: { width: totalWidth }, children: generateTimeMarkers().map(m => ({
        type: 'div', className: 'time-marker', style: { left: m.position },
        children: [{ type: 'span', text: m.label }],
      }))},
      // Playhead
      { type: 'div', className: 'playhead', style: { left: timeToPixels(currentTime), height: '100%' } },
      // Tracks
      { type: 'div', className: 'tracks-container', children: timeline.tracks.map(track => ({
        type: 'div',
        className: `track ${track.muted ? 'muted' : ''} ${track.locked ? 'locked' : ''}`,
        style: { height: track.height },
        children: [
          // Track header
          { type: 'div', className: 'track-header', children: [
            { type: 'span', className: `track-icon track-${track.type}` },
            { type: 'span', text: track.name, className: 'track-name' },
            { type: 'button', text: track.muted ? 'M' : 'm', onClick: () => onTrackMute(track.id), className: 'track-mute' },
            { type: 'button', text: track.locked ? 'L' : 'l', onClick: () => onTrackLock(track.id), className: 'track-lock' },
          ]},
          // Clips
          { type: 'div', className: 'clips-area', style: { width: totalWidth }, children: track.clips.map(clip => ({
            type: 'div',
            className: `clip ${clip.id === selectedClipId ? 'selected' : ''} clip-${track.type}`,
            style: {
              left: timeToPixels(clip.startTime),
              width: timeToPixels(clip.endTime - clip.startTime),
            },
            onClick: () => onClipSelect(clip.id),
            children: [
              // Trim handles
              { type: 'div', className: 'trim-handle trim-left' },
              { type: 'div', className: 'clip-content', children: [
                { type: 'span', text: formatTime(clip.endTime - clip.startTime), className: 'clip-duration' },
              ]},
              { type: 'div', className: 'trim-handle trim-right' },
              // Transitions
              clip.transitions.in ? { type: 'div', className: 'transition transition-in', style: { width: timeToPixels(clip.transitions.in.duration) } } : null,
              clip.transitions.out ? { type: 'div', className: 'transition transition-out', style: { width: timeToPixels(clip.transitions.out.duration) } } : null,
            ],
          }))},
        ],
      }))},
      // Timeline markers
      { type: 'div', className: 'markers', children: timeline.markers.map(marker => ({
        type: 'div', className: 'marker', style: { left: timeToPixels(marker.time), backgroundColor: marker.color },
        title: marker.label,
      }))},
    ],
  };
}

export default Timeline;
