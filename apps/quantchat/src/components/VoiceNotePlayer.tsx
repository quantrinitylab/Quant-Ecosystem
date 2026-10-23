// ============================================================================
// VoiceNotePlayer — QC-F-573. A REAL voice-note player: a genuine <audio>
// element, play/pause, seek, playback speed, and a waveform decoded from the
// actual audio bytes (WebAudio). Honest fallbacks only:
//  - duration = recorder elapsed ms, cross-checked against the audio
//    element's loadedmetadata; if they disagree by >1s the element wins.
//  - waveform that cannot be decoded (CORS/network) renders as uniform
//    duration-proportioned bars LABELED as unavailable — never random bars.
// No emoji anywhere.
// ============================================================================

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceNotePlayerProps {
  mediaUrl: string;
  /** Recorder elapsed ms (real). Optional; the element cross-checks it. */
  durationMs?: number;
  sender: 'self' | 'other';
}

const PEAK_COUNT = 40;

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function VoiceNotePlayer({ mediaUrl, durationMs, sender }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [elementDurationMs, setElementDurationMs] = useState<number | null>(null);
  const [speed, setSpeed] = useState(1);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [waveformFallback, setWaveformFallback] = useState(false);

  // The duration we show: recorder value unless the real element disagrees
  // by more than a second.
  const displayDurationMs =
    elementDurationMs !== null &&
    durationMs !== undefined &&
    Math.abs(elementDurationMs - durationMs) > 1000
      ? elementDurationMs
      : (durationMs ?? elementDurationMs ?? 0);

  // Decode the real waveform from the actual audio bytes.
  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setWaveformFallback(false);
    (async () => {
      try {
        const res = await fetch(mediaUrl);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buf = await res.arrayBuffer();
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) throw new Error('no AudioContext');
        const ctx = new Ctor();
        try {
          const audioBuf = await ctx.decodeAudioData(buf.slice(0));
          const channel = audioBuf.getChannelData(0);
          const block = Math.max(1, Math.floor(channel.length / PEAK_COUNT));
          const next: number[] = [];
          for (let i = 0; i < PEAK_COUNT; i++) {
            let max = 0;
            const start = i * block;
            for (let j = start; j < Math.min(start + block, channel.length); j += 7) {
              const v = Math.abs(channel[j] ?? 0);
              if (v > max) max = v;
            }
            next.push(Math.max(0.06, Math.min(1, max)));
          }
          if (!cancelled) setPeaks(next);
        } finally {
          void ctx.close().catch(() => undefined);
        }
      } catch {
        // Honest fallback: we could not read the bytes (CORS/network).
        if (!cancelled) setWaveformFallback(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaUrl]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      if (el.ended) el.currentTime = 0;
      void el.play().catch(() => setPlaying(false));
    }
  }, [playing]);

  const cycleSpeed = useCallback(() => {
    setSpeed((s) => {
      const next = s === 1 ? 1.5 : s === 1.5 ? 2 : 1;
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const onSeek = useCallback((value: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = value / 1000;
    setPositionMs(value);
  }, []);

  const bubble =
    sender === 'self'
      ? 'bg-emerald-600/15 border-emerald-500/30'
      : 'bg-[var(--quant-surface)] border-[var(--quant-border)]';

  const progress = displayDurationMs > 0 ? Math.min(1, positionMs / displayDurationMs) : 0;
  const bars = peaks ?? Array.from({ length: PEAK_COUNT }, () => 0.35);

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-2xl border ${bubble} max-w-[260px]`}
      data-testid="voice-note-player"
    >
      {/* The REAL audio element. Hidden UI; custom controls below. */}
      <audio
        ref={audioRef}
        src={mediaUrl}
        preload="metadata"
        data-testid="voice-note-audio"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (Number.isFinite(el.duration)) setElementDurationMs(el.duration * 1000);
        }}
        onTimeUpdate={(e) => setPositionMs(e.currentTarget.currentTime * 1000)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setPositionMs(displayDurationMs);
        }}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className="shrink-0 w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-400 active:scale-95 transition"
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10.2-6.5a1 1 0 0 0 0-1.7L9.53 4.65A1 1 0 0 0 8 5.5Z" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className="flex items-end gap-[2px] h-8"
          role="img"
          aria-label={
            waveformFallback
              ? 'Waveform preview unavailable'
              : 'Voice note waveform'
          }
          title={waveformFallback ? 'Waveform preview unavailable' : undefined}
        >
          {bars.map((h, i) => {
            const played = i / PEAK_COUNT <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full ${played ? 'bg-emerald-400' : waveformFallback ? 'bg-[var(--quant-muted-foreground)]/25' : 'bg-[var(--quant-muted-foreground)]/45'}`}
                style={{ height: `${Math.round(h * 32)}px` }}
              />
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(displayDurationMs))}
          value={Math.round(Math.min(positionMs, displayDurationMs))}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Seek voice note"
          className="w-full h-1 accent-emerald-500 cursor-pointer"
        />
      </div>
      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={`Playback speed ${speed}x`}
        className="shrink-0 text-[11px] font-semibold text-[var(--quant-muted-foreground)] hover:text-emerald-400 px-1 py-0.5 rounded"
      >
        {speed}x
      </button>
      <span className="shrink-0 text-[11px] tabular-nums text-[var(--quant-muted-foreground)]">
        {formatDuration(positionMs > 0 && playing ? displayDurationMs - positionMs : displayDurationMs)}
      </span>
    </div>
  );
}

export default VoiceNotePlayer;
