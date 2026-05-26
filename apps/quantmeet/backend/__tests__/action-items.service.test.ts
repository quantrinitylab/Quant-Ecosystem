import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionItemsService } from '../services/action-items.service';
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
    text: 'Alice should review the PR by tomorrow',
    timestamp: new Date(),
    duration: 2.0,
    confidence: 0.95,
    ...overrides,
  };
}

describe('ActionItemsService', () => {
  let service: ActionItemsService;
  let mockAI: ReturnType<typeof createMockAI>;

  beforeEach(() => {
    mockAI = createMockAI();
    service = new ActionItemsService(mockAI);
  });

  describe('extractActionItems', () => {
    it('takes transcript segments and returns ActionItem array with proper fields', async () => {
      mockAI.generateText.mockResolvedValue(
        'Review the PR by tomorrow\nUpdate the documentation\nDeploy to staging',
      );

      const segments = [
        makeSegment({ text: 'Alice should review the PR' }),
        makeSegment({ participantId: 'p-2', text: 'Bob will update docs' }),
      ];

      const items = await service.extractActionItems(segments);

      expect(items).toHaveLength(3);
      expect(items[0]!.id).toBeDefined();
      expect(items[0]!.title).toBe('Review the PR by tomorrow');
      expect(items[0]!.priority).toBe('medium');
      expect(items[0]!.status).toBe('pending');
      expect(items[0]!.assignee).toBeNull();
      expect(items[0]!.dueDate).toBeNull();
    });

    it('returns empty array when AI returns no actionable content', async () => {
      mockAI.generateText.mockResolvedValue('');

      const segments = [makeSegment({ text: 'Just chatting about weather' })];

      const items = await service.extractActionItems(segments);

      expect(items).toEqual([]);
    });

    it('throws EMPTY_TRANSCRIPT when transcript is empty', async () => {
      await expect(service.extractActionItems([])).rejects.toThrow('Transcript is empty');
    });

    it('calls AI with a prompt containing transcript text', async () => {
      mockAI.generateText.mockResolvedValue('Do something');

      const segments = [makeSegment({ text: 'Fix the bug', participantId: 'dev-1' })];
      await service.extractActionItems(segments);

      expect(mockAI.generateText).toHaveBeenCalledTimes(1);
      const prompt = mockAI.generateText.mock.calls[0]![0] as string;
      expect(prompt).toContain('[dev-1]: Fix the bug');
      expect(prompt).toContain('Extract action items');
    });

    it('generates unique ids for each action item', async () => {
      mockAI.generateText.mockResolvedValue('Task 1\nTask 2\nTask 3');

      const segments = [makeSegment()];
      const items = await service.extractActionItems(segments);

      const ids = items.map((item) => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('extractFromRoomId', () => {
    it('fetches transcript from service then extracts items', async () => {
      const segments = [
        makeSegment({ text: 'Alice should do the review' }),
        makeSegment({ participantId: 'p-2', text: 'Bob will deploy' }),
      ];
      const mockTranscriptService = createMockTranscriptService(segments);
      mockAI.generateText.mockResolvedValue('Review code\nDeploy app');

      const items = await service.extractFromRoomId('room-1', mockTranscriptService as never);

      expect(mockTranscriptService.getTranscript).toHaveBeenCalledWith('room-1');
      expect(items).toHaveLength(2);
      expect(items[0]!.title).toBe('Review code');
      expect(items[1]!.title).toBe('Deploy app');
    });

    it('throws TRANSCRIPT_NOT_FOUND when room has no transcript', async () => {
      const mockTranscriptService = createMockTranscriptService([]);

      await expect(
        service.extractFromRoomId('room-empty', mockTranscriptService as never),
      ).rejects.toThrow('No transcript found for room');
    });

    it('passes all transcript segments to extractActionItems', async () => {
      const segments = [
        makeSegment({ text: 'Task A' }),
        makeSegment({ text: 'Task B' }),
        makeSegment({ text: 'Task C' }),
      ];
      const mockTranscriptService = createMockTranscriptService(segments);
      mockAI.generateText.mockResolvedValue('Item 1');

      await service.extractFromRoomId('room-1', mockTranscriptService as never);

      const prompt = mockAI.generateText.mock.calls[0]![0] as string;
      expect(prompt).toContain('Task A');
      expect(prompt).toContain('Task B');
      expect(prompt).toContain('Task C');
    });
  });
});
