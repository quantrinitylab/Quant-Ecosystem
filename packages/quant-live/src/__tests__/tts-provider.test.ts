import { describe, it, expect } from 'vitest';
import { TTSProviderFactory } from '../tts/tts-factory.js';
import { ElevenLabsTTSProvider } from '../tts/elevenlabs-provider.js';
import { KokoroTTSProvider } from '../tts/kokoro-provider.js';

describe('TTSProviderFactory', () => {
  it('creates an ElevenLabsTTSProvider for elevenlabs type', () => {
    const provider = TTSProviderFactory.create('elevenlabs', { voiceId: 'test' });
    expect(provider).toBeInstanceOf(ElevenLabsTTSProvider);
  });

  it('creates a KokoroTTSProvider for kokoro type', () => {
    const provider = TTSProviderFactory.create('kokoro', { serverUrl: 'http://localhost:5000' });
    expect(provider).toBeInstanceOf(KokoroTTSProvider);
  });

  it('throws for unknown provider type', () => {
    expect(() => TTSProviderFactory.create('unknown' as any, {})).toThrow(
      'Unknown TTS provider type',
    );
  });

  it('creates provider in mock fallback mode when no credentials', () => {
    const provider = TTSProviderFactory.create('elevenlabs', {});
    expect(provider).toBeInstanceOf(ElevenLabsTTSProvider);
    expect(provider.isStreaming).toBe(false);
  });
});
