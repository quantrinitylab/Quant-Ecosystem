import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VoiceBotAgentService,
  DeterministicWavSynthProvider,
  CartesiaTTSProvider,
  PiperTTSProvider,
  DeterministicSTTProvider,
  WhisperSTTProvider,
} from '../services/voice-bot-agent.service';

vi.mock('livekit-server-sdk', () => {
  const mockCreateRoom = vi.fn().mockResolvedValue({
    name: 'chat-call:test-call',
    sid: 'RM_call123',
    numParticipants: 0,
    maxParticipants: 2,
    creationTime: BigInt(1700000000),
  });

  const mockDeleteRoom = vi.fn().mockResolvedValue(undefined);
  const mockRemoveParticipant = vi.fn().mockResolvedValue(undefined);

  const RoomServiceClient = vi.fn().mockImplementation(function () {
    return {
      createRoom: mockCreateRoom,
      deleteRoom: mockDeleteRoom,
      removeParticipant: mockRemoveParticipant,
    };
  });

  const mockToJwt = vi.fn().mockResolvedValue('eyJhbGciOiJIUzI1NiJ9.bot-token.sig');
  const mockAddGrant = vi.fn();

  const AccessToken = vi.fn().mockImplementation(function () {
    return {
      addGrant: mockAddGrant,
      toJwt: mockToJwt,
    };
  });

  return {
    RoomServiceClient,
    AccessToken,
  };
});

describe('VoiceBotAgentService & Audio Providers (Task VC-01)', () => {
  describe('DeterministicWavSynthProvider', () => {
    const synth = new DeterministicWavSynthProvider();

    it('synthesizes valid RIFF WAV audio buffer with standard header', async () => {
      const result = await synth.synthesize('Namaste! You have a meeting.');

      expect(result.format).toBe('wav');
      expect(result.sampleRate).toBe(16000);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.audioBuffer.length).toBeGreaterThan(44);

      // Verify RIFF header
      expect(result.audioBuffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(result.audioBuffer.subarray(8, 12).toString('ascii')).toBe('WAVE');
      expect(result.audioBuffer.subarray(12, 16).toString('ascii')).toBe('fmt ');
      expect(result.audioBuffer.subarray(36, 40).toString('ascii')).toBe('data');
    });

    it('duration scales with word count and speed parameter', async () => {
      const normal = await synth.synthesize('One two three four five', { speed: 1.0 });
      const fast = await synth.synthesize('One two three four five', { speed: 2.0 });

      expect(normal.durationMs).toBeGreaterThan(fast.durationMs);
    });
  });

  describe('CartesiaTTSProvider', () => {
    it('falls back safely to deterministic synthesis when no API key is set', async () => {
      const provider = new CartesiaTTSProvider('');
      const result = await provider.synthesize('Hello from Cartesia fallback');

      expect(result.format).toBe('wav');
      expect(result.audioBuffer.length).toBeGreaterThan(44);
    });
  });

  describe('PiperTTSProvider', () => {
    it('falls back gracefully to deterministic synthesis when PIPER_TTS_ENDPOINT is unset', async () => {
      const provider = new PiperTTSProvider();
      const result = await provider.synthesize('Hello from Piper fallback');

      expect(result.format).toBe('wav');
      expect(result.audioBuffer.length).toBeGreaterThan(44);
    });
  });

  describe('DeterministicSTTProvider', () => {
    const stt = new DeterministicSTTProvider();

    it('transcribes valid audio buffer with high confidence', async () => {
      const fakeBuffer = Buffer.alloc(100);
      const result = await stt.transcribe(fakeBuffer);

      expect(result.text).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0.9);
      expect(result.detectedLanguage).toBe('en');
    });

    it('returns custom mock transcript if programmed', async () => {
      stt.setMockTranscript('I am running 5 minutes late');
      const fakeBuffer = Buffer.alloc(100);
      const result = await stt.transcribe(fakeBuffer);

      expect(result.text).toBe('I am running 5 minutes late');
      expect(result.confidence).toBe(0.98);
    });

    it('returns empty text for undersized buffers', async () => {
      const tinyBuffer = Buffer.alloc(10);
      const result = await stt.transcribe(tinyBuffer);

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
    });
  });

  describe('WhisperSTTProvider', () => {
    it('falls back to deterministic provider when OPENAI_API_KEY is not configured', async () => {
      const provider = new WhisperSTTProvider('');
      const fakeBuffer = Buffer.alloc(100);
      const result = await provider.transcribe(fakeBuffer);

      expect(result.text).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('VoiceBotAgentService Core Engine', () => {
    let service: VoiceBotAgentService;

    beforeEach(() => {
      vi.clearAllMocks();
      service = new VoiceBotAgentService({
        apiKey: 'devkey',
        apiSecret: 'devsecret',
        wsUrl: 'ws://localhost:7880',
        botIdentity: 'quanty-test-bot',
      });
    });

    it('generates a LiveKit JWT token for the bot', async () => {
      const token = await service.generateBotToken('chat-call:room-1');
      expect(token).toBe('eyJhbGciOiJIUzI1NiJ9.bot-token.sig');
    });

    it('creates an active session and registers metadata', () => {
      const session = service.createSession('chat-call:room-1', 'user-123', {
        meetingId: 'mtg-456',
      });

      expect(session.sessionId).toMatch(/^vbs_/);
      expect(session.roomName).toBe('chat-call:room-1');
      expect(session.targetUserId).toBe('user-123');
      expect(session.botIdentity).toBe('quanty-test-bot');
      expect(session.status).toBe('active');
      expect(session.transcript).toHaveLength(0);
      expect(session.metadata).toEqual({ meetingId: 'mtg-456' });

      expect(service.getSession(session.sessionId)).toBe(session);
      expect(service.getSessionByRoom('chat-call:room-1')).toBe(session);
    });

    it('executes bot speech turn and appends to transcript', async () => {
      const session = service.createSession('chat-call:room-2', 'user-123');
      const { tts, turn } = await service.speak(
        session.sessionId,
        'Namaste! Meeting starting soon.',
      );

      expect(tts.format).toBe('wav');
      expect(turn.speaker).toBe('bot');
      expect(turn.text).toBe('Namaste! Meeting starting soon.');
      expect(session.transcript).toHaveLength(1);
      expect(session.status).toBe('listening');
    });

    it('processes user audio and records user turn in transcript', async () => {
      const session = service.createSession('chat-call:room-3', 'user-123');
      const fakeAudio = Buffer.alloc(100);

      const { stt, turn } = await service.processUserAudio(session.sessionId, fakeAudio);

      expect(stt.text).toBeTruthy();
      expect(turn.speaker).toBe('user');
      expect(session.transcript).toHaveLength(1);
    });

    it('records explicit user text turns', () => {
      const session = service.createSession('chat-call:room-4', 'user-123');
      const turn = service.recordUserTextTurn(session.sessionId, 'Please join now');

      expect(turn.speaker).toBe('user');
      expect(turn.text).toBe('Please join now');
      expect(session.transcript).toHaveLength(1);
    });

    it('ends session and cleans up status', async () => {
      const session = service.createSession('chat-call:room-5', 'user-123');
      const ended = await service.endSession(session.sessionId);

      expect(ended.status).toBe('ended');
      expect(ended.endedAt).toBeDefined();
      expect(service.getSessionByRoom('chat-call:room-5')).toBeUndefined();
    });

    it('throws 404 when operating on non-existent session', async () => {
      await expect(service.speak('non-existent', 'hello')).rejects.toThrow(
        'Voice bot session not found',
      );
      await expect(service.processUserAudio('non-existent', Buffer.alloc(10))).rejects.toThrow(
        'Voice bot session not found',
      );
      await expect(service.endSession('non-existent')).rejects.toThrow(
        'Voice bot session not found',
      );
    });
  });
});
