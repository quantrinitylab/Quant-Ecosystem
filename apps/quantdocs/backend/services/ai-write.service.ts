import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const WriteFromOutlineResultSchema = z.object({
  title: z.string(),
  content: z.string(),
  sections: z.array(z.string()),
});

export const ExpandSectionResultSchema = z.object({
  expanded: z.string(),
  additions: z.array(z.string()),
});

export const SimplifyResultSchema = z.object({
  simplified: z.string(),
  readabilityScore: z.number().min(0).max(100),
  changes: z.array(z.string()),
});

export type WriteFromOutlineResult = z.infer<typeof WriteFromOutlineResultSchema>;
export type ExpandSectionResult = z.infer<typeof ExpandSectionResultSchema>;
export type SimplifyResult = z.infer<typeof SimplifyResultSchema>;

export class AIWriteService {
  constructor(private readonly ai: AIEngine) {}

  async writeFromOutline(
    bullets: string[],
    context: { tone?: string; style?: string },
    userId: string,
  ): Promise<WriteFromOutlineResult> {
    const bulletList = bullets.map((b) => `- ${b}`).join('\n');
    const toneInstruction = context.tone ? `Use a ${context.tone} tone.` : '';
    const styleInstruction = context.style ? `Write in a ${context.style} style.` : '';

    const response = await this.ai.infer({
      prompt: `Convert the following bullet point outline into a well-structured document. ${toneInstruction} ${styleInstruction}

Outline:
${bulletList}

Respond ONLY with valid JSON:
{
  "title": "document title derived from the outline",
  "content": "the full document content with paragraphs",
  "sections": ["section 1 title", "section 2 title"]
}`,
      systemPrompt:
        'You are a document writing assistant. Convert outlines into well-structured, coherent documents. Always respond with valid JSON only.',
      userId,
      app: 'quantdocs',
      feature: 'ai-write',
      temperature: 0.7,
      maxTokens: 2048,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI write response', 500, 'AI_PARSE_ERROR');
    }

    const result = WriteFromOutlineResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid write result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async expandSection(
    paragraph: string,
    instructions: string,
    userId: string,
  ): Promise<ExpandSectionResult> {
    const response = await this.ai.infer({
      prompt: `Expand the following paragraph with more detail based on the instructions.

Paragraph:
${paragraph}

Instructions: ${instructions}

Respond ONLY with valid JSON:
{
  "expanded": "the expanded paragraph with more detail",
  "additions": ["addition 1 description", "addition 2 description"]
}`,
      systemPrompt:
        'You are a document editing assistant. Expand paragraphs with relevant detail while maintaining coherence. Always respond with valid JSON only.',
      userId,
      app: 'quantdocs',
      feature: 'ai-write',
      temperature: 0.6,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI expand response', 500, 'AI_PARSE_ERROR');
    }

    const result = ExpandSectionResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid expand result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async simplify(
    text: string,
    audienceLevel: 'child' | 'general' | 'technical',
    userId: string,
  ): Promise<SimplifyResult> {
    const response = await this.ai.infer({
      prompt: `Simplify the following text for a ${audienceLevel} audience level.

Text:
${text}

Respond ONLY with valid JSON:
{
  "simplified": "the simplified text",
  "readabilityScore": 0 to 100 (higher means more readable),
  "changes": ["change 1 description", "change 2 description"]
}`,
      systemPrompt:
        'You are a document simplification assistant. Rewrite text for the target audience while preserving meaning. Always respond with valid JSON only.',
      userId,
      app: 'quantdocs',
      feature: 'ai-write',
      temperature: 0.5,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI simplify response', 500, 'AI_PARSE_ERROR');
    }

    const result = SimplifyResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid simplify result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
