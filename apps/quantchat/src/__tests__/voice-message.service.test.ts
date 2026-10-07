import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceMessageService } from '../services/voice-message.service';

describe('VoiceMessageService', () => {
  let service: VoiceMessageService;

  beforeEach(() => {
    service = new VoiceMessageService();
  });

  describe('startRecording', () => {
    it('should return initial recording state', () => {
      const state = service.startRecording();
      expect(state.isRecording).toBe(true);
      expect(state.duration).toBe(0);
      expect(state.amplitude).toBe(0);
    });
  });

  describe('stopRecording', () => {
    it('should return a voice message with id and waveform', () => {
      service.startRecording();
      const message = service.stopRecording();

      expect(message.id).toBeDefined();
      expect(message.id.startsWith('voice_')).toBe(true);
      expect(message.waveform).toHaveLength(40);
      expect(message.url).toContain('blob://');
      expect(message.duration).toBeGreaterThanOrEqual(0);
    });

    it('should generate waveform values between 0 and 1', () => {
      service.startRecording();
      const message = service.stopRecording();

      for (const value of message.waveform) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('generateWaveform', () => {
    it('should generate correct number of bars', () => {
      const audioData = new Float32Array(1000);
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = Math.sin(i / 10) * 0.5;
      }

      const waveform = service.generateWaveform(audioData, 20);
      expect(waveform).toHaveLength(20);
    });

    it('should return values between 0 and 1', () => {
      const audioData = new Float32Array(500);
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = (Math.random() - 0.5) * 2;
      }

      const waveform = service.generateWaveform(audioData, 10);
      for (const value of waveform) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });

    it('should return empty array for empty audio', () => {
      const audioData = new Float32Array(0);
      const waveform = service.generateWaveform(audioData, 10);
      expect(waveform).toHaveLength(0);
    });

    it('should return empty array for zero bars', () => {
      const audioData = new Float32Array(100);
      const waveform = service.generateWaveform(audioData, 0);
      expect(waveform).toHaveLength(0);
    });
  });

  describe('getDuration', () => {
    it('should calculate duration from audio data and sample rate', () => {
      const audioData = new Float32Array(44100); // 1 second at 44100Hz
      const duration = service.getDuration(audioData, 44100);
      expect(duration).toBe(1);
    });

    it('should calculate duration for 48kHz sample rate', () => {
      const audioData = new Float32Array(96000); // 2 seconds at 48000Hz
      const duration = service.getDuration(audioData, 48000);
      expect(duration).toBe(2);
    });

    it('should return 0 for zero sample rate', () => {
      const audioData = new Float32Array(1000);
      const duration = service.getDuration(audioData, 0);
      expect(duration).toBe(0);
    });

    it('should return 0 for empty audio data', () => {
      const audioData = new Float32Array(0);
      const duration = service.getDuration(audioData, 44100);
      expect(duration).toBe(0);
    });
  });

  describe('getTranscription', () => {
    it('should return transcription for recorded message', async () => {
      service.startRecording();
      const message = service.stopRecording();

      const transcription = await service.getTranscription(message.id);
      expect(transcription).toContain(message.id);
    });

    it('should return empty string for unknown message', async () => {
      const transcription = await service.getTranscription('unknown');
      expect(transcription).toBe('');
    });

    it('should cache transcription result', async () => {
      service.startRecording();
      const message = service.stopRecording();

      const first = await service.getTranscription(message.id);
      const second = await service.getTranscription(message.id);
      expect(first).toBe(second);
    });
  });
});
