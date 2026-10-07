// ============================================================================
// QuantChat - ReelEditor Component (Task 4.1)
// Editing screen presented after a video is captured / selected:
//   - Trim slider with two draggable handles, constrained to 5-60 seconds
//   - Text overlay editor: add text, drag to reposition, pick a color
//   - Cover frame selector (scrub within the trimmed range)
// On publish, emits the assembled ReelEditData to the parent (which hands it to
// the ReelUploader).
//
// Requirements: 4.2 (trim 5-60s, text overlays, cover frame selection)
// ============================================================================
'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MAX_REEL_DURATION_SECONDS, MIN_REEL_DURATION_SECONDS } from '../../../lib/reel-validation';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TextOverlay {
  id: string;
  text: string;
  /** Normalized horizontal position (0-1) within the preview. */
  x: number;
  /** Normalized vertical position (0-1) within the preview. */
  y: number;
  /** CSS color string. */
  color: string;
}

export interface ReelEditData {
  /** Trim start in seconds (>= 0). */
  trimStart: number;
  /** Trim end in seconds. */
  trimEnd: number;
  /** Resulting clip duration (trimEnd - trimStart), always within 5-60s. */
  duration: number;
  /** Timestamp (seconds) of the selected cover frame, within the trim range. */
  coverFrameTimestamp: number;
  /** Text overlays baked onto the reel. */
  textOverlays: TextOverlay[];
}

interface ReelEditorProps {
  /** Object URL or remote URL of the source video to edit. */
  videoUrl: string;
  onPublish: (data: ReelEditData) => void;
  onCancel?: () => void;
}

const OVERLAY_COLORS = [
  '#ffffff',
  '#000000',
  '#a855f7', // purple
  '#3b82f6', // blue
  '#22d3ee', // cyan
  '#f43f5e', // rose
  '#facc15', // yellow
  '#4ade80', // green
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

type DragTarget = 'start' | 'end' | null;

export function ReelEditor({ videoUrl, onPublish, onCancel }: ReelEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const overlayIdPrefix = useId();

  const [videoDuration, setVideoDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [coverFrameTimestamp, setCoverFrameTimestamp] = useState(0);
  const [overlays, setOverlays] = useState<TextOverlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<DragTarget>(null);
  const [draggingOverlayId, setDraggingOverlayId] = useState<string | null>(null);

  const clipDuration = Math.max(0, trimEnd - trimStart);

  // Initialize trim range once the video metadata (duration) is known.
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    setVideoDuration(duration);

    const initialEnd = Math.min(duration, MAX_REEL_DURATION_SECONDS);
    setTrimStart(0);
    setTrimEnd(initialEnd);
    setCoverFrameTimestamp(0);
  }, []);

  // Keep the preview frame in sync with the selected cover timestamp while not
  // actively dragging a trim handle.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || draggingHandle) return;
    if (Number.isFinite(coverFrameTimestamp)) {
      try {
        video.currentTime = coverFrameTimestamp;
      } catch {
        /* seeking before metadata is ready - ignore */
      }
    }
  }, [coverFrameTimestamp, draggingHandle]);

  // -------------------------------------------------------------------------
  // Trim handle dragging
  // -------------------------------------------------------------------------

  const positionToSeconds = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track || videoDuration <= 0) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return ratio * videoDuration;
    },
    [videoDuration],
  );

  const handleTrimPointerMove = useCallback(
    (clientX: number) => {
      if (!draggingHandle || videoDuration <= 0) return;
      const seconds = positionToSeconds(clientX);

      if (draggingHandle === 'start') {
        // Start must keep clip within [MIN, MAX] seconds.
        const maxStart = Math.max(0, trimEnd - MIN_REEL_DURATION_SECONDS);
        const minStart = Math.max(0, trimEnd - MAX_REEL_DURATION_SECONDS);
        const next = clamp(seconds, minStart, maxStart);
        setTrimStart(next);
        setCoverFrameTimestamp((prev) => clamp(prev, next, trimEnd));
        const video = videoRef.current;
        if (video) video.currentTime = next;
      } else {
        const minEnd = Math.min(videoDuration, trimStart + MIN_REEL_DURATION_SECONDS);
        const maxEnd = Math.min(videoDuration, trimStart + MAX_REEL_DURATION_SECONDS);
        const next = clamp(seconds, minEnd, maxEnd);
        setTrimEnd(next);
        setCoverFrameTimestamp((prev) => clamp(prev, trimStart, next));
        const video = videoRef.current;
        if (video) video.currentTime = next;
      }
    },
    [draggingHandle, positionToSeconds, trimEnd, trimStart, videoDuration],
  );

  // Global pointer listeners while dragging a trim handle.
  useEffect(() => {
    if (!draggingHandle) return;
    const onMove = (e: PointerEvent) => handleTrimPointerMove(e.clientX);
    const onUp = () => setDraggingHandle(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggingHandle, handleTrimPointerMove]);

  const startPct = videoDuration > 0 ? (trimStart / videoDuration) * 100 : 0;
  const endPct = videoDuration > 0 ? (trimEnd / videoDuration) * 100 : 100;
  const coverPct = videoDuration > 0 ? (coverFrameTimestamp / videoDuration) * 100 : 0;

  // -------------------------------------------------------------------------
  // Text overlays
  // -------------------------------------------------------------------------

  const addOverlay = useCallback(() => {
    const id = `${overlayIdPrefix}-${Date.now()}`;
    const overlay: TextOverlay = {
      id,
      text: 'Tap to edit',
      x: 0.5,
      y: 0.5,
      color: OVERLAY_COLORS[0]!,
    };
    setOverlays((prev) => [...prev, overlay]);
    setSelectedOverlayId(id);
  }, [overlayIdPrefix]);

  const updateOverlay = useCallback((id: string, patch: Partial<TextOverlay>) => {
    setOverlays((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  const removeOverlay = useCallback((id: string) => {
    setOverlays((prev) => prev.filter((o) => o.id !== id));
    setSelectedOverlayId((cur) => (cur === id ? null : cur));
  }, []);

  const handleOverlayPointerMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!draggingOverlayId) return;
      const preview = previewRef.current;
      if (!preview) return;
      const rect = preview.getBoundingClientRect();
      const x = clamp((clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((clientY - rect.top) / rect.height, 0, 1);
      updateOverlay(draggingOverlayId, { x, y });
    },
    [draggingOverlayId, updateOverlay],
  );

  useEffect(() => {
    if (!draggingOverlayId) return;
    const onMove = (e: PointerEvent) => handleOverlayPointerMove(e.clientX, e.clientY);
    const onUp = () => setDraggingOverlayId(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [draggingOverlayId, handleOverlayPointerMove]);

  const selectedOverlay = useMemo(
    () => overlays.find((o) => o.id === selectedOverlayId) ?? null,
    [overlays, selectedOverlayId],
  );

  // -------------------------------------------------------------------------
  // Publish
  // -------------------------------------------------------------------------

  const canPublish =
    clipDuration >= MIN_REEL_DURATION_SECONDS && clipDuration <= MAX_REEL_DURATION_SECONDS;

  const handlePublish = useCallback(() => {
    if (!canPublish) return;
    onPublish({
      trimStart,
      trimEnd,
      duration: clipDuration,
      coverFrameTimestamp,
      textOverlays: overlays,
    });
  }, [canPublish, clipDuration, coverFrameTimestamp, onPublish, overlays, trimEnd, trimStart]);

  return (
    <div className="flex h-dvh w-full flex-col bg-black text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3">
        <button onClick={onCancel} className="text-sm font-medium text-gray-300" type="button">
          Cancel
        </button>
        <h1 className="text-sm font-semibold">Edit Reel</h1>
        <motion.button
          whileTap={{ scale: 0.95 }}
          disabled={!canPublish}
          onClick={handlePublish}
          type="button"
          className="rounded-full bg-purple-600 px-4 py-1.5 text-sm font-semibold disabled:bg-gray-700 disabled:text-gray-500"
        >
          Next
        </motion.button>
      </header>

      {/* Video preview with overlays */}
      <div
        ref={previewRef}
        className="relative mx-auto aspect-[9/16] w-full max-w-sm flex-1 overflow-hidden rounded-xl bg-gray-900"
        onPointerDown={() => setSelectedOverlayId(null)}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className="h-full w-full object-cover"
          playsInline
          muted
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
        />

        {/* Text overlays */}
        {overlays.map((overlay) => (
          <div
            key={overlay.id}
            role="button"
            tabIndex={0}
            style={{
              left: `${overlay.x * 100}%`,
              top: `${overlay.y * 100}%`,
              color: overlay.color,
              transform: 'translate(-50%, -50%)',
            }}
            className={`absolute cursor-move touch-none select-none whitespace-nowrap text-lg font-bold drop-shadow-lg ${
              selectedOverlayId === overlay.id ? 'ring-2 ring-purple-400' : ''
            }`}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelectedOverlayId(overlay.id);
              setDraggingOverlayId(overlay.id);
            }}
          >
            {overlay.text || ' '}
          </div>
        ))}

        {/* Cover-frame badge */}
        <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium">
          Cover {formatSeconds(coverFrameTimestamp)}
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4 p-4">
        {/* Selected-overlay editor */}
        {selectedOverlay && (
          <div className="space-y-2 rounded-lg bg-gray-900 p-3">
            <input
              type="text"
              value={selectedOverlay.text}
              onChange={(e) => updateOverlay(selectedOverlay.id, { text: e.target.value })}
              placeholder="Overlay text"
              className="w-full rounded-md bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500"
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {OVERLAY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Color ${color}`}
                    onClick={() => updateOverlay(selectedOverlay.id, { color })}
                    style={{ backgroundColor: color }}
                    className={`h-6 w-6 rounded-full border ${
                      selectedOverlay.color === color
                        ? 'border-white ring-2 ring-purple-400'
                        : 'border-gray-600'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => removeOverlay(selectedOverlay.id)}
                className="text-xs font-medium text-rose-400"
              >
                Remove
              </button>
            </div>
          </div>
        )}

        {/* Add text button */}
        <button
          type="button"
          onClick={addOverlay}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 py-2 text-sm font-medium text-gray-200"
        >
          <span className="text-lg leading-none">+</span> Add text
        </button>

        {/* Trim slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>
              Trim ({MIN_REEL_DURATION_SECONDS}-{MAX_REEL_DURATION_SECONDS}s)
            </span>
            <span className={canPublish ? 'text-gray-300' : 'font-semibold text-rose-400'}>
              {formatSeconds(clipDuration)}
            </span>
          </div>

          <div ref={trackRef} className="relative h-10 rounded-lg bg-gray-800">
            {/* Selected range */}
            <div
              className="absolute top-0 h-full rounded-lg bg-purple-600/40"
              style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
            />

            {/* Start handle */}
            <button
              type="button"
              aria-label="Trim start"
              onPointerDown={(e) => {
                e.preventDefault();
                setDraggingHandle('start');
              }}
              className="absolute top-1/2 z-10 h-12 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded bg-white"
              style={{ left: `${startPct}%` }}
            />

            {/* End handle */}
            <button
              type="button"
              aria-label="Trim end"
              onPointerDown={(e) => {
                e.preventDefault();
                setDraggingHandle('end');
              }}
              className="absolute top-1/2 z-10 h-12 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded bg-white"
              style={{ left: `${endPct}%` }}
            />

            {/* Cover-frame marker */}
            <div
              className="pointer-events-none absolute top-0 z-0 h-full w-0.5 bg-yellow-400"
              style={{ left: `${coverPct}%` }}
            />
          </div>
        </div>

        {/* Cover frame selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Cover frame</span>
            <span className="text-gray-300">{formatSeconds(coverFrameTimestamp)}</span>
          </div>
          <input
            type="range"
            min={trimStart}
            max={trimEnd}
            step={0.1}
            value={coverFrameTimestamp}
            onChange={(e) => setCoverFrameTimestamp(Number(e.target.value))}
            className="w-full accent-yellow-400"
            aria-label="Select cover frame"
          />
        </div>
      </div>
    </div>
  );
}

export default ReelEditor;
