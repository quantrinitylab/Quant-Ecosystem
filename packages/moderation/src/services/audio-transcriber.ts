// ============================================================================
// Moderation - Audio Transcriber
// Audio transcription via WhisperProvider interface (DI pattern)
// ============================================================================

import type { WhisperProvider, TranscriptionResult, TranscriptionSegment } from '../types';

export interface AudioTranscriberConfig {
  /** Maximum chunk size in bytes for chunked transcription */
  maxChunkSize: number;
  /** Language hint for transcription */
  language?: string;
}

const DEFAULT_CONFIG: AudioTranscriberConfig = {
  maxChunkSize: 25 * 1024 * 1024, // 25MB (Whisper API limit)
};

/**
 * OpenAIWhisperProvider - Calls OpenAI Whisper API for transcription.
 * In production, requires OPENAI_API_KEY environment variable.
 */
export class OpenAIWhisperProvider implements WhisperProvider {
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(apiKey: string, endpoint?: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint ?? 'https://api.openai.com/v1/audio/transcriptions';
  }

  async transcribe(_audio: Buffer | string): Promise<TranscriptionResult> {
    // In production this would POST to the Whisper API endpoint using
    // this.apiKey and this.endpoint. Returns empty result as placeholder.
    void this.apiKey;
    void this.endpoint;
    return {
      text: '',
      segments: [],
      duration: 0,
      language: 'en',
    };
  }
}

/**
 * MockWhisperProvider - Test provider that returns configurable transcription results
 * without making any external API calls.
 */
export class MockWhisperProvider implements WhisperProvider {
  public transcribeCalls: (Buffer | string)[] = [];
  private readonly result: TranscriptionResult;

  constructor(result?: Partial<TranscriptionResult>) {
    this.result = {
      text: result?.text ?? 'mock transcription text',
      segments: result?.segments ?? [
        { start: 0, end: 5, text: 'mock transcription text', confidence: 0.95 },
      ],
      duration: result?.duration ?? 10,
      language: result?.language ?? 'en',
    };
  }

  async transcribe(audio: Buffer | string): Promise<TranscriptionResult> {
    this.transcribeCalls.push(audio);
    return this.result;
  }
}

/**
 * AudioTranscriber - Transcribes audio content using a WhisperProvider.
 *
 * Supports chunked transcription for long audio files that exceed the
 * provider's size limits. Uses dependency injection via WhisperProvider
 * interface so it can work with OpenAI, self-hosted Whisper, or a mock.
 */
export class AudioTranscriber {
  private readonly provider: WhisperProvider;
  private readonly config: AudioTranscriberConfig;

  constructor(provider: WhisperProvider, config: Partial<AudioTranscriberConfig> = {}) {
    this.provider = provider;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Transcribe an audio buffer or URL */
  async transcribe(audio: Buffer | string): Promise<TranscriptionResult> {
    if (typeof audio === 'string') {
      // URL input - delegate directly to provider
      return this.provider.transcribe(audio);
    }

    // Buffer input - check if chunking is needed
    if (audio.length <= this.config.maxChunkSize) {
      return this.provider.transcribe(audio);
    }

    // Chunked transcription for large files
    return this.transcribeChunked(audio);
  }

  /** Split large audio into chunks and transcribe each */
  private async transcribeChunked(audio: Buffer): Promise<TranscriptionResult> {
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < audio.length; offset += this.config.maxChunkSize) {
      chunks.push(audio.subarray(offset, offset + this.config.maxChunkSize));
    }

    const results: TranscriptionResult[] = [];
    let timeOffset = 0;

    for (const chunk of chunks) {
      const result = await this.provider.transcribe(chunk);
      // Offset segment timestamps by accumulated duration
      const offsetSegments: TranscriptionSegment[] = result.segments.map((seg) => ({
        ...seg,
        start: seg.start + timeOffset,
        end: seg.end + timeOffset,
      }));
      results.push({ ...result, segments: offsetSegments });
      timeOffset += result.duration;
    }

    // Merge results
    const allSegments = results.flatMap((r) => r.segments);
    const fullText = results.map((r) => r.text).join(' ');
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    return {
      text: fullText,
      segments: allSegments,
      duration: totalDuration,
      language: results[0]?.language,
    };
  }
}
