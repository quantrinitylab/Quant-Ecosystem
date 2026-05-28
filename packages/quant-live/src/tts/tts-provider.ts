import type { AudioChunk, TTSEvent, TTSOptions, TTSProvider } from '../types.js';

export abstract class BaseTTSProvider implements TTSProvider {
  private eventCallbacks: ((event: TTSEvent) => void)[] = [];
  private _isStreaming = false;

  get isStreaming(): boolean {
    return this._isStreaming;
  }

  abstract synthesize(text: string, options?: TTSOptions): AsyncIterable<AudioChunk>;
  abstract stop(): void;

  onEvent(cb: (event: TTSEvent) => void): void {
    this.eventCallbacks.push(cb);
  }

  protected setStreaming(value: boolean): void {
    this._isStreaming = value;
  }

  protected emitEvent(event: TTSEvent): void {
    for (const cb of this.eventCallbacks) {
      cb(event);
    }
  }
}
