import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const DiagramResultSchema = z.object({
  mermaid: z.string(),
  title: z.string(),
});

export const TableResultSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export type DiagramResult = z.infer<typeof DiagramResultSchema>;
export type TableResult = z.infer<typeof TableResultSchema>;

export class AIDiagramService {
  constructor(private readonly ai: AIEngine) {}

  async textToDiagram(
    description: string,
    diagramType: 'flowchart' | 'sequence' | 'class' | 'state',
    userId: string,
  ): Promise<DiagramResult> {
    const response = await this.ai.infer({
      prompt: `Generate a Mermaid ${diagramType} diagram from the following description.

Description:
${description}

Respond ONLY with valid JSON:
{
  "mermaid": "the complete mermaid diagram code",
  "title": "a descriptive title for the diagram"
}`,
      systemPrompt:
        'You are a diagram generation assistant. Create valid Mermaid diagram syntax from text descriptions. Always respond with valid JSON only.',
      userId,
      app: 'quantdocs',
      feature: 'ai-diagram',
      temperature: 0.4,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI diagram response', 500, 'AI_PARSE_ERROR');
    }

    const result = DiagramResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid diagram result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async textToTable(text: string, userId: string): Promise<TableResult> {
    const response = await this.ai.infer({
      prompt: `Extract structured tabular data from the following text and organize it into a table.

Text:
${text}

Respond ONLY with valid JSON:
{
  "headers": ["column1", "column2", "column3"],
  "rows": [["row1col1", "row1col2", "row1col3"]]
}`,
      systemPrompt:
        'You are a data extraction assistant. Extract structured data from text and organize it into tables. Always respond with valid JSON only.',
      userId,
      app: 'quantdocs',
      feature: 'ai-diagram',
      temperature: 0.3,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI table response', 500, 'AI_PARSE_ERROR');
    }

    const result = TableResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid table result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
