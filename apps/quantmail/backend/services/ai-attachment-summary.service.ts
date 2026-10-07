import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const AttachmentMetadataSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  extractedText: z.string().optional(),
});

export const AttachmentSummarySchema = z.object({
  filename: z.string(),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  documentType: z.string(),
  confidence: z.number().min(0).max(1),
});

export const PreviewContentSchema = z.object({
  attachmentId: z.string(),
  preview: z.string(),
  pageCount: z.number().optional(),
  wordCount: z.number().optional(),
});

export type AttachmentMetadata = z.infer<typeof AttachmentMetadataSchema>;
export type AttachmentSummary = z.infer<typeof AttachmentSummarySchema>;
export type PreviewContent = z.infer<typeof PreviewContentSchema>;

export class AIAttachmentSummaryService {
  constructor(private readonly ai: AIEngine) {}

  async summarizeAttachment(
    metadata: AttachmentMetadata,
    userId: string,
  ): Promise<AttachmentSummary> {
    const validated = AttachmentMetadataSchema.parse(metadata);

    if (!validated.extractedText) {
      throw createAppError('No extracted text available for summarization', 400, 'NO_TEXT_CONTENT');
    }

    const response = await this.ai.infer({
      prompt: `Summarize this document attachment.

Filename: ${validated.filename}
Type: ${validated.mimeType}
Content:
${validated.extractedText.substring(0, 4000)}

Respond ONLY with valid JSON:
{
  "filename": "${validated.filename}",
  "summary": "2-3 sentence summary",
  "keyPoints": ["point 1", "point 2"],
  "documentType": "e.g., report, invoice, contract",
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are a document analysis assistant that summarizes attachments. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'attachment-summary',
      temperature: 0.3,
      maxTokens: 512,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI attachment summary response', 500, 'AI_PARSE_ERROR');
    }

    const result = AttachmentSummarySchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid attachment summary', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async previewContent(attachmentId: string, userId: string): Promise<PreviewContent> {
    return {
      attachmentId,
      preview: 'Preview content would be extracted from the attachment file.',
      pageCount: undefined,
      wordCount: undefined,
    };
  }
}
