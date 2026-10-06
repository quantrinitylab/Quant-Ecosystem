// ============================================================================
// QuantAI — Quanty Feed Generator (Q8)
//
// Scheduled/manual job that builds feed posts from a user's instruction prompt.
//
// HONESTY CONTRACT (critical):
// - Every post this generator creates has provenance 'agent_brief' and is
//   labeled "Quanty brief" in the UI.
// - It NEVER fabricates external news: no invented headlines, no invented
//   source URLs, no invented source names. If the instructions ask for news,
//   the brief says what it is — an AI-written brief — and links nothing.
// - The model is explicitly instructed to write briefs, not to impersonate
//   news outlets. Output is parsed defensively; unparseable output yields
//   zero posts rather than garbage posts.
// ============================================================================

import {
  QuantyFeedService,
  FEED_PROVENANCE_AGENT_BRIEF,
  type FeedPrisma,
} from './quanty-feed.service';

export interface FeedInferRequest {
  prompt: string;
  userId: string;
  app: string;
  feature: string;
}

export interface FeedInferResponse {
  content: string;
}

export type FeedInferFn = (request: FeedInferRequest) => Promise<FeedInferResponse>;

export interface GeneratedBrief {
  title: string;
  excerpt: string;
  emoji?: string;
}

export interface FeedGenerationResult {
  userId: string;
  briefsRequested: number;
  postsCreated: number;
  skipped: number;
}

const MAX_BRIEFS_PER_RUN = 5;
const DEFAULT_PROMPT =
  'Make me a feed about my interests. Keep the tone clear and direct. Ensure it is quick to skim. Try to avoid clickbait.';

function buildBriefPrompt(instructions: string, count: number): string {
  return [
    'You write short feed briefs for a personal feed. These briefs are ALWAYS',
    'labeled as AI-generated "Quanty briefs" — never present them as news articles,',
    'never invent source URLs, outlet names, quotes, dates, or statistics.',
    'If you do not know something, say so inside the brief rather than inventing it.',
    '',
    'User feed instructions:',
    instructions,
    '',
    `Write ${count} briefs. Respond with ONLY a JSON array, no other text. Each item:`,
    '{"title": "short headline (max 90 chars)", "excerpt": "2-3 sentence summary (max 400 chars)", "emoji": "one relevant emoji"}',
  ].join('\n');
}

/** Defensively parse model output into briefs. Returns [] on any failure. */
export function parseBriefs(raw: string): GeneratedBrief[] {
  if (!raw || typeof raw !== 'string') return [];
  let parsed: unknown;
  try {
    // Tolerate code fences around the JSON.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const briefs: GeneratedBrief[] = [];
  for (const item of parsed.slice(0, MAX_BRIEFS_PER_RUN)) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim().slice(0, 90) : '';
    const excerpt = typeof rec.excerpt === 'string' ? rec.excerpt.trim().slice(0, 400) : '';
    if (!title || !excerpt) continue;
    const emoji = typeof rec.emoji === 'string' ? rec.emoji.trim().slice(0, 8) : undefined;
    briefs.push({ title, excerpt, ...(emoji ? { emoji } : {}) });
  }
  return briefs;
}

export class FeedGeneratorService {
  private readonly feed: QuantyFeedService;

  constructor(
    prisma: FeedPrisma,
    private readonly infer: FeedInferFn,
  ) {
    this.feed = new QuantyFeedService(prisma);
  }

  /**
   * Generate feed posts for a user from their saved instructions.
   * All created posts are provenance 'agent_brief' (honestly labeled).
   */
  async generateForUser(userId: string, briefCount = 3): Promise<FeedGenerationResult> {
    const count = Math.min(MAX_BRIEFS_PER_RUN, Math.max(1, Math.floor(briefCount)));
    const instruction = await this.feed.getInstructions(userId);
    const prompt = instruction?.prompt?.trim() || DEFAULT_PROMPT;

    const response = await this.infer({
      prompt: buildBriefPrompt(prompt, count),
      userId,
      app: 'quantai',
      feature: 'quanty-feed-generation',
    });

    const briefs = parseBriefs(response.content);
    let postsCreated = 0;
    for (const brief of briefs) {
      await this.feed.createPost({
        userId,
        title: brief.title,
        excerpt: brief.excerpt,
        emoji: brief.emoji,
        provenance: FEED_PROVENANCE_AGENT_BRIEF,
      });
      postsCreated += 1;
    }

    return {
      userId,
      briefsRequested: count,
      postsCreated,
      skipped: count - postsCreated,
    };
  }
}
