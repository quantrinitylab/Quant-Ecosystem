import type { AIEngine } from '@quant/ai';
import { z } from 'zod';

export const PostDraftInputSchema = z.object({
  topic: z.string(),
  tone: z.enum(['casual', 'professional', 'witty', 'inspirational']).optional(),
  maxLength: z.number().int().positive().optional(),
});

export const HashtagInputSchema = z.object({
  content: z.string(),
  count: z.number().int().min(1).max(20).optional().default(5),
});

export const FactCheckInputSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const ContentSuggestionsInputSchema = z.object({
  topic: z.string().max(200).optional(),
  count: z.coerce.number().int().min(1).max(10).optional().default(5),
});

export type PostDraftInput = z.infer<typeof PostDraftInputSchema>;
export type HashtagInput = z.infer<typeof HashtagInputSchema>;
export type FactCheckInput = z.infer<typeof FactCheckInputSchema>;
export type ContentSuggestionsInput = z.infer<typeof ContentSuggestionsInputSchema>;

/** Verdicts the fact-check model is allowed to return. */
export type FactCheckVerdict = 'supported' | 'disputed' | 'unverifiable' | 'opinion';

const FACT_CHECK_VERDICTS: readonly FactCheckVerdict[] = [
  'supported',
  'disputed',
  'unverifiable',
  'opinion',
];

export interface FactCheckResult {
  verdict: FactCheckVerdict;
  confidence: number;
  rationale: string;
  claims: string[];
}

export class AIContentService {
  constructor(private readonly ai: AIEngine) {}

  async draftPost(input: unknown, userId: string): Promise<{ content: string }> {
    const validated = PostDraftInputSchema.parse(input);

    const tone = validated.tone ?? 'casual';
    const lengthHint = validated.maxLength
      ? ` Keep the post under approximately ${validated.maxLength} characters.`
      : '';

    const response = await this.ai.infer({
      prompt: `Write a social media post about the following topic:\n\n"${validated.topic}"\n\nTone: ${tone}.${lengthHint}\n\nReturn only the post content, no additional commentary.`,
      systemPrompt:
        'You are a creative social media content assistant. You write engaging, original posts in the requested tone.',
      userId,
      app: 'quantsync',
      feature: 'post-draft',
      temperature: 0.8,
    });

    return { content: response.content };
  }

  async suggestHashtags(input: unknown, userId: string): Promise<{ hashtags: string[] }> {
    const validated = HashtagInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Generate ${validated.count} relevant hashtags for the following content. Each hashtag must start with # and be on its own line without numbering or bullet points.\n\nContent: "${validated.content}"`,
      systemPrompt:
        'You are a hashtag generator. Return only hashtags, one per line, each starting with #. Do not include any numbering, bullet points, or additional text.',
      userId,
      app: 'quantsync',
      feature: 'hashtags',
      temperature: 0.7,
    });

    const hashtags = response.content
      .split('\n')
      .map((line) => {
        let cleaned = line.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim();
        if (cleaned && !cleaned.startsWith('#')) {
          cleaned = '#' + cleaned;
        }
        return cleaned;
      })
      .filter((line) => line.length > 0)
      .slice(0, validated.count);

    return { hashtags };
  }

  /**
   * Assess the factual claims in a draft before it is posted.
   *
   * Deliberately conservative: this is an assistive signal for the composer, **not** a
   * moderation decision. The model is asked for strict JSON and anything unparseable or
   * out-of-vocabulary degrades to `unverifiable` with zero confidence rather than inventing a
   * verdict — a fabricated "supported" is far worse than an honest "don't know".
   */
  async factCheck(input: unknown, userId: string): Promise<FactCheckResult> {
    const validated = FactCheckInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Assess the factual claims in the following content.

Content: """${validated.content}"""

Respond with ONLY a JSON object, no code fences and no commentary, shaped exactly:
{"verdict":"supported|disputed|unverifiable|opinion","confidence":0.0,"rationale":"one or two sentences","claims":["each distinct factual claim"]}

Use "opinion" when the content makes no verifiable factual claim, and "unverifiable" when you cannot assess it. "confidence" is between 0 and 1.`,
      systemPrompt:
        'You are a careful fact-checking assistant. You never guess. You return only valid JSON matching the requested shape.',
      userId,
      app: 'quantsync',
      feature: 'fact-check',
      // Low temperature: this is an assessment, not creative writing.
      temperature: 0.1,
    });

    return AIContentService.parseFactCheck(response.content);
  }

  /** Parse and sanitise the model's fact-check JSON, degrading safely on anything unexpected. */
  private static parseFactCheck(raw: string): FactCheckResult {
    const unverifiable: FactCheckResult = {
      verdict: 'unverifiable',
      confidence: 0,
      rationale: 'The fact-check response could not be interpreted.',
      claims: [],
    };

    // Tolerate fenced or prose-wrapped output by extracting the outermost JSON object.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return unverifiable;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return unverifiable;
    }
    if (typeof parsed !== 'object' || parsed === null) return unverifiable;

    const obj = parsed as Record<string, unknown>;
    const verdict = FACT_CHECK_VERDICTS.includes(obj['verdict'] as FactCheckVerdict)
      ? (obj['verdict'] as FactCheckVerdict)
      : 'unverifiable';

    const rawConfidence = Number(obj['confidence']);
    // An unusable verdict must not carry borrowed confidence.
    const confidence =
      verdict === 'unverifiable' && obj['verdict'] !== 'unverifiable'
        ? 0
        : Number.isFinite(rawConfidence)
          ? Math.min(Math.max(rawConfidence, 0), 1)
          : 0;

    const claims = Array.isArray(obj['claims'])
      ? obj['claims'].filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
      : [];

    const rationale =
      typeof obj['rationale'] === 'string' && obj['rationale'].trim()
        ? obj['rationale'].trim()
        : unverifiable.rationale;

    return { verdict, confidence, rationale, claims };
  }

  /**
   * Suggest post ideas for the composer. Returns a plain list of prompts, one per line.
   */
  async contentSuggestions(input: unknown, userId: string): Promise<{ suggestions: string[] }> {
    const validated = ContentSuggestionsInputSchema.parse(input);
    const focus = validated.topic?.trim()
      ? `The user is interested in: "${validated.topic.trim()}".`
      : 'The user has not given a topic, so suggest broadly appealing ideas.';

    const response = await this.ai.infer({
      prompt: `${focus}\n\nSuggest ${validated.count} short social-media post ideas. Put each idea on its own line, with no numbering, bullets, or extra commentary.`,
      systemPrompt:
        'You generate concise, original social media post ideas. Return one idea per line and nothing else.',
      userId,
      app: 'quantsync',
      feature: 'content-suggestions',
      temperature: 0.9,
    });

    const suggestions = response.content
      .split('\n')
      .map((line) => line.replace(/^[\d]+[.)\s]+|^[-*•]\s*/, '').trim())
      .filter((line) => line.length > 0)
      .slice(0, validated.count);

    return { suggestions };
  }
}
