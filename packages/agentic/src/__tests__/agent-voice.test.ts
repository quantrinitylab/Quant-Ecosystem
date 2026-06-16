import { describe, it, expect, vi } from 'vitest';
import { AgentVoiceInterface, type VoiceBackend } from '../voice/agent-voice';

describe('AgentVoiceInterface - dual mode', () => {
  describe('real backend path (injected)', () => {
    it('textToSpeech returns audio produced by the backend', async () => {
      const audio = Buffer.from([1, 2, 3, 4]);
      const backend: VoiceBackend = {
        synthesize: vi.fn().mockResolvedValue(audio),
        transcribe: vi.fn(),
      };
      const voice = new AgentVoiceInterface({ voice: 'nova', speed: 1.25 }, backend);

      expect(voice.isBackendConfigured()).toBe(true);
      const result = await voice.textToSpeech('hello world');

      expect(result).toEqual(audio);
      expect(backend.synthesize).toHaveBeenCalledWith(
        'hello world',
        expect.objectContaining({ voice: 'nova', speed: 1.25 }),
      );
    });

    it('speechToText returns the transcription produced by the backend', async () => {
      const backend: VoiceBackend = {
        synthesize: vi.fn(),
        transcribe: vi.fn().mockResolvedValue('real transcription'),
      };
      const voice = new AgentVoiceInterface({}, backend);

      const text = await voice.speechToText(Buffer.from([9, 9]));
      expect(text).toBe('real transcription');
      expect(backend.transcribe).toHaveBeenCalledOnce();
    });

    it('processVoiceCommand uses the backend transcription', async () => {
      const backend: VoiceBackend = {
        synthesize: vi.fn(),
        transcribe: vi.fn().mockResolvedValue('turn on the lights'),
      };
      const voice = new AgentVoiceInterface({}, backend);

      const out = await voice.processVoiceCommand(Buffer.from([1]), 'agent-1');
      expect(out).toEqual({
        transcription: 'turn on the lights',
        response: 'Agent agent-1 processed: turn on the lights',
      });
    });
  });

  describe('fallback path', () => {
    it('falls back to empty buffer / placeholder when no backend is configured', async () => {
      const voice = new AgentVoiceInterface({}); // no backend, no env

      expect(voice.isBackendConfigured()).toBe(false);
      const audio = await voice.textToSpeech('hello');
      expect(audio.length).toBe(0);

      const text = await voice.speechToText(Buffer.from([1]));
      expect(text).toBe('This is a placeholder transcription');
    });

    it('falls back (and warns) when the backend throws', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const backend: VoiceBackend = {
        synthesize: vi.fn().mockRejectedValue(new Error('tts down')),
        transcribe: vi.fn().mockRejectedValue(new Error('stt down')),
      };
      const voice = new AgentVoiceInterface({}, backend);

      const audio = await voice.textToSpeech('hello');
      expect(audio.length).toBe(0);

      const text = await voice.speechToText(Buffer.from([1]));
      expect(text).toBe('This is a placeholder transcription');

      expect(warn).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });
  });
});
