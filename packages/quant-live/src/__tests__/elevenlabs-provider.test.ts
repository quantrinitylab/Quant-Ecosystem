import { describe, it, expect, vi, afterEach } from 'vitest';
import { ElevenLabsTTSProvider } from '../tts/elevenlabs-provider.js';
import type { AudioChunk, TTSEvent } from '../types.js';

describe('ElevenLabsTTSProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('mock fallback mode (no API key)', () => {
    it('yields silence chunks when no API key is provided', async () => {
      const provider = new ElevenLabsTTSProvider({});
      const chunks: AudioChunk[] = [];

      for await (const chunk of provider.synthesize('hello world')) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      // All chunks should be silence (zeros)
      for (const chunk of chunks) {
        expect(chunk.data.every((v) => v === 0)).toBe(true);
        expect(chunk.sampleRate).toBe(24000);
        expect(chunk.channels).toBe(1);
      }
    });

    it('emits start and end events in mock mode', async () => {
      const provider = new ElevenLabsTTSProvider({});
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
      const provider = new ElevenLabsTTSProvider({});
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

    it('isStreaming becomes true during synthesis and false after', async () => {
      const provider = new ElevenLabsTTSProvider({});
      expect(provider.isStreaming).toBe(false);

      let streamingDuring = false;
      for await (const _chunk of provider.synthesize('test')) {
        streamingDuring = provider.isStreaming;
      }

      expect(streamingDuring).toBe(true);
      expect(provider.isStreaming).toBe(false);
    });
  });

  describe('WebSocket mode (with API key)', () => {
    it('connects to ElevenLabs WebSocket URL with voiceId and modelId', async () => {
      let constructedUrl = '';
      const mockWs = {
        send: vi.fn(),
        close: vi.fn(),
        addEventListener: vi.fn().mockImplementation((event: string, cb: () => void) => {
          if (event === 'open') {
            // Fire open synchronously for predictable test behavior
            Promise.resolve().then(cb);
          }
          if (event === 'close') {
            // Fire close shortly after open to end the stream
            Promise.resolve().then(() => Promise.resolve().then(cb));
          }
        }),
      };

      vi.stubGlobal(
        'WebSocket',
        vi.fn().mockImplementation(function (url: string) {
          constructedUrl = url;
          return mockWs;
        }),
      );

      const provider = new ElevenLabsTTSProvider({
        apiKey: 'test-key',
        voiceId: 'voice123',
        modelId: 'eleven_multilingual_v2',
      });

      for await (const _chunk of provider.synthesize('hello')) {
        // consume
      }

      expect(constructedUrl).toContain(
        'wss://api.elevenlabs.io/v1/text-to-speech/voice123/stream-input',
      );
      expect(constructedUrl).toContain('model_id=eleven_multilingual_v2');
    });

    it('sends text and API key over WebSocket', async () => {
      const mockWs = {
        send: vi.fn(),
        close: vi.fn(),
        addEventListener: vi.fn().mockImplementation((event: string, cb: () => void) => {
          if (event === 'open') {
            Promise.resolve().then(cb);
          }
          if (event === 'close') {
            Promise.resolve().then(() => Promise.resolve().then(cb));
          }
        }),
      };

      vi.stubGlobal(
        'WebSocket',
        vi.fn().mockImplementation(function () {
          return mockWs;
        }),
      );

      const provider = new ElevenLabsTTSProvider({
        apiKey: 'my-api-key',
        voiceId: 'voice123',
      });

      for await (const _chunk of provider.synthesize('hello world')) {
        // consume
      }

      expect(mockWs.send).toHaveBeenCalled();
      const firstPayload = JSON.parse(mockWs.send.mock.calls[0]![0] as string);
      expect(firstPayload.text).toBe('hello world');
      expect(firstPayload.xi_api_key).toBe('my-api-key');
    });

    it('stop closes the WebSocket connection', async () => {
      let openCb: (() => void) | undefined;
      const mockWs = {
        send: vi.fn(),
        close: vi.fn(),
        addEventListener: vi.fn().mockImplementation((event: string, cb: () => void) => {
          if (event === 'open') {
            openCb = cb;
          }
          // Don't fire close automatically - let stop() close it
        }),
      };

      vi.stubGlobal(
        'WebSocket',
        vi.fn().mockImplementation(function () {
          return mockWs;
        }),
      );

      const provider = new ElevenLabsTTSProvider({
        apiKey: 'test-key',
        voiceId: 'voice123',
      });

      const iter = provider.synthesize('hello')[Symbol.asyncIterator]();

      // Start consuming to trigger the generator
      void iter.next();

      // Wait a tick for the WebSocket constructor to be called
      await new Promise((r) => setTimeout(r, 0));

      // Manually fire the open event so that ws is assigned in the provider
      openCb!();
      await new Promise((r) => setTimeout(r, 0));

      provider.stop();
      expect(mockWs.close).toHaveBeenCalled();
    });
  });
});
