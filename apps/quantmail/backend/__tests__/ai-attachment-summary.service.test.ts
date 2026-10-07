import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIAttachmentSummaryService } from '../services/ai-attachment-summary.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AIAttachmentSummaryService', () => {
  let service: AIAttachmentSummaryService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AIAttachmentSummaryService(aiEngine as never);
  });

  describe('summarizeAttachment', () => {
    it('summarizes a PDF attachment', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          filename: 'report.pdf',
          summary:
            'Q4 financial report showing 15% revenue growth and expansion into 3 new markets.',
          keyPoints: [
            'Revenue grew 15%',
            'Expanded to 3 new markets',
            'Operating costs decreased 5%',
          ],
          documentType: 'financial report',
          confidence: 0.88,
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 500, completionTokens: 80, totalTokens: 580, estimatedCost: 0.005 },
        latencyMs: 400,
        cached: false,
      });

      const result = await service.summarizeAttachment(
        {
          id: 'att-1',
          filename: 'report.pdf',
          mimeType: 'application/pdf',
          size: 1024000,
          extractedText: 'Q4 Financial Report...',
        },
        'user-1',
      );

      expect(result.filename).toBe('report.pdf');
      expect(result.summary).toContain('Q4 financial report');
      expect(result.keyPoints).toHaveLength(3);
      expect(result.documentType).toBe('financial report');
      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'attachment-summary',
          temperature: 0.3,
        }),
      );
    });

    it('throws error when no extracted text is available', async () => {
      await expect(
        service.summarizeAttachment(
          {
            id: 'att-1',
            filename: 'image.png',
            mimeType: 'image/png',
            size: 500000,
          },
          'user-1',
        ),
      ).rejects.toThrow('No extracted text available for summarization');
    });

    it('throws error when AI returns invalid JSON', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'not json',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 150,
        cached: false,
      });

      await expect(
        service.summarizeAttachment(
          {
            id: '1',
            filename: 'doc.pdf',
            mimeType: 'application/pdf',
            size: 1000,
            extractedText: 'content',
          },
          'user-1',
        ),
      ).rejects.toThrow('Failed to parse AI attachment summary response');
    });
  });

  describe('previewContent', () => {
    it('returns preview content for attachment', async () => {
      const result = await service.previewContent('att-1', 'user-1');

      expect(result.attachmentId).toBe('att-1');
      expect(result.preview).toBeTruthy();
    });
  });
});
