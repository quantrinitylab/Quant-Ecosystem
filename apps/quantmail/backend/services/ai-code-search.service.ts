import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const CodeSearchInputSchema = z.object({
  query: z.string(),
  repoId: z.string(),
  fileFilter: z.string().optional(),
  maxResults: z.number().int().positive().default(10),
});

export type CodeSearchInput = z.infer<typeof CodeSearchInputSchema>;

export interface CodeSearchResult {
  filePath: string;
  snippet: string;
  relevanceScore: number;
  explanation: string;
}

export interface CodeSearchResponse {
  results: CodeSearchResult[];
}

const CodeSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      filePath: z.string(),
      snippet: z.string(),
      relevanceScore: z.number().min(0).max(1),
      explanation: z.string(),
    }),
  ),
});

export class AICodeSearchService {
  constructor(private readonly ai: AIEngine) {}

  async semanticSearch(input: CodeSearchInput, userId: string): Promise<CodeSearchResponse> {
    const validated = CodeSearchInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Perform a semantic code search for the following query in repository ${validated.repoId}.

Query: ${validated.query}
${validated.fileFilter ? `File filter: ${validated.fileFilter}` : ''}
Max results: ${validated.maxResults}

Respond ONLY with valid JSON matching this schema:
{
  "results": [{ "filePath": string, "snippet": string, "relevanceScore": 0.0 to 1.0, "explanation": string }]
}`,
      systemPrompt:
        'You are a semantic code search engine. Find relevant code snippets that match the intent of the query, not just keyword matches. Rank results by relevance. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'code-search',
      temperature: 0.2,
      maxTokens: 2048,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI code search response', 500, 'AI_PARSE_ERROR');
    }

    const result = CodeSearchResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid code search result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
