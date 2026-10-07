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
 * OpenAIWhisperProvider - Calls the OpenAI Whisper transcription API.
 *
 * Real implementation: POSTs audio (Buffer or fetched from a URL) as multipart
 * form-data and parses the verbose_json response into segments. Requires an API
 * key (OPENAI_API_KEY in production). On API/network error it throws so callers
 * can decide how to handle it (the moderation pipeline treats failures
 * conservatively rather than silently emitting empty transcripts).
 */
export class OpenAIWhisperProvider implements WhisperProvider {
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly language: string | undefined;

  constructor(apiKey: string, options?: { endpoint?: string; model?: string; language?: string }) {
    this.apiKey = apiKey;
    this.endpoint = options?.endpoint ?? 'https://api.openai.com/v1/audio/transcriptions';
    this.model = options?.model ?? 'whisper-1';
    this.language = options?.language;
  }

  async transcribe(audio: Buffer | string): Promise<TranscriptionResult> {
    const blob = await this.toBlob(audio);

    const form = new FormData();
    form.append('file', blob, 'audio');
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    if (this.language) {
      form.append('language', this.language);
    }

    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`Whisper API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as {
      text?: string;
      language?: string;
      duration?: number;
      segments?: Array<{
        start?: number;
        end?: number;
        text?: string;
        avg_logprob?: number;
        no_speech_prob?: number;
      }>;
    };

    const segments: TranscriptionSegment[] = (data.segments ?? []).map((seg) => ({
      start: seg.start ?? 0,
      end: seg.end ?? 0,
      text: (seg.text ?? '').trim(),
      // Whisper does not return a direct confidence; derive one from avg_logprob.
      confidence:
        seg.avg_logprob !== undefined ? Math.max(0, Math.min(1, Math.exp(seg.avg_logprob))) : 1,
    }));

    return {
      text: data.text ?? '',
      segments,
      duration: data.duration ?? 0,
      language: data.language ?? this.language ?? 'en',
    };
  }

  private async toBlob(audio: Buffer | string): Promise<Blob> {
    if (typeof audio === 'string') {
      const res = await fetch(audio);
      if (!res.ok) {
        throw new Error(`Failed to fetch audio (${res.status}) from ${audio}`);
      }
      const buf = await res.arrayBuffer();
      return new Blob([new Uint8Array(buf)]);
    }
    // Copy into a fresh Uint8Array so the BlobPart is guaranteed to be backed by
    // a plain ArrayBuffer (a Node Buffer may be backed by a SharedArrayBuffer,
    // which is not assignable to BlobPart under strict DOM lib types).
    return new Blob([new Uint8Array(audio)]);
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

/**
 * Build a WhisperProvider from environment configuration.
 * Returns a real OpenAIWhisperProvider when a transcription key is set
 * (TRANSCRIPTION_API_KEY takes precedence over OPENAI_API_KEY), otherwise null so
 * callers can decide on a safe fallback (the moderation worker treats a missing
 * transcriber conservatively rather than approving un-analyzed audio).
 */
export function createWhisperProviderFromEnv(options?: {
  endpoint?: string;
  model?: string;
  language?: string;
  apiKey?: string;
}): WhisperProvider | null {
  const apiKey =
    options?.apiKey ?? process.env['TRANSCRIPTION_API_KEY'] ?? process.env['OPENAI_API_KEY'];
  if (!apiKey) {
    return null;
  }
  return new OpenAIWhisperProvider(apiKey, options);
}
