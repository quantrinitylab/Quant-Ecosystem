'use client';

// ============================================================================
// barge-in.ts — real voice-activity (VAD-style) barge-in for voice mode
// (F-045: the "Auto-Interrupt (VAD)" settings toggle used to be theater — it
//  wrote config.autoInterrupt but nothing ever read it. This module makes it
//  real: while assistant audio plays, a mic energy meter runs; sustained voice
//  energy above a threshold for ~500ms cancels playback and returns to
//  listening. Threshold + debounce only — no new dependencies.)
// ============================================================================

import { useEffect, useRef } from 'react';

/** Mic level (0..1) that counts as "the user is speaking". */
export const BARGE_IN_THRESHOLD = 0.22;

/** How long the level must stay above threshold before we interrupt (ms). */
export const BARGE_IN_HOLD_MS = 500;

export interface BargeInDetector {
  /** Feed a fresh mic level sample taken at `nowMs`. Fires onInterrupt once the
   *  level has stayed at/above threshold for BARGE_IN_HOLD_MS. */
  push: (level: number, nowMs: number) => void;
  /** Reset the debounce state (call when a new playback starts). */
  reset: () => void;
}

/**
 * Threshold + debounce voice-activity detector. Pure logic (no DOM), so it is
 * unit-testable. Short bursts and sub-threshold levels reset the timer; the
 * callback fires exactly once per armed period.
 */
export function createBargeInDetector(
  threshold: number,
  holdMs: number,
  onInterrupt: () => void,
): BargeInDetector {
  let aboveSince: number | null = null;
  let fired = false;
  return {
    push(level: number, nowMs: number) {
      if (level >= threshold) {
        if (aboveSince === null) aboveSince = nowMs;
        if (!fired && nowMs - aboveSince >= holdMs) {
          fired = true;
          onInterrupt();
        }
      } else {
        // Level dropped — the burst was too short; restart the hold window.
        aboveSince = null;
      }
    },
    reset() {
      aboveSince = null;
      fired = false;
    },
  };
}

/**
 * RMS of AnalyserNode byte time-domain data mapped to a lively 0..1 range.
 * Uses the same x4 gain the voice-capture level meter uses, so barge-in and
 * the orb visualizer agree on what "loud" means.
 */
export function computeMicLevel(timeDomain: Uint8Array): number {
  if (timeDomain.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    const v = (timeDomain[i]! - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / timeDomain.length) * 4);
}

/**
 * Stop every assistant playback channel: the backend-TTS <audio> element and
 * the browser speechSynthesis utterance. Null-safe so a missing channel is
 * simply skipped (e.g. backend TTS failed and we fell back to speechSynthesis).
 */
export function stopAssistantPlayback(
  audio: { pause: () => void } | null,
  synth?: { cancel: () => void } | null,
): void {
  try {
    audio?.pause();
  } catch {
    /* noop — already stopped */
  }
  try {
    synth?.cancel();
  } catch {
    /* noop — nothing queued */
  }
}

/**
 * Barge-in watch: while `enabled`, opens the mic (meter only — no
 * transcription capture) and feeds live levels into a threshold+debounce
 * detector. On sustained voice energy, calls `onInterrupt`.
 *
 * - Mic denied/unavailable: the watch silently stays off; interrupt remains
 *   manual-tap exactly as before (no error surfaced — mic errors belong to
 *   the voice-turn flow).
 * - Cleanup on disable/unmount: rAF cancelled, tracks stopped, context closed.
 */
export function useBargeInWatch(enabled: boolean, onInterrupt: () => void): void {
  const onInterruptRef = useRef(onInterrupt);
  onInterruptRef.current = onInterrupt;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    const detector = createBargeInDetector(
      BARGE_IN_THRESHOLD,
      BARGE_IN_HOLD_MS,
      () => {
        if (!disposed) onInterruptRef.current();
      },
    );

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          if (disposed) return;
          analyser.getByteTimeDomainData(buf);
          detector.push(computeMicLevel(buf), performance.now());
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // Mic-denied fallback: leave the watch off; manual tap still works.
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      try {
        void ctx?.close();
      } catch {
        /* noop */
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);
}
