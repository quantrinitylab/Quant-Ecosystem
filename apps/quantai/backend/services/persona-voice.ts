// ============================================================================
// QuantAI — Sovereign Persona → Server TTS Voice mapping (F-046)
// ============================================================================
//
// The voice UI lets users pick one of 4 "Sovereign Voice Personas" and the
// client posts that persona id as `voiceId` to POST /voice/tts. These persona
// ids are NOT voices on the server TTS provider (an OpenAI-compatible
// /audio/speech endpoint), so this module maps each persona to a REAL provider
// voice — the same real OpenAI voices catalogued in
// voiceover-tts.service.ts — instead of silently dropping voiceId and always
// synthesizing with the default voice.
//
//   aura    (warm & empathetic)         -> nova     (female, friendly & bright)
//   vesper  (crisp & analytical)       -> shimmer   (female, clear & expressive)
//   zenith  (authoritative & executive)-> onyx      (male, deep & authoritative)
//   zephyr  (dynamic & playful)        -> echo      (male, warm & conversational)
//
// The browser speechSynthesis fallback path applies each persona's own
// pitch/rate directly, so this mapping only governs the server TTS path.

export type SovereignPersonaId = 'aura' | 'vesper' | 'zenith' | 'zephyr';

export const SOVEREIGN_PERSONA_IDS: readonly SovereignPersonaId[] = [
  'aura',
  'vesper',
  'zenith',
  'zephyr',
];

/** Default server TTS voice (matches AgentVoiceInterface's default). */
export const DEFAULT_SERVER_TTS_VOICE = 'alloy';

export const PERSONA_SERVER_VOICES: Record<SovereignPersonaId, string> = {
  aura: 'nova',
  vesper: 'shimmer',
  zenith: 'onyx',
  zephyr: 'echo',
};

export interface ResolvedServerVoice {
  /** The real provider voice id to request. */
  voice: string;
  /** False when the input was missing/unknown and we fell back to default. */
  known: boolean;
}

/**
 * Resolve a client-supplied voiceId (a sovereign persona id) to a real server
 * TTS provider voice. Matching is case-insensitive and trims whitespace.
 * Unknown, missing, or non-string values resolve to the default voice with
 * known=false so callers can log the fallback instead of failing the request.
 */
export function resolveServerTtsVoice(voiceId: unknown): ResolvedServerVoice {
  if (typeof voiceId === 'string') {
    const key = voiceId.trim().toLowerCase();
    const mapped = (PERSONA_SERVER_VOICES as Record<string, string>)[key];
    if (mapped) {
      return { voice: mapped, known: true };
    }
  }
  return { voice: DEFAULT_SERVER_TTS_VOICE, known: false };
}
