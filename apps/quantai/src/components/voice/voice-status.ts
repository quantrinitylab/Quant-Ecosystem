// ============================================================================
// QuantAI — Honest voice-state status copy (F-048 fix)
// The voice flow is tap-to-record -> tap-to-stop -> POST /api/voice/stt ->
// chat pipeline -> TTS. There is no measured low-latency guarantee, so this
// module deliberately avoids "real-time"/"low latency" marketing claims and
// instead describes what is actually happening at each state.
// ============================================================================

import type { VoiceState } from './voice-personas';

export interface VoiceStatusInfo {
  /** Honest user-facing label describing the current voice state. */
  label: string;
  /** Tailwind dot classes (dot color / pulse) for the indicator. */
  dotClass: string;
}

/**
 * Resolve the honest status label + dot for the voice indicator badge.
 * `micUnavailable` overrides everything — a failed mic is the most important
 * thing the user can learn from the indicator.
 */
export function getVoiceStatus(state: VoiceState, micUnavailable: boolean): VoiceStatusInfo {
  if (micUnavailable) {
    return { label: 'Microphone unavailable', dotClass: 'bg-red-400' };
  }
  switch (state) {
    case 'listening':
      return { label: 'Listening — tap the orb when done', dotClass: 'bg-emerald-400 animate-pulse' };
    case 'thinking':
      return { label: 'Transcribing & thinking…', dotClass: 'bg-amber-400 animate-pulse' };
    case 'speaking':
      return { label: 'Assistant speaking — tap the orb to interrupt', dotClass: 'bg-violet-400 animate-pulse' };
    case 'idle':
    default:
      return { label: 'Voice ready — tap the orb to speak', dotClass: 'bg-zinc-400' };
  }
}

/** All states this indicator is guaranteed to cover. */
export const VOICE_STATUS_STATES: readonly VoiceState[] = ['idle', 'listening', 'thinking', 'speaking'];
