import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import voiceRoutes from '../routes/voice';
import {
  listAvailableVoices,
  generateSpeechCacheKey,
  generateSsml,
  synthesizeSpeech,
  clearCacheForTesting,
  clampSpeed,
  clampPitch,
  STANDARD_VOICE_CATALOG,
  voiceoverTTSService,
  type VoiceProfile,
} from '../services/voiceover-tts.service';

describe('MagicAI Multi-Provider Voiceover & TTS Synthesis Engine', () => {
  beforeEach(() => {
    clearCacheForTesting();
  });

  // --------------------------------------------------------------------------
  // 1. Voice Catalog & Filtering Tests
  // --------------------------------------------------------------------------
  describe('Standard Voice Catalog & Filtering', () => {
    it('returns the complete standard voice catalog without filters', () => {
      const voices = listAvailableVoices();
      expect(voices).toBeDefined();
      expect(voices.length).toBe(19); // 6 OpenAI + 5 ElevenLabs + 2 Google + 6 Davinci

      const openaiVoices = voices.filter((v) => v.provider === 'openai');
      const elevenlabsVoices = voices.filter((v) => v.provider === 'elevenlabs');
      const googleVoices = voices.filter((v) => v.provider === 'google');

      expect(openaiVoices.map((v) => v.id)).toEqual(
        expect.arrayContaining(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']),
      );
      expect(elevenlabsVoices.map((v) => v.id)).toEqual(
        expect.arrayContaining(['rachel', 'domi', 'bella', 'antoni', 'adam']),
      );
      expect(googleVoices.map((v) => v.id)).toEqual(
        expect.arrayContaining(['en-US-Neural2-F', 'hi-IN-Neural2-A']),
      );
    });

    it('filters voices accurately by provider', () => {
      const openaiOnly = listAvailableVoices({ provider: 'openai' });
      expect(openaiOnly.length).toBe(6);
      expect(openaiOnly.every((v) => v.provider === 'openai')).toBe(true);

      const elevenlabsOnly = listAvailableVoices({ provider: 'elevenlabs' });
      expect(elevenlabsOnly.length).toBe(5);
      expect(elevenlabsOnly.every((v) => v.provider === 'elevenlabs')).toBe(true);

      const googleOnly = listAvailableVoices({ provider: 'google' });
      expect(googleOnly.length).toBe(2);
      expect(googleOnly.every((v) => v.provider === 'google')).toBe(true);
    });

    it('filters voices accurately by language (e.g. en-US vs hi-IN)', () => {
      const hindiVoices = listAvailableVoices({ language: 'hi-IN' });
      expect(hindiVoices.length).toBe(1);
      expect(hindiVoices[0].id).toBe('hi-IN-Neural2-A');
      expect(hindiVoices[0].language).toBe('hi-IN');

      const englishVoices = listAvailableVoices({ language: 'en-US' });
      expect(englishVoices.length).toBe(15);
      expect(englishVoices.every((v) => v.language === 'en-US')).toBe(true);
    });

    it('filters voices by both provider and language', () => {
      const googleHindi = listAvailableVoices({ provider: 'google', language: 'hi-IN' });
      expect(googleHindi.length).toBe(1);
      expect(googleHindi[0].id).toBe('hi-IN-Neural2-A');

      const openaiHindi = listAvailableVoices({ provider: 'openai', language: 'hi-IN' });
      expect(openaiHindi.length).toBe(0);
    });

    it('filters voices by gender', () => {
      const maleVoices = listAvailableVoices({ gender: 'male' });
      expect(maleVoices.length).toBe(8); // echo, fable, onyx, antoni, adam, vesper, zephyr, sol
      expect(maleVoices.every((v) => v.gender === 'male')).toBe(true);

      const femaleVoices = listAvailableVoices({ gender: 'female' });
      expect(femaleVoices.length).toBe(9); // nova, shimmer, rachel, domi, bella, en-US-Neural2-F, hi-IN-Neural2-A
      expect(femaleVoices.every((v) => v.gender === 'female')).toBe(true);

      const neutralVoices = listAvailableVoices({ gender: 'neutral' });
      expect(neutralVoices.length).toBe(2);
      expect(neutralVoices.some((v) => v.id === 'alloy')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // 2. SSML Generator Tests
  // --------------------------------------------------------------------------
  describe('SSML Prosody Generator', () => {
    it('wraps text with default rate and pitch prosody tags', () => {
      const ssml = generateSsml('Welcome to QuantAI voice synthesis');
      expect(ssml).toBe(
        '<speak><prosody rate="1" pitch="+0%">Welcome to QuantAI voice synthesis</prosody></speak>',
      );
    });

    it('wraps text with custom speed and pitch prosody tags', () => {
      const ssml = generateSsml('Accelerated speech', { speed: 1.5, pitch: 10 });
      expect(ssml).toBe(
        '<speak><prosody rate="1.5" pitch="+10%">Accelerated speech</prosody></speak>',
      );
    });

    it('formats negative pitch correctly in prosody tags', () => {
      const ssml = generateSsml('Deep tone speech', { speed: 0.8, pitch: -12 });
      expect(ssml).toBe(
        '<speak><prosody rate="0.8" pitch="-12%">Deep tone speech</prosody></speak>',
      );
    });
  });

  // --------------------------------------------------------------------------
  // 3. Clamping Tests for Speed and Pitch
  // --------------------------------------------------------------------------
  describe('Speed & Pitch Boundary Clamping', () => {
    it('clamps speed to minimum 0.25 and maximum 4.0', () => {
      expect(clampSpeed(0.05)).toBe(0.25);
      expect(clampSpeed(-1.5)).toBe(0.25);
      expect(clampSpeed(10.0)).toBe(4.0);
      expect(clampSpeed(4.5)).toBe(4.0);
      expect(clampSpeed(1.25)).toBe(1.25);
      expect(clampSpeed(undefined)).toBe(1.0);
      expect(clampSpeed(NaN)).toBe(1.0);
    });

    it('clamps pitch to minimum -20 and maximum +20', () => {
      expect(clampPitch(-50)).toBe(-20);
      expect(clampPitch(100)).toBe(20);
      expect(clampPitch(-20)).toBe(-20);
      expect(clampPitch(20)).toBe(20);
      expect(clampPitch(5.5)).toBe(5.5);
      expect(clampPitch(undefined)).toBe(0);
      expect(clampPitch(NaN)).toBe(0);
    });

    it('applies clamping when generating SSML with out-of-bounds parameters', () => {
      const ssml = generateSsml('Clamped utterance', { speed: 9.9, pitch: -99 });
      expect(ssml).toBe(
        '<speak><prosody rate="4" pitch="-20%">Clamped utterance</prosody></speak>',
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. SHA-256 Cache Key Determinism Tests
  // --------------------------------------------------------------------------
  describe('Deterministic SHA-256 Cache Key Generator', () => {
    it('generates identical 64-char hex SHA-256 hash for identical requests', () => {
      const req1 = {
        text: 'Testing cache key determinism',
        voiceId: 'rachel',
        speed: 1.2,
        pitch: 5,
      };
      const req2 = {
        text: 'Testing cache key determinism',
        voiceId: 'rachel',
        speed: 1.2,
        pitch: 5,
      };

      const key1 = generateSpeechCacheKey(req1);
      const key2 = generateSpeechCacheKey(req2);

      expect(key1).toHaveLength(64);
      expect(key2).toHaveLength(64);
      expect(key1).toBe(key2);
    });

    it('generates identical hash when default values are omitted vs explicitly supplied', () => {
      const reqImplicit = { text: 'Hello default world', voiceId: 'alloy' };
      const reqExplicit = {
        text: 'Hello default world',
        voiceId: 'alloy',
        speed: 1.0,
        pitch: 0,
        audioFormat: 'mp3' as const,
      };

      const keyImplicit = generateSpeechCacheKey(reqImplicit);
      const keyExplicit = generateSpeechCacheKey(reqExplicit);

      expect(keyImplicit).toBe(keyExplicit);
    });

    it('generates distinct hash for different texts, voices, or formats', () => {
      const baseReq = { text: 'Text A', voiceId: 'alloy' };
      const diffText = { text: 'Text B', voiceId: 'alloy' };
      const diffVoice = { text: 'Text A', voiceId: 'echo' };
      const diffFormat = { text: 'Text A', voiceId: 'alloy', audioFormat: 'wav' as const };

      const baseKey = generateSpeechCacheKey(baseReq);
      expect(generateSpeechCacheKey(diffText)).not.toBe(baseKey);
      expect(generateSpeechCacheKey(diffVoice)).not.toBe(baseKey);
      expect(generateSpeechCacheKey(diffFormat)).not.toBe(baseKey);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Speech Synthesis & Cache Hit/Miss Cycle Tests
  // --------------------------------------------------------------------------
  describe('Speech Synthesis & Cache Hit/Miss Cycle', () => {
    it('returns cacheHit: false on initial synthesis, then cacheHit: true on repeated synthesis', async () => {
      const request = {
        text: 'Hello, this is a demonstration of MagicAI voice synthesis in QuantAI.',
        voiceId: 'alloy',
        speed: 1.0,
        pitch: 0,
      };

      // 1. First call (cache miss)
      const firstResult = await synthesizeSpeech(request);
      expect(firstResult).toBeDefined();
      expect(firstResult.cacheHit).toBe(false);
      expect(firstResult.format).toBe('mp3');
      expect(firstResult.characterCount).toBe(request.text.length);
      expect(firstResult.durationSeconds).toBe(Math.ceil(request.text.length / 15));
      expect(firstResult.audioUrl).toMatch(/^data:audio\/mp3;base64,/);
      expect(firstResult.synthesizedAt).toBeDefined();

      // 2. Second call with identical request (cache hit)
      const secondResult = await synthesizeSpeech(request);
      expect(secondResult).toBeDefined();
      expect(secondResult.cacheHit).toBe(true);
      expect(secondResult.audioUrl).toBe(firstResult.audioUrl);
      expect(secondResult.durationSeconds).toBe(firstResult.durationSeconds);
      expect(secondResult.characterCount).toBe(firstResult.characterCount);
    });

    it('clears synthesis cache successfully when requested', async () => {
      const request = {
        text: 'Testing cache clear function',
        voiceId: 'nova',
      };

      const res1 = await synthesizeSpeech(request);
      expect(res1.cacheHit).toBe(false);

      const res2 = await synthesizeSpeech(request);
      expect(res2.cacheHit).toBe(true);

      // Clear cache
      clearCacheForTesting();

      // Third call should now be a miss again
      const res3 = await synthesizeSpeech(request);
      expect(res3.cacheHit).toBe(false);
    });

    it('supports voiceoverTTSService class methods interchangeably', async () => {
      const voices = voiceoverTTSService.listAvailableVoices();
      expect(voices.length).toBe(19);

      const ssml = voiceoverTTSService.generateSsml('Class test', { speed: 1.0 });
      expect(ssml).toContain('<speak>');

      const res = await voiceoverTTSService.synthesizeSpeech({
        text: 'Singleton test',
        voiceId: 'domi',
      });
      expect(res.cacheHit).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Fastify Route Integration Tests
  // --------------------------------------------------------------------------
  describe('Fastify Voice Routes (/voice/voices, /voice/synthesize, /voice/ssml)', () => {
    let app: ReturnType<typeof Fastify>;

    beforeEach(async () => {
      app = Fastify();
      await app.register(voiceRoutes, { prefix: '/voice' });
      await app.ready();
    });

    it('GET /voice/voices returns all available voices', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/voice/voices',
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(19);
      expect(Array.isArray(data.voices)).toBe(true);
    });

    it('GET /voice/voices?provider=elevenlabs filters voices by provider', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/voice/voices?provider=elevenlabs',
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.count).toBe(5);
      expect(data.voices.every((v: VoiceProfile) => v.provider === 'elevenlabs')).toBe(true);
    });

    it('POST /voice/synthesize executes speech synthesis and returns payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/voice/synthesize',
        payload: {
          text: 'Testing Fastify voice synthesis endpoint',
          voiceId: 'rachel',
          speed: 1.1,
          pitch: 2,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.format).toBe('mp3');
      expect(data.durationSeconds).toBeGreaterThan(0);
      expect(data.audioUrl).toMatch(/^data:audio\/mp3;base64,/);
      expect(data.cacheHit).toBe(false);
    });

    it('POST /voice/synthesize returns 400 when missing required parameters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/voice/synthesize',
        payload: {
          text: 'Missing voiceId',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBeDefined();
    });

    it('POST /voice/ssml returns wrapped SSML prosody payload', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/voice/ssml',
        payload: {
          text: 'Hello from SSML route',
          speed: 1.25,
          pitch: -5,
        },
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.ssml).toBe(
        '<speak><prosody rate="1.25" pitch="-5%">Hello from SSML route</prosody></speak>',
      );
    });
  });
});
