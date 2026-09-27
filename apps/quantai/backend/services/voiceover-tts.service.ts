import crypto from 'crypto';

export type TTSProvider = 'openai' | 'elevenlabs' | 'google' | 'davinci';

export type VoiceTone = 'cheerful' | 'serious' | 'whisper' | 'excited' | 'neutral' | 'dramatic';

export interface VoiceProfile {
  id: string;
  name: string;
  provider: TTSProvider;
  gender: 'male' | 'female' | 'neutral';
  language: string; // e.g. 'en-US', 'hi-IN'
  previewAudioUrl?: string;
  tags?: string[];
  supportedTones?: VoiceTone[];
  sampleAudioUrl?: string;
}

export interface SynthesizeSpeechRequest {
  text: string;
  voiceId: string;
  speed?: number; // 0.25 to 4.0, default 1.0
  pitch?: number; // -20 to 20, default 0
  audioFormat?: 'mp3' | 'wav' | 'ogg';
}

export interface SynthesizeSpeechResult {
  audioUrl: string;
  format: string;
  durationSeconds: number;
  characterCount: number;
  cacheHit: boolean;
  synthesizedAt: string;
}

export interface TtsSynthesisParams {
  voiceId: string;
  text: string;
  tone?: VoiceTone;
  speedMultiplier?: number; // 0.5 to 2.0, default 1.0
  pitchPercentage?: number; // -50 to +50, default 0
}

export interface WordTimestampMarker {
  word: string;
  startMs: number;
  endMs: number;
}

export interface TtsSynthesisResult {
  id: string;
  userId: string;
  params: TtsSynthesisParams;
  status: 'QUEUED' | 'SYNTHESIZING' | 'COMPLETED' | 'FAILED';
  audioUrl?: string;
  estimatedDurationMs: number;
  wordMarkers: WordTimestampMarker[];
  createdAt: string;
  completedAt?: string;
}

const ALL_TONES: VoiceTone[] = ['cheerful', 'serious', 'whisper', 'excited', 'neutral', 'dramatic'];

export const STANDARD_VOICE_CATALOG: VoiceProfile[] = [
  // OpenAI Voices
  {
    id: 'alloy',
    name: 'Alloy',
    provider: 'openai',
    gender: 'neutral',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/openai-alloy.mp3',
    tags: ['neutral', 'balanced', 'versatile', 'conversational'],
  },
  {
    id: 'echo',
    name: 'Echo',
    provider: 'openai',
    gender: 'male',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/openai-echo.mp3',
    tags: ['warm', 'conversational', 'smooth'],
  },
  {
    id: 'fable',
    name: 'Fable',
    provider: 'openai',
    gender: 'male',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/openai-fable.mp3',
    tags: ['british', 'narrative', 'storytelling'],
  },
  {
    id: 'onyx',
    name: 'Onyx',
    provider: 'openai',
    gender: 'male',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/openai-onyx.mp3',
    tags: ['deep', 'authoritative', 'formal'],
  },
  {
    id: 'nova',
    name: 'Nova',
    provider: 'openai',
    gender: 'female',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/openai-nova.mp3',
    tags: ['energetic', 'friendly', 'bright'],
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    provider: 'openai',
    gender: 'female',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/openai-shimmer.mp3',
    tags: ['clear', 'expressive', 'crisp'],
  },
  // ElevenLabs Voices
  {
    id: 'rachel',
    name: 'Rachel',
    provider: 'elevenlabs',
    gender: 'female',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/elevenlabs-rachel.mp3',
    tags: ['calm', 'narration', 'multilingual'],
  },
  {
    id: 'domi',
    name: 'Domi',
    provider: 'elevenlabs',
    gender: 'female',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/elevenlabs-domi.mp3',
    tags: ['strong', 'energetic', 'confident'],
  },
  {
    id: 'bella',
    name: 'Bella',
    provider: 'elevenlabs',
    gender: 'female',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/elevenlabs-bella.mp3',
    tags: ['expressive', 'conversational', 'gentle'],
  },
  {
    id: 'antoni',
    name: 'Antoni',
    provider: 'elevenlabs',
    gender: 'male',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/elevenlabs-antoni.mp3',
    tags: ['well-rounded', 'storytelling', 'friendly'],
  },
  {
    id: 'adam',
    name: 'Adam',
    provider: 'elevenlabs',
    gender: 'male',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/elevenlabs-adam.mp3',
    tags: ['deep', 'warm', 'audiobook'],
  },
  // Google Cloud Voices
  {
    id: 'en-US-Neural2-F',
    name: 'en-US-Neural2-F',
    provider: 'google',
    gender: 'female',
    language: 'en-US',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/google-en-us-neural2-f.mp3',
    tags: ['natural', 'clear', 'neural'],
  },
  {
    id: 'hi-IN-Neural2-A',
    name: 'hi-IN-Neural2-A',
    provider: 'google',
    gender: 'female',
    language: 'hi-IN',
    previewAudioUrl: 'https://cdn.quantmail.in/voice/previews/google-hi-in-neural2-a.mp3',
    tags: ['hindi', 'multilingual', 'neural', 'expressive'],
  },

  // Davinci AI Voices
  {
    id: 'aura',
    name: 'Aura',
    provider: 'davinci',
    language: 'en-US',
    gender: 'female',
    supportedTones: ALL_TONES,
  },
  {
    id: 'vesper',
    name: 'Vesper',
    provider: 'davinci',
    language: 'en-US',
    gender: 'male',
    supportedTones: ALL_TONES,
  },
  {
    id: 'zenith',
    name: 'Zenith',
    provider: 'davinci',
    language: 'en-US',
    gender: 'neutral',
    supportedTones: ALL_TONES,
  },
  {
    id: 'zephyr',
    name: 'Zephyr',
    provider: 'davinci',
    language: 'fr-FR',
    gender: 'male',
    supportedTones: ALL_TONES,
  },
  {
    id: 'echo',
    name: 'Echo',
    provider: 'davinci',
    language: 'de-DE',
    gender: 'female',
    supportedTones: ALL_TONES,
  },
  {
    id: 'sol',
    name: 'Sol',
    provider: 'davinci',
    language: 'es-ES',
    gender: 'male',
    supportedTones: ALL_TONES,
  },
];

let synthesisJobs: TtsSynthesisResult[] = [];
const synthesisCache = new Map<string, SynthesizeSpeechResult>();

export function clampSpeed(speed?: number): number {
  if (speed === undefined || speed === null || isNaN(speed)) return 1.0;
  if (speed < 0.25) return 0.25;
  if (speed > 4.0) return 4.0;
  return Number(speed.toFixed(2));
}

export function clampPitch(pitch?: number): number {
  if (pitch === undefined || pitch === null || isNaN(pitch)) return 0;
  if (pitch < -20) return -20;
  if (pitch > 20) return 20;
  return Number(pitch.toFixed(1));
}

export function listAvailableVoices(
  filterOrLanguage?: string | { provider?: TTSProvider; language?: string; gender?: string },
): VoiceProfile[] {
  let filter: { provider?: TTSProvider; language?: string; gender?: string } | undefined;
  if (typeof filterOrLanguage === 'string') {
    filter = { language: filterOrLanguage };
  } else {
    filter = filterOrLanguage;
  }

  if (!filter) return [...STANDARD_VOICE_CATALOG];

  return STANDARD_VOICE_CATALOG.filter((voice) => {
    if (filter!.provider && voice.provider !== filter!.provider) return false;
    if (filter!.language) {
      const targetLang = filter!.language.toLowerCase();
      const voiceLang = voice.language.toLowerCase();
      if (voiceLang !== targetLang && !voiceLang.startsWith(targetLang + '-')) return false;
    }
    if (filter!.gender && voice.gender.toLowerCase() !== filter!.gender.toLowerCase()) return false;
    return true;
  });
}

export function generateSpeechCacheKey(request: SynthesizeSpeechRequest): string {
  const speed = clampSpeed(request.speed);
  const pitch = clampPitch(request.pitch);
  const format = request.audioFormat || 'mp3';
  const voiceId = request.voiceId.toLowerCase().trim();
  const voice = STANDARD_VOICE_CATALOG.find((v) => v.id.toLowerCase() === voiceId);
  const provider = voice?.provider || 'openai';
  const model =
    provider === 'openai'
      ? 'tts-1'
      : provider === 'elevenlabs'
        ? 'eleven_multilingual_v2'
        : 'neural2';

  const canonicalPayload = [
    `text:${request.text}`,
    `voice:${voiceId}`,
    `model:${model}`,
    `provider:${provider}`,
    `speed:${speed}`,
    `pitch:${pitch}`,
    `format:${format}`,
  ].join('|');

  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

export function generateSsml(text: string, options?: { speed?: number; pitch?: number }): string {
  const speed = clampSpeed(options?.speed);
  const pitch = clampPitch(options?.pitch);
  const rateAttr = `${speed}`;
  const pitchAttr = pitch >= 0 ? `+${pitch}%` : `${pitch}%`;
  return `<speak><prosody rate="${rateAttr}" pitch="${pitchAttr}">${text}</prosody></speak>`;
}

export function estimateSpeechDuration(wordCount: number, speedMultiplier: number = 1.0): number {
  const wordsPerMinute = 150;
  const msPerWord = 60000 / wordsPerMinute;
  return (wordCount * msPerWord) / speedMultiplier;
}

export function generateWordMarkers(
  text: string,
  speedMultiplier: number = 1.0,
): WordTimestampMarker[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const markers: WordTimestampMarker[] = [];
  let currentMs = 0;

  for (const word of words) {
    const wordDuration = 400 / speedMultiplier;
    markers.push({
      word,
      startMs: currentMs,
      endMs: currentMs + wordDuration,
    });
    currentMs += wordDuration;
  }

  return markers;
}

export function synthesizeSpeech(request: SynthesizeSpeechRequest): Promise<SynthesizeSpeechResult>;
export function synthesizeSpeech(userId: string, params: TtsSynthesisParams): TtsSynthesisResult;
export function synthesizeSpeech(
  arg1: string | SynthesizeSpeechRequest,
  arg2?: TtsSynthesisParams,
): any {
  if (typeof arg1 === 'string' && arg2) {
    const userId = arg1;
    const params = arg2;
    const voice = STANDARD_VOICE_CATALOG.find(
      (v) => v.id === params.voiceId && v.provider === 'davinci',
    );
    if (!voice) {
      throw new Error('VOICE_NOT_FOUND');
    }

    if (!params.text || params.text.trim().length === 0) {
      throw new Error('Text must be non-empty');
    }

    const speedMultiplier = Math.max(0.5, Math.min(2.0, params.speedMultiplier ?? 1.0));
    const pitchPercentage = Math.max(-50, Math.min(50, params.pitchPercentage ?? 0));

    const words = params.text.split(/\s+/).filter((w) => w.length > 0);
    const estimatedDurationMs = estimateSpeechDuration(words.length, speedMultiplier);
    const wordMarkers = generateWordMarkers(params.text, speedMultiplier);

    const result: TtsSynthesisResult = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      userId,
      params: {
        ...params,
        speedMultiplier,
        pitchPercentage,
      },
      status: 'COMPLETED',
      audioUrl: `https://cdn.quantai.com/tts/${userId}/audio.mp3`,
      estimatedDurationMs,
      wordMarkers,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    synthesisJobs.push(result);
    return result;
  } else if (typeof arg1 === 'object') {
    const request = arg1 as SynthesizeSpeechRequest;
    return (async () => {
      const speed = clampSpeed(request.speed);
      const pitch = clampPitch(request.pitch);
      const format = request.audioFormat || 'mp3';
      const characterCount = request.text.length;
      const durationSeconds = Math.ceil(characterCount / 15);

      const cacheKey = generateSpeechCacheKey({
        text: request.text,
        voiceId: request.voiceId,
        speed,
        pitch,
        audioFormat: format,
      });

      const cached = synthesisCache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          cacheHit: true,
        };
      }

      const simulatedPayload = Buffer.from(
        `QUANT_VOICEOVER_${request.voiceId}_${cacheKey}`,
        'utf-8',
      ).toString('base64');
      const audioUrl = `data:audio/${format};base64,${simulatedPayload}`;
      const synthesizedAt = new Date().toISOString();

      const result: SynthesizeSpeechResult = {
        audioUrl,
        format,
        durationSeconds,
        characterCount,
        cacheHit: false,
        synthesizedAt,
      };

      synthesisCache.set(cacheKey, result);
      return result;
    })();
  }
}

export function clearTtsForTesting(): void {
  synthesisJobs = [];
}

export function clearCacheForTesting(): void {
  synthesisCache.clear();
}

export class VoiceoverTTSService {
  listAvailableVoices(filter?: {
    provider?: TTSProvider;
    language?: string;
    gender?: string;
  }): VoiceProfile[] {
    return listAvailableVoices(filter);
  }
  generateSpeechCacheKey(request: SynthesizeSpeechRequest): string {
    return generateSpeechCacheKey(request);
  }
  generateSsml(text: string, options?: { speed?: number; pitch?: number }): string {
    return generateSsml(text, options);
  }
  async synthesizeSpeech(request: SynthesizeSpeechRequest): Promise<SynthesizeSpeechResult> {
    return synthesizeSpeech(request) as Promise<SynthesizeSpeechResult>;
  }
  clearCacheForTesting(): void {
    clearCacheForTesting();
  }
}

export const voiceoverTTSService = new VoiceoverTTSService();
