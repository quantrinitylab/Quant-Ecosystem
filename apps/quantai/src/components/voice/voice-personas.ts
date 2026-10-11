// ============================================================================
// QuantAI — Voice Personas & Voice Engine Specifications
// Task W39-A03: Real-Time Advanced Voice Mode Parity
// Voice Personas: Aura, Vesper, Zenith, Zephyr
// ============================================================================

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type VoicePersonaId = 'aura' | 'vesper' | 'zenith' | 'zephyr';

export interface VoicePersona {
  id: VoicePersonaId;
  name: string;
  tagline: string;
  description: string;
  avatar: string;
  badge: string;
  accentColor: string;
  gradient: string;
  orbGradient: {
    idle: [string, string, string];
    listening: [string, string, string];
    thinking: [string, string, string];
    speaking: [string, string, string];
  };
  defaultPitch: number; // 0.5 to 2.0 (default per persona)
  defaultRate: number; // 0.8 to 1.5 (default per persona)
  cadence: string; // 'warm & conversational', 'crisp & analytical', etc.
  sampleUtterance: string; // Preview sample speech transcript
}

export const SOVEREIGN_PERSONAS: Record<VoicePersonaId, VoicePersona> = {
  aura: {
    id: 'aura',
    name: 'Aura',
    tagline: 'Warm & Empathetic',
    description:
      'Empathetic, reassuring conversational cadence with natural acoustic warmth and thoughtful presence.',
    avatar: '🌸',
    badge: 'Empathetic Lead',
    accentColor: '#F472B6', // Rose-400
    gradient: 'from-pink-500 via-rose-400 to-amber-300',
    orbGradient: {
      idle: ['#ec4899', '#f43f5e', '#fb923c'],
      listening: ['#f472b6', '#fb7185', '#fdba74'],
      thinking: ['#c084fc', '#f472b6', '#38bdf8'],
      speaking: ['#f43f5e', '#fb7185', '#fef08a'],
    },
    defaultPitch: 1.05,
    defaultRate: 1.0,
    cadence: 'Warm & Conversational',
    sampleUtterance:
      "Hello there. I'm Aura. I'm right here with you—take all the time you need, and let's think through this together.",
  },
  vesper: {
    id: 'vesper',
    name: 'Vesper',
    tagline: 'Crisp & Analytical',
    description:
      'Sharp analytical clarity, crystal articulation, and succinct intellectual precision.',
    avatar: '💎',
    badge: 'Analytical Mind',
    accentColor: '#38BDF8', // Sky-400
    gradient: 'from-cyan-500 via-sky-400 to-indigo-400',
    orbGradient: {
      idle: ['#0284c7', '#0ea5e9', '#38bdf8'],
      listening: ['#06b6d4', '#0284c7', '#6366f1'],
      thinking: ['#6366f1', '#a855f7', '#06b6d4'],
      speaking: ['#38bdf8', '#06b6d4', '#818cf8'],
    },
    defaultPitch: 0.95,
    defaultRate: 1.1,
    cadence: 'Crisp & Analytical',
    sampleUtterance:
      "Vesper online. Data feeds synchronized. Let's dissect the architecture and pinpoint the optimal vectors.",
  },
  zenith: {
    id: 'zenith',
    name: 'Zenith',
    tagline: 'Authoritative & Executive',
    description:
      'Measured gravitas, strategic depth, and commanding clarity suited for high-stakes decisions.',
    avatar: '⚡',
    badge: 'Executive Presence',
    accentColor: '#A855F7', // Purple-500
    gradient: 'from-purple-600 via-indigo-500 to-amber-500',
    orbGradient: {
      idle: ['#7c3aed', '#6366f1', '#d97706'],
      listening: ['#8b5cf6', '#4f46e5', '#f59e0b'],
      thinking: ['#4f46e5', '#9333ea', '#e11d48'],
      speaking: ['#9333ea', '#6366f1', '#fbbf24'],
    },
    defaultPitch: 0.85,
    defaultRate: 0.95,
    cadence: 'Measured & Commanding',
    sampleUtterance:
      'Greetings. Zenith at your command. Let us evaluate the strategic horizon and execute with absolute conviction.',
  },
  zephyr: {
    id: 'zephyr',
    name: 'Zephyr',
    tagline: 'Dynamic & Playful',
    description:
      'Energetic, quick-witted cadence with rapid conversational turn-taking and playful curiosity.',
    avatar: '🍃',
    badge: 'Creative Spark',
    accentColor: '#34D399', // Emerald-400
    gradient: 'from-emerald-400 via-teal-400 to-cyan-300',
    orbGradient: {
      idle: ['#059669', '#10b981', '#14b8a6'],
      listening: ['#10b981', '#34d399', '#22d3ee'],
      thinking: ['#14b8a6', '#06b6d4', '#a7f3d0'],
      speaking: ['#34d399', '#10b981', '#6ee7b7'],
    },
    defaultPitch: 1.15,
    defaultRate: 1.15,
    cadence: 'Dynamic & Playful',
    sampleUtterance:
      'Hey! Zephyr ready to roll! What wild idea or impossible puzzle are we cracking open today?',
  },
};

export const PERSONA_LIST: VoicePersona[] = [
  SOVEREIGN_PERSONAS.aura,
  SOVEREIGN_PERSONAS.vesper,
  SOVEREIGN_PERSONAS.zenith,
  SOVEREIGN_PERSONAS.zephyr,
];

export interface VoiceSessionConfig {
  persona: VoicePersonaId;
  pitch: number; // 0.5 to 2.0
  rate: number; // 0.8 to 1.5
  cadence: string;
  isMuted: boolean;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoInterrupt: boolean; // Voice Activity Detection (VAD) interrupt trigger
}

export const DEFAULT_VOICE_CONFIG: VoiceSessionConfig = {
  persona: 'aura',
  pitch: SOVEREIGN_PERSONAS.aura.defaultPitch,
  rate: SOVEREIGN_PERSONAS.aura.defaultRate,
  cadence: SOVEREIGN_PERSONAS.aura.cadence,
  isMuted: false,
  noiseSuppression: true,
  echoCancellation: true,
  autoInterrupt: true,
};

export interface TranscriptItem {
  id: string;
  // 'system' renders as a neutral status row — never as spoken assistant speech.
  // Failures (e.g. STT errors) MUST use 'system'; fabricating an assistant
  // apology the AI never voiced is fake transcript data (see F-009).
  speaker: 'user' | 'assistant' | 'system';
  personaId?: VoicePersonaId;
  text: string;
  timestamp: string;
  isInterrupted?: boolean;
}

// ---------------------------------------------------------------------------
// STT failure → honest system/status rendering (F-009).
//
// On speech-to-text failure the voice modal must NEVER fabricate an assistant
// message ("Sorry, I couldn't transcribe that…" was an apology the AI never
// voiced) and must NEVER leak raw error strings (HTTP bodies, socket errors,
// SDK internals) into the transcript. Failures render as a `speaker: 'system'`
// status row with a user-friendly message; the raw error goes to the console
// for debugging only.
// ---------------------------------------------------------------------------

export type SttFailureKind =
  | 'auth'
  | 'timeout'
  | 'network'
  | 'empty'
  | 'malformed'
  | 'unknown';

export interface SttFailureInfo {
  kind: SttFailureKind;
  /** User-facing message. Guaranteed to never contain raw error internals. */
  userMessage: string;
}

const STT_FAILURE_MESSAGES: Record<SttFailureKind, string> = {
  auth: "Voice transcription isn't authorized right now — please sign back in and try again.",
  timeout: 'Transcription timed out before finishing — tap retry to try again.',
  network: "Couldn't reach the transcription service — check your connection, then tap retry.",
  empty: "I didn't catch any speech in that recording — tap retry and speak up.",
  malformed: 'The transcription response was unreadable — tap retry to try again.',
  unknown: "Couldn't transcribe that recording — tap retry to try again.",
};

/**
 * Classify an STT error into a user-safe failure kind. The raw message is only
 * ever pattern-matched — it is never returned or rendered.
 */
export function classifySttFailure(err: unknown): SttFailureKind {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const msg = raw.toLowerCase();

  // Internal sentinels thrown by the voice modal (never user-typed text).
  const sentinel = msg.match(/stt-(http-\d+|empty-result|malformed-result)/);
  if (sentinel) {
    const s = sentinel[1];
    if (s === 'empty-result') return 'empty';
    if (s === 'malformed-result') return 'malformed';
    if (s === 'http-401' || s === 'http-403') return 'auth';
    return 'unknown';
  }

  if (
    /\b401\b|\b403\b|unauthorized|forbidden|invalid api key|expired token|sign in|signin|not authenticated/.test(
      msg,
    )
  ) {
    return 'auth';
  }
  if (/timeout|timed out|abort/.test(msg)) return 'timeout';
  if (/network|failed to fetch|econn|socket hang|dns|offline|connection refused/.test(msg)) {
    return 'network';
  }
  if (/\bno speech\b|empty transcript/.test(msg)) return 'empty';
  if (/unexpected token|invalid json|json parse|cannot parse/.test(msg)) return 'malformed';
  return 'unknown';
}

/** Map any STT error to a safe, user-friendly failure description. */
export function describeSttFailure(err: unknown): SttFailureInfo {
  const kind = classifySttFailure(err);
  return { kind, userMessage: STT_FAILURE_MESSAGES[kind] };
}
