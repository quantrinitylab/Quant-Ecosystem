import type { AudioChunk, TTSOptions } from '../types.js';
import { BaseTTSProvider } from './tts-provider.js';

export interface KokoroConfig {
  serverUrl?: string;
  defaultLanguage?: 'en' | 'hi';
}

export class KokoroTTSProvider extends BaseTTSProvider {
  private config: KokoroConfig;
  private abortController: AbortController | null = null;
  private aborted = false;

  constructor(config: KokoroConfig) {
    super();
    this.config = config;
  }

  async *synthesize(text: string, options?: TTSOptions): AsyncIterable<AudioChunk> {
    if (!this.config.serverUrl) {
      yield* this.mockSynthesize(text);
      return;
    }

    this.aborted = false;
    this.setStreaming(true);
    this.emitEvent({ type: 'start', timestamp: Date.now() });

    this.abortController = new AbortController();

    try {
      const response = await fetch(`${this.config.serverUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language: options?.language ?? this.config.defaultLanguage ?? 'en',
          speed: options?.speed ?? 1.0,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Kokoro TTS request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body stream available');
      }

      try {
        while (!this.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          const samples = new Float32Array(value.buffer);
          const chunk: AudioChunk = {
            data: samples,
            sampleRate: 24000,
            channels: 1,
            timestamp: Date.now(),
            duration: (samples.length / 24000) * 1000,
          };
          this.emitEvent({ type: 'chunk', timestamp: Date.now() });
          yield chunk;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        this.emitEvent({ type: 'error', timestamp: Date.now(), data: err });
        throw err;
      }
    } finally {
      this.setStreaming(false);
      this.emitEvent({ type: 'end', timestamp: Date.now() });
      this.abortController = null;
    }
  }

  stop(): void {
    this.aborted = true;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.setStreaming(false);
  }

  private async *mockSynthesize(text: string): AsyncIterable<AudioChunk> {
    this.setStreaming(true);
    this.emitEvent({ type: 'start', timestamp: Date.now() });

    const chunkCount = Math.max(1, Math.ceil(text.length / 20));
    for (let i = 0; i < chunkCount; i++) {
      if (this.aborted) break;
      yield {
        data: new Float32Array(480).fill(0),
        sampleRate: 24000,
        channels: 1,
        timestamp: Date.now(),
        duration: 20,
      };
    }

    this.setStreaming(false);
    this.emitEvent({ type: 'end', timestamp: Date.now() });
  }
}
