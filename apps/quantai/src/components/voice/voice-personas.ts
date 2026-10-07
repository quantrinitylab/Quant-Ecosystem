// ============================================================================
// QuantAI — Sovereign Voice Personas & Voice Engine Specifications
// Task W39-A03: Real-Time Advanced Voice Mode Parity
// Trademark Audited Personas: Aura, Vesper, Zenith, Zephyr
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
  frequencyProfile: string; // 'Warm harmonic mid-tones', 'Crystal high-fidelity precision', etc.
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
    frequencyProfile: 'Harmonic mid-low resonance with soft sibilance attenuation',
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
    frequencyProfile:
      'High dynamic clarity with balanced upper harmonics and low latency modulation',
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
    frequencyProfile:
      'Deep baritone resonance with linear phase reproduction and zero acoustic ringing',
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
    frequencyProfile:
      'Vibrant transient response with rapid pitch contours and expressive modulation',
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
  speaker: 'user' | 'assistant';
  personaId?: VoicePersonaId;
  text: string;
  timestamp: string;
  isInterrupted?: boolean;
}
