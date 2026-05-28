import { describe, it, expect } from 'vitest';
import { PrefetchBuffer } from '../tts/prefetch-buffer.js';
import type { AudioChunk } from '../types.js';

function createChunk(value: number): AudioChunk {
  return {
    data: new Float32Array([value]),
    sampleRate: 24000,
    channels: 1,
    timestamp: value * 1000,
    duration: 20,
  };
}

async function* generateChunks(count: number): AsyncIterable<AudioChunk> {
  for (let i = 0; i < count; i++) {
    yield createChunk(i);
  }
}

describe('PrefetchBuffer', () => {
  it('yields buffered chunks first then live chunks', async () => {
    const buffer = new PrefetchBuffer(generateChunks(5), 3);
    const chunks: AudioChunk[] = [];

    for await (const chunk of buffer) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(5);
    // Verify all chunks arrived in order
    for (let i = 0; i < 5; i++) {
      expect(chunks[i]!.data[0]).toBe(i);
    }
  });

  it('sets isBuffering to true initially and false after prefetch complete', async () => {
    const buffer = new PrefetchBuffer(generateChunks(5), 3);
    expect(buffer.isBuffering).toBe(true);

    const iter = buffer[Symbol.asyncIterator]();
    // Get first chunk (after buffering phase)
    await iter.next();
    expect(buffer.isBuffering).toBe(false);
  });

  it('cancel discards remaining chunks', async () => {
    const buffer = new PrefetchBuffer(generateChunks(10), 3);
    const chunks: AudioChunk[] = [];

    for await (const chunk of buffer) {
      chunks.push(chunk);
      if (chunks.length === 2) {
        buffer.cancel();
      }
    }

    expect(chunks.length).toBe(2);
    expect(buffer.isCancelled).toBe(true);
  });

  it('handles empty source', async () => {
    async function* empty(): AsyncIterable<AudioChunk> {}

    const buffer = new PrefetchBuffer(empty(), 3);
    const chunks: AudioChunk[] = [];

    for await (const chunk of buffer) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(0);
    expect(buffer.isBuffering).toBe(false);
  });

  it('handles source with fewer chunks than bufferSize', async () => {
    const buffer = new PrefetchBuffer(generateChunks(2), 5);
    const chunks: AudioChunk[] = [];

    for await (const chunk of buffer) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(2);
    expect(buffer.isBuffering).toBe(false);
  });

  it('isCancelled is false initially', () => {
    const buffer = new PrefetchBuffer(generateChunks(1), 3);
    expect(buffer.isCancelled).toBe(false);
  });

  it('can be used as AsyncIterable', async () => {
    const buffer = new PrefetchBuffer(generateChunks(3), 2);
    const result: number[] = [];

    for await (const chunk of buffer) {
      result.push(chunk.data[0]!);
    }

    expect(result).toEqual([0, 1, 2]);
  });
});
