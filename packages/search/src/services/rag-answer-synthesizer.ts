// ============================================================================
// RAG Answer Synthesizer - AI-driven answer synthesis with citations
// ============================================================================

import type { AIEngine } from '@quant/ai';

export interface RagContext {
  id: string;
  content: string;
  title?: string;
  source?: string;
  score: number;
}

export interface Citation {
  resultId: string;
  excerpt: string;
  confidence: number;
}

export interface RagAnswer {
  answer: string;
  citations: Citation[];
}

export interface RagAnswerSynthesizerOptions {
  maxContextPassages?: number;
  maxPassageLength?: number;
}

const DEFAULT_MAX_CONTEXT_PASSAGES = 20;
const DEFAULT_MAX_PASSAGE_LENGTH = 500;

const SYSTEM_PROMPT = `You are a search assistant that synthesizes answers from provided context passages.

Rules:
1. ONLY use information present in the provided context passages.
2. For each claim you make, cite the passage number in brackets like [1], [2], etc.
3. If the context does not contain enough information to answer the question, say so clearly.
4. Do NOT make up or hallucinate information not present in the context.
5. Be concise and direct.

After your answer, list citations in this exact format:
CITATIONS:
[N] resultId="<id>" excerpt="<brief quote from passage>" confidence=<0.0-1.0>

Where N is the passage number, id is the passage's ID, excerpt is the relevant quote, and confidence is how relevant the passage is (0.0-1.0).`;

/**
 * RagAnswerSynthesizer - Takes top-N search results + query, formats as numbered
 * context passages, and calls the AI engine to produce a synthesized answer with citations.
 *
 * Citations reference result IDs + excerpt + confidence. Uses a structured prompt that
 * instructs the LLM to only cite claims actually present in the provided context.
 */
export class RagAnswerSynthesizer {
  private readonly aiEngine: AIEngine;
  private readonly maxContextPassages: number;
  private readonly maxPassageLength: number;

  constructor(aiEngine: AIEngine, options?: RagAnswerSynthesizerOptions) {
    this.aiEngine = aiEngine;
    this.maxContextPassages = options?.maxContextPassages ?? DEFAULT_MAX_CONTEXT_PASSAGES;
    this.maxPassageLength = options?.maxPassageLength ?? DEFAULT_MAX_PASSAGE_LENGTH;
  }

  /**
   * Synthesize an answer from query and search results.
   * Returns an answer with citations referencing the provided context.
   */
  async synthesize(query: string, results: RagContext[]): Promise<RagAnswer> {
    if (results.length === 0) {
      return { answer: '', citations: [] };
    }

    const passages = results.slice(0, this.maxContextPassages);
    const contextBlock = this.formatContextBlock(passages);
    const prompt = `Question: ${query}\n\nContext:\n${contextBlock}\n\nProvide a concise answer with citations.`;

    const response = await this.aiEngine.infer({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      userId: 'system',
      app: 'search' as never,
      feature: 'rag-synthesis',
      temperature: 0.3,
      maxTokens: 1024,
    });

    const { answer, citations } = this.parseResponse(response.content, passages);

    return { answer, citations };
  }

  private formatContextBlock(passages: RagContext[]): string {
    return passages
      .map((p, idx) => {
        const content = p.content.slice(0, this.maxPassageLength);
        const title = p.title ? ` (${p.title})` : '';
        return `[${idx + 1}] ID: ${p.id}${title}\n${content}`;
      })
      .join('\n\n');
  }

  private parseResponse(
    responseText: string,
    passages: RagContext[],
  ): { answer: string; citations: Citation[] } {
    const citationSeparator = 'CITATIONS:';
    const separatorIdx = responseText.indexOf(citationSeparator);

    let answer: string;
    let citationBlock: string;

    if (separatorIdx !== -1) {
      answer = responseText.slice(0, separatorIdx).trim();
      citationBlock = responseText.slice(separatorIdx + citationSeparator.length).trim();
    } else {
      answer = responseText.trim();
      citationBlock = '';
    }

    const citations = this.parseCitations(citationBlock, passages);

    return { answer, citations };
  }

  private parseCitations(citationBlock: string, passages: RagContext[]): Citation[] {
    if (!citationBlock) return [];

    const validIds = new Set(passages.map((p) => p.id));
    const citations: Citation[] = [];
    const citationPattern =
      /\[\d+\]\s*resultId="([^"]+)"\s*excerpt="([^"]+)"\s*confidence=([\d.]+)/g;

    let match: RegExpExecArray | null;
    while ((match = citationPattern.exec(citationBlock)) !== null) {
      const resultId = match[1]!;
      const excerpt = match[2]!;
      const confidence = parseFloat(match[3]!);

      // Only accept citations that reference IDs actually in our context
      if (validIds.has(resultId) && !isNaN(confidence)) {
        citations.push({
          resultId,
          excerpt,
          confidence: Math.min(1, Math.max(0, confidence)),
        });
      }
    }

    return citations;
  }
}
