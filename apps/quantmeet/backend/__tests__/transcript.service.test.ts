import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranscriptService } from '../services/transcript.service';

function createMockTranscriber() {
  return {
    transcribe: vi.fn(),
  };
}

describe('TranscriptService', () => {
  let service: TranscriptService;
  let mockTranscriber: ReturnType<typeof createMockTranscriber>;

  beforeEach(() => {
    mockTranscriber = createMockTranscriber();
    service = new TranscriptService(mockTranscriber);
  });

  describe('processAudioChunk', () => {
    it('calls transcriber and stores the resulting segment', async () => {
      mockTranscriber.transcribe.mockResolvedValue({
        text: 'Hello everyone',
        duration: 2.5,
        confidence: 0.95,
      });

      const segment = await service.processAudioChunk(
        'room-1',
        'participant-1',
        Buffer.from('audio-data'),
      );

      expect(segment.id).toBeDefined();
      expect(segment.roomId).toBe('room-1');
      expect(segment.participantId).toBe('participant-1');
      expect(segment.text).toBe('Hello everyone');
      expect(segment.duration).toBe(2.5);
      expect(segment.confidence).toBe(0.95);
      expect(segment.timestamp).toBeInstanceOf(Date);
      expect(mockTranscriber.transcribe).toHaveBeenCalledWith(Buffer.from('audio-data'));
    });

    it('stores segment and makes it retrievable via getTranscript', async () => {
      mockTranscriber.transcribe.mockResolvedValue({
        text: 'First chunk',
        duration: 1.0,
        confidence: 0.9,
      });

      await service.processAudioChunk('room-1', 'participant-1', Buffer.from('chunk-1'));

      const transcript = service.getTranscript('room-1');
      expect(transcript).toHaveLength(1);
      expect(transcript[0]!.text).toBe('First chunk');
    });

    it('throws EMPTY_AUDIO_BUFFER for empty buffer', async () => {
      await expect(
        service.processAudioChunk('room-1', 'participant-1', Buffer.alloc(0)),
      ).rejects.toThrow('Audio buffer is empty');
    });

    it('stores multiple segments in order', async () => {
      mockTranscriber.transcribe
        .mockResolvedValueOnce({ text: 'First', duration: 1.0, confidence: 0.9 })
        .mockResolvedValueOnce({ text: 'Second', duration: 1.5, confidence: 0.85 });

      await service.processAudioChunk('room-1', 'p-1', Buffer.from('chunk-1'));
      await service.processAudioChunk('room-1', 'p-2', Buffer.from('chunk-2'));

      const transcript = service.getTranscript('room-1');
      expect(transcript).toHaveLength(2);
      expect(transcript[0]!.text).toBe('First');
      expect(transcript[1]!.text).toBe('Second');
    });

    it('stores segment even when transcriber returns empty text', async () => {
      mockTranscriber.transcribe.mockResolvedValue({
        text: '',
        duration: 0.5,
        confidence: 0.1,
      });

      const segment = await service.processAudioChunk(
        'room-1',
        'participant-1',
        Buffer.from('silence'),
      );

      expect(segment.text).toBe('');
      const transcript = service.getTranscript('room-1');
      expect(transcript).toHaveLength(1);
    });
  });

  describe('getTranscript', () => {
    it('returns all segments for a room in order', async () => {
      mockTranscriber.transcribe
        .mockResolvedValueOnce({ text: 'A', duration: 1, confidence: 0.9 })
        .mockResolvedValueOnce({ text: 'B', duration: 1, confidence: 0.8 })
        .mockResolvedValueOnce({ text: 'C', duration: 1, confidence: 0.7 });

      await service.processAudioChunk('room-1', 'p-1', Buffer.from('a'));
      await service.processAudioChunk('room-1', 'p-2', Buffer.from('b'));
      await service.processAudioChunk('room-1', 'p-1', Buffer.from('c'));

      const transcript = service.getTranscript('room-1');

      expect(transcript).toHaveLength(3);
      expect(transcript[0]!.text).toBe('A');
      expect(transcript[1]!.text).toBe('B');
      expect(transcript[2]!.text).toBe('C');
    });

    it('returns empty array for room with no transcript', () => {
      const transcript = service.getTranscript('empty-room');
      expect(transcript).toEqual([]);
    });

    it('does not return segments from other rooms', async () => {
      mockTranscriber.transcribe
        .mockResolvedValueOnce({ text: 'Room 1', duration: 1, confidence: 0.9 })
        .mockResolvedValueOnce({ text: 'Room 2', duration: 1, confidence: 0.8 });

      await service.processAudioChunk('room-1', 'p-1', Buffer.from('a'));
      await service.processAudioChunk('room-2', 'p-2', Buffer.from('b'));

      const transcript = service.getTranscript('room-1');
      expect(transcript).toHaveLength(1);
      expect(transcript[0]!.text).toBe('Room 1');
    });
  });

  describe('clearTranscript', () => {
    it('empties transcript for room', async () => {
      mockTranscriber.transcribe.mockResolvedValue({
        text: 'Hello',
        duration: 1,
        confidence: 0.9,
      });

      await service.processAudioChunk('room-1', 'p-1', Buffer.from('data'));
      expect(service.getTranscript('room-1')).toHaveLength(1);

      service.clearTranscript('room-1');
      expect(service.getTranscript('room-1')).toEqual([]);
    });

    it('does not affect other rooms', async () => {
      mockTranscriber.transcribe
        .mockResolvedValueOnce({ text: 'Room 1', duration: 1, confidence: 0.9 })
        .mockResolvedValueOnce({ text: 'Room 2', duration: 1, confidence: 0.8 });

      await service.processAudioChunk('room-1', 'p-1', Buffer.from('a'));
      await service.processAudioChunk('room-2', 'p-2', Buffer.from('b'));

      service.clearTranscript('room-1');

      expect(service.getTranscript('room-1')).toEqual([]);
      expect(service.getTranscript('room-2')).toHaveLength(1);
    });

    it('is safe to call on a room with no transcript', () => {
      expect(() => service.clearTranscript('non-existent-room')).not.toThrow();
    });
  });
});
