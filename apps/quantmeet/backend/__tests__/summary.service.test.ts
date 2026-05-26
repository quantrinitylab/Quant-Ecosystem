import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SummaryService } from '../services/summary.service';
import type { TranscriptSegment } from '../services/transcript.service';

function createMockAI() {
  return {
    generateText: vi.fn(),
  };
}

function createMockTranscriptService(segments: TranscriptSegment[]) {
  return {
    getTranscript: vi.fn().mockReturnValue(segments),
    processAudioChunk: vi.fn(),
    clearTranscript: vi.fn(),
  };
}

function makeSegment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: 'seg-1',
    roomId: 'room-1',
    participantId: 'p-1',
    text: 'We should finish the feature by Friday',
    timestamp: new Date(),
    duration: 2.0,
    confidence: 0.95,
    ...overrides,
  };
}

describe('SummaryService', () => {
  let service: SummaryService;
  let mockAI: ReturnType<typeof createMockAI>;

  beforeEach(() => {
    mockAI = createMockAI();
    service = new SummaryService(mockAI);
  });

  describe('generateSummary', () => {
    it('takes transcript segments and returns MeetingSummary with summary, keyPoints, decisions', async () => {
      mockAI.generateText.mockResolvedValue(
        'Team discussed project timeline\nKey point 1\nKey point 2\nKey point 3\nDecision: Launch on Monday\nDecision: Use React\nDecision: Hire more devs',
      );

      const segments = [
        makeSegment({ text: 'We need to launch by Monday' }),
        makeSegment({ participantId: 'p-2', text: 'I agree, lets use React' }),
      ];

      const result = await service.generateSummary(segments);

      expect(result.id).toBeDefined();
      expect(result.summary).toBe('Team discussed project timeline');
      expect(result.keyPoints).toHaveLength(3);
      expect(result.decisions).toHaveLength(3);
      expect(result.generatedAt).toBeInstanceOf(Date);
      expect(result.roomId).toBe('room-1');
    });

    it('throws EMPTY_TRANSCRIPT when transcript is empty', async () => {
      await expect(service.generateSummary([])).rejects.toThrow('Transcript is empty');
    });

    it('calls AI with a prompt containing transcript text', async () => {
      mockAI.generateText.mockResolvedValue('Summary line');

      const segments = [makeSegment({ text: 'Hello world', participantId: 'p-1' })];
      await service.generateSummary(segments);

      expect(mockAI.generateText).toHaveBeenCalledTimes(1);
      const prompt = mockAI.generateText.mock.calls[0]![0] as string;
      expect(prompt).toContain('[p-1]: Hello world');
      expect(prompt).toContain('Summarize');
    });

    it('handles AI returning a single line', async () => {
      mockAI.generateText.mockResolvedValue('Brief summary with no details');

      const segments = [makeSegment()];
      const result = await service.generateSummary(segments);

      expect(result.summary).toBe('Brief summary with no details');
      expect(result.keyPoints).toEqual([]);
      expect(result.decisions).toEqual([]);
    });

    it('sets roomId from the first segment', async () => {
      mockAI.generateText.mockResolvedValue('Summary');

      const segments = [makeSegment({ roomId: 'room-xyz' })];
      const result = await service.generateSummary(segments);

      expect(result.roomId).toBe('room-xyz');
    });
  });

  describe('generateFromRoomId', () => {
    it('fetches transcript from transcriptService and generates summary', async () => {
      const segments = [
        makeSegment({ text: 'Lets plan the sprint' }),
        makeSegment({ participantId: 'p-2', text: 'Good idea' }),
      ];
      const mockTranscriptService = createMockTranscriptService(segments);
      mockAI.generateText.mockResolvedValue('Sprint planning discussion\nPoint A\nPoint B');

      const result = await service.generateFromRoomId('room-1', mockTranscriptService as never);

      expect(mockTranscriptService.getTranscript).toHaveBeenCalledWith('room-1');
      expect(result.roomId).toBe('room-1');
      expect(result.summary).toBe('Sprint planning discussion');
    });

    it('throws TRANSCRIPT_NOT_FOUND when room has no transcript', async () => {
      const mockTranscriptService = createMockTranscriptService([]);

      await expect(
        service.generateFromRoomId('room-empty', mockTranscriptService as never),
      ).rejects.toThrow('No transcript found for room');
    });

    it('passes transcript to AI for summary generation', async () => {
      const segments = [makeSegment({ text: 'Important discussion' })];
      const mockTranscriptService = createMockTranscriptService(segments);
      mockAI.generateText.mockResolvedValue('Meeting summary');

      await service.generateFromRoomId('room-1', mockTranscriptService as never);

      expect(mockAI.generateText).toHaveBeenCalledTimes(1);
    });
  });
});
