import type { AudioChunk } from '../types.js';

export class PrefetchBuffer implements AsyncIterable<AudioChunk> {
  private source: AsyncIterable<AudioChunk>;
  private bufferSize: number;
  private cancelled = false;
  private buffering = true;

  constructor(source: AsyncIterable<AudioChunk>, bufferSize = 3) {
    this.source = source;
    this.bufferSize = bufferSize;
  }

  get isBuffering(): boolean {
    return this.buffering;
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  cancel(): void {
    this.cancelled = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AudioChunk> {
    const buffer: AudioChunk[] = [];
    const iterator = this.source[Symbol.asyncIterator]();

    // Prefetch initial chunks
    for (let i = 0; i < this.bufferSize; i++) {
      if (this.cancelled) return;
      const { done, value } = await iterator.next();
      if (done) break;
      buffer.push(value);
    }

    this.buffering = false;

    // Yield buffered chunks
    while (buffer.length > 0) {
      if (this.cancelled) return;
      yield buffer.shift()!;
    }

    // Yield remaining live chunks
    while (!this.cancelled) {
      const { done, value } = await iterator.next();
      if (done) break;
      yield value;
    }
  }
}
