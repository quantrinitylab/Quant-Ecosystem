import { describe, it, expect, beforeEach } from 'vitest';
import {
  listAvailableVoices,
  estimateSpeechDuration,
  generateWordMarkers,
  synthesizeSpeech,
  clearTtsForTesting,
  TtsSynthesisParams,
} from '../services/voiceover-tts.service';

describe('Davinci Voiceover TTS Service', () => {
  beforeEach(() => {
    clearTtsForTesting();
  });

  describe('listAvailableVoices', () => {
    it('returns the standard catalog of voices', () => {
      const voices = listAvailableVoices();
      expect(voices.length).toBeGreaterThanOrEqual(6);
      const voiceIds = voices.map((v) => v.id);
      expect(voiceIds).toContain('aura');
      expect(voiceIds).toContain('vesper');
      expect(voiceIds).toContain('zenith');
      expect(voiceIds).toContain('zephyr');
      expect(voiceIds).toContain('echo');
      expect(voiceIds).toContain('sol');
    });

    it('filters voices by language', () => {
      const frVoices = listAvailableVoices('fr-FR');
      expect(frVoices.length).toBeGreaterThan(0);
      expect(frVoices.every((v) => v.language === 'fr-FR')).toBe(true);

      const enVoices = listAvailableVoices('en-US');
      expect(enVoices.length).toBeGreaterThan(0);
      expect(enVoices.every((v) => v.language === 'en-US')).toBe(true);
    });
  });

  describe('estimateSpeechDuration', () => {
    it('scales duration with word count', () => {
      const dur10 = estimateSpeechDuration(10);
      const dur20 = estimateSpeechDuration(20);
      expect(dur20).toBe(dur10 * 2);
    });

    it('scales duration with speed multiplier', () => {
      const durNormal = estimateSpeechDuration(10, 1.0);
      const durFast = estimateSpeechDuration(10, 2.0);
      const durSlow = estimateSpeechDuration(10, 0.5);

      expect(durFast).toBe(durNormal / 2);
      expect(durSlow).toBe(durNormal * 2);
    });
  });

  describe('generateWordMarkers', () => {
    it('creates sequential timestamps for each word', () => {
      const text = 'Hello world this is a test';
      const markers = generateWordMarkers(text, 1.0);

      expect(markers.length).toBe(6);
      expect(markers[0].word).toBe('Hello');
      expect(markers[0].startMs).toBe(0);

      for (let i = 1; i < markers.length; i++) {
        expect(markers[i].startMs).toBe(markers[i - 1].endMs);
      }
    });

    it('adjusts marker duration based on speed multiplier', () => {
      const text = 'Hello world';
      const markersNormal = generateWordMarkers(text, 1.0);
      const markersFast = generateWordMarkers(text, 2.0);

      expect(markersFast[0].endMs - markersFast[0].startMs).toBe(
        (markersNormal[0].endMs - markersNormal[0].startMs) / 2,
      );
    });
  });

  describe('synthesizeSpeech', () => {
    const userId = 'user_123';

    it('synthesizes speech and returns a valid result', () => {
      const params: TtsSynthesisParams = {
        voiceId: 'aura',
        text: 'This is a test speech synthesis.',
        tone: 'cheerful',
      };

      const result = synthesizeSpeech(userId, params);

      expect(result.id).toBeDefined();
      expect(result.userId).toBe(userId);
      expect(result.status).toBe('COMPLETED');
      expect(result.audioUrl).toBeDefined();
      expect(result.estimatedDurationMs).toBeGreaterThan(0);
      expect(result.wordMarkers.length).toBe(6); // 'This', 'is', 'a', 'test', 'speech', 'synthesis.'
      expect(result.params.voiceId).toBe('aura');
    });

    it('clamps speed and pitch parameters', () => {
      const params: TtsSynthesisParams = {
        voiceId: 'vesper',
        text: 'Clamping test.',
        speedMultiplier: 5.0, // Should clamp to 2.0
        pitchPercentage: -100, // Should clamp to -50
      };

      const result = synthesizeSpeech(userId, params);
      expect(result.params.speedMultiplier).toBe(2.0);
      expect(result.params.pitchPercentage).toBe(-50);
    });

    it('throws VOICE_NOT_FOUND for invalid voiceId', () => {
      const params: TtsSynthesisParams = {
        voiceId: 'invalid-voice-id',
        text: 'Test.',
      };

      expect(() => synthesizeSpeech(userId, params)).toThrow('VOICE_NOT_FOUND');
    });

    it('throws error for empty text', () => {
      const params: TtsSynthesisParams = {
        voiceId: 'aura',
        text: '   ',
      };

      expect(() => synthesizeSpeech(userId, params)).toThrow('Text must be non-empty');
    });
  });
});
