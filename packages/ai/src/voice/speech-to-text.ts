// ============================================================================
// Voice Interface - Speech-to-Text Service
// ============================================================================

import OpenAI from 'openai';
import type { VoiceConfig, TranscriptionResult } from './types';

/**
 * SpeechToTextService wraps OpenAI Whisper API for audio transcription.
 */
export class SpeechToTextService {
  private client: OpenAI;
  private model: string;

  constructor(config: VoiceConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model || 'whisper-1';
  }

  /**
   * Transcribe audio buffer to text
   */
  async transcribe(audio: Buffer, language?: string): Promise<TranscriptionResult> {
    const file = new File([new Uint8Array(audio)], 'audio.webm', { type: 'audio/webm' });

    const response = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
      language,
      response_format: 'verbose_json',
    });

    const result = response as unknown as {
      text: string;
      language: string;
      duration: number;
      segments?: Array<{ text: string; start: number; end: number; avg_logprob?: number }>;
    };

    return {
      text: result.text,
      language: result.language || language || 'en',
      duration: result.duration || 0,
      segments: (result.segments || []).map((seg) => ({
        text: seg.text,
        start: seg.start,
        end: seg.end,
        confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : 0.9,
      })),
    };
  }
}
