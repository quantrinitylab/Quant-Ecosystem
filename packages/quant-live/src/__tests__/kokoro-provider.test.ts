import { describe, it, expect, vi, afterEach } from 'vitest';
import { KokoroTTSProvider } from '../tts/kokoro-provider.js';
import type { AudioChunk, TTSEvent } from '../types.js';

describe('KokoroTTSProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('mock fallback mode (no server URL)', () => {
    it('yields silence chunks when no server URL is provided', async () => {
      const provider = new KokoroTTSProvider({});
      const chunks: AudioChunk[] = [];

      for await (const chunk of provider.synthesize('hello world')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.data.every((v) => v === 0)).toBe(true);
        expect(chunk.sampleRate).toBe(24000);
        expect(chunk.channels).toBe(1);
      }
    });

    it('emits start and end events in mock mode', async () => {
      const provider = new KokoroTTSProvider({});
      const events: TTSEvent[] = [];
      provider.onEvent((e) => events.push(e));

      for await (const _chunk of provider.synthesize('test')) {
        // consume
      }

      const types = events.map((e) => e.type);
      expect(types).toContain('start');
      expect(types).toContain('end');
    });

    it('stops producing chunks after stop() is called', async () => {
      const provider = new KokoroTTSProvider({});
      const chunks: AudioChunk[] = [];

      for await (const chunk of provider.synthesize(
        'a very long text that produces many chunks for testing',
      )) {
        chunks.push(chunk);
        if (chunks.length === 1) {
          provider.stop();
        }
      }

      expect(chunks.length).toBe(1);
    });
  });

  describe('HTTP streaming mode (with server URL)', () => {
    it('sends POST request to /api/tts endpoint', async () => {
      const audioData = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({
            done: false,
            value: new Uint8Array(audioData.buffer),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => mockReader },
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = new KokoroTTSProvider({ serverUrl: 'http://localhost:5000' });
      const chunks: AudioChunk[] = [];

      for await (const chunk of provider.synthesize('hello', { language: 'hi' })) {
        chunks.push(chunk);
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/tts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const body = JSON.parse((mockFetch.mock.calls[0]![1] as { body: string }).body);
      expect(body.text).toBe('hello');
      expect(body.language).toBe('hi');
      expect(chunks.length).toBe(1);
    });

    it('yields multiple chunks from streaming response', async () => {
      const chunk1 = new Float32Array([0.1, 0.2]);
      const chunk2 = new Float32Array([0.3, 0.4]);
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(chunk1.buffer) })
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(chunk2.buffer) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        releaseLock: vi.fn(),
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          body: { getReader: () => mockReader },
        }),
      );

      const provider = new KokoroTTSProvider({ serverUrl: 'http://localhost:5000' });
      const chunks: AudioChunk[] = [];

      for await (const chunk of provider.synthesize('hello')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(2);
    });

    it('stop aborts the fetch request', async () => {
      let abortSignal: AbortSignal | undefined;
      const mockReader = {
        read: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
        releaseLock: vi.fn(),
      };

      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((_url: string, opts: RequestInit) => {
          abortSignal = opts.signal as AbortSignal;
          return Promise.resolve({
            ok: true,
            body: { getReader: () => mockReader },
          });
        }),
      );

      const provider = new KokoroTTSProvider({ serverUrl: 'http://localhost:5000' });

      // Start consuming the async iterable (this triggers fetch)
      const iter = provider.synthesize('hello')[Symbol.asyncIterator]();
      // The first next() call drives execution to the fetch and read call
      void iter.next();
      // Let the event loop process the fetch
      await new Promise((r) => setTimeout(r, 10));

      provider.stop();
      expect(abortSignal?.aborted).toBe(true);
    });

    it('throws on non-OK response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

      const provider = new KokoroTTSProvider({ serverUrl: 'http://localhost:5000' });

      await expect(async () => {
        for await (const _chunk of provider.synthesize('hello')) {
          // consume
        }
      }).rejects.toThrow('Kokoro TTS request failed: 500');
    });
  });
});
