// ============================================================================
// Voice Interface - Text-to-Speech Service
// ============================================================================

import OpenAI from 'openai';
import type { VoiceConfig } from './types';

/** Supported TTS voices */
export type TTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/**
 * TextToSpeechService wraps OpenAI TTS API for audio synthesis.
 */
export class TextToSpeechService {
  private client: OpenAI;
  private defaultVoice: TTSVoice;
  private defaultSpeed: number;

  constructor(config: VoiceConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.defaultVoice = (config.defaultVoice as TTSVoice) || 'alloy';
    this.defaultSpeed = config.defaultSpeed || 1.0;
  }

  /**
   * Synthesize text to audio buffer
   */
  async synthesize(text: string, voice?: string, speed?: number): Promise<Buffer> {
    const response = await this.client.audio.speech.create({
      model: 'tts-1',
      voice: (voice as TTSVoice) || this.defaultVoice,
      input: text,
      speed: speed || this.defaultSpeed,
      response_format: 'mp3',
    });

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
