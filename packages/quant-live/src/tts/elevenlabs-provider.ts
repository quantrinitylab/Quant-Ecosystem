import type { AudioChunk, TTSOptions } from '../types.js';
import { BaseTTSProvider } from './tts-provider.js';

export interface ElevenLabsConfig {
  apiKey?: string;
  voiceId?: string;
  modelId?: string;
}

export class ElevenLabsTTSProvider extends BaseTTSProvider {
  private config: ElevenLabsConfig;
  private ws: WebSocket | null = null;
  private aborted = false;

  constructor(config: ElevenLabsConfig) {
    super();
    this.config = config;
  }

  async *synthesize(text: string, options?: TTSOptions): AsyncIterable<AudioChunk> {
    if (!this.config.apiKey) {
      yield* this.mockSynthesize(text);
      return;
    }

    this.aborted = false;
    this.setStreaming(true);
    this.emitEvent({ type: 'start', timestamp: Date.now() });

    const voiceId = this.config.voiceId ?? 'default';
    const url = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?model_id=${this.config.modelId ?? 'eleven_monolingual_v1'}`;

    try {
      const chunks: AudioChunk[] = [];
      let done = false;
      let error: Error | null = null;

      const ws = new WebSocket(url);
      this.ws = ws;

      const waitForOpen = new Promise<void>((resolve, reject) => {
        ws.addEventListener('open', () => resolve());
        ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')));
      });

      await waitForOpen;

      ws.send(
        JSON.stringify({
          text,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          xi_api_key: this.config.apiKey,
        }),
      );
      ws.send(JSON.stringify({ text: '' }));

      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data as string) as { audio?: string; isFinal?: boolean };
          if (data.audio) {
            const raw = atob(data.audio);
            const samples = new Float32Array(raw.length / 2);
            for (let i = 0; i < samples.length; i++) {
              const lo = raw.charCodeAt(i * 2);
              const hi = raw.charCodeAt(i * 2 + 1);
              const int16 = (hi << 8) | lo;
              samples[i] = int16 >= 0x8000 ? (int16 - 0x10000) / 0x8000 : int16 / 0x7fff;
            }
            chunks.push({
              data: samples,
              sampleRate: options?.speed ? 24000 * options.speed : 24000,
              channels: 1,
              timestamp: Date.now(),
              duration: (samples.length / 24000) * 1000,
            });
          }
          if (data.isFinal) {
            done = true;
          }
        } catch (e) {
          error = e instanceof Error ? e : new Error(String(e));
        }
      });

      ws.addEventListener('close', () => {
        done = true;
      });
      ws.addEventListener('error', () => {
        error = new Error('WebSocket error during streaming');
        done = true;
      });

      while (!done && !this.aborted) {
        if (chunks.length > 0) {
          const chunk = chunks.shift()!;
          this.emitEvent({ type: 'chunk', timestamp: Date.now() });
          yield chunk;
        } else {
          await new Promise((r) => setTimeout(r, 10));
        }
        if (error) throw error;
      }

      // Yield remaining chunks
      while (chunks.length > 0 && !this.aborted) {
        yield chunks.shift()!;
      }
    } finally {
      this.setStreaming(false);
      this.emitEvent({ type: 'end', timestamp: Date.now() });
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }
  }

  stop(): void {
    this.aborted = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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
