// Feed generator tests (Q8).
// Covers: briefs from instructions, default prompt fallback, honest
// provenance on every generated post, and defensive parsing of model output.
import { describe, it, expect, vi } from 'vitest';
import {
  FeedGeneratorService,
  parseBriefs,
  type FeedInferFn,
} from '../services/feed-generator.service';
import { FEED_PROVENANCE_AGENT_BRIEF } from '../services/quanty-feed.service';

function createMockPrisma(instructionPrompt: string | null) {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    feedInstruction: {
      findUnique: vi.fn().mockResolvedValue(
        instructionPrompt === null
          ? null
          : { id: 'i1', userId: 'u1', prompt: instructionPrompt, createdAt: new Date(), updatedAt: new Date() },
      ),
      upsert: vi.fn(),
    },
    feedPost: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn().mockImplementation(async (args: { data: Record<string, unknown> }) => {
        const row = { id: `p${created.length + 1}`, createdAt: new Date(), ...args.data };
        created.push(row);
        return row;
      }),
      findUnique: vi.fn(),
    },
    feedReaction: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

const briefsJson = JSON.stringify([
  { title: 'AI chips get cheaper', excerpt: 'New fabrication methods cut costs.', emoji: '💡' },
  { title: 'Open models advance', excerpt: 'Community models close the gap.', emoji: '🤖' },
]);

describe('parseBriefs', () => {
  it('parses a JSON array of briefs', () => {
    expect(parseBriefs(briefsJson)).toHaveLength(2);
  });

  it('tolerates markdown code fences', () => {
    expect(parseBriefs('```json\n' + briefsJson + '\n```')).toHaveLength(2);
  });

  it('returns [] for garbage output instead of fabricating posts', () => {
    expect(parseBriefs('not json at all')).toEqual([]);
    expect(parseBriefs('')).toEqual([]);
    expect(parseBriefs('{"title": "not an array"}')).toEqual([]);
  });

  it('drops items missing title/excerpt and truncates long fields', () => {
    const raw = JSON.stringify([
      { title: '', excerpt: 'x' },
      { title: 'T', excerpt: '' },
      { title: 'x'.repeat(200), excerpt: 'y'.repeat(900), emoji: '💡' },
    ]);
    const briefs = parseBriefs(raw);
    expect(briefs).toHaveLength(1);
    expect(briefs[0].title.length).toBeLessThanOrEqual(90);
    expect(briefs[0].excerpt.length).toBeLessThanOrEqual(400);
  });
});

describe('FeedGeneratorService', () => {
  it('generates briefs from the user instructions', async () => {
    const prisma = createMockPrisma('Write about AI chips.');
    const infer: FeedInferFn = vi.fn().mockResolvedValue({ content: briefsJson });
    const gen = new FeedGeneratorService(prisma as never, infer);

    const result = await gen.generateForUser('u1', 2);

    expect(infer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', app: 'quantai', feature: 'quanty-feed-generation' }),
    );
    // The instruction prompt reaches the model.
    expect((infer as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt).toContain('AI chips');
    expect(result.postsCreated).toBe(2);
    expect(result.skipped).toBe(0);
    expect(prisma.created).toHaveLength(2);
  });

  it('marks every generated post as agent_brief (honest provenance)', async () => {
    const prisma = createMockPrisma('Anything.');
    const infer: FeedInferFn = vi.fn().mockResolvedValue({ content: briefsJson });
    const gen = new FeedGeneratorService(prisma as never, infer);

    await gen.generateForUser('u1', 2);

    for (const row of prisma.created) {
      expect(row['provenance']).toBe(FEED_PROVENANCE_AGENT_BRIEF);
      // Never invents external sources.
      expect(row['sourceUrl']).toBeNull();
      expect(row['sourceName']).toBeNull();
    }
  });

  it('falls back to a default prompt when the user has no instructions', async () => {
    const prisma = createMockPrisma(null);
    const infer: FeedInferFn = vi.fn().mockResolvedValue({ content: briefsJson });
    const gen = new FeedGeneratorService(prisma as never, infer);

    const result = await gen.generateForUser('u1', 2);
    const sentPrompt = (infer as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt as string;
    expect(sentPrompt).toContain('Make me a feed about my interests');
    expect(result.postsCreated).toBe(2);
  });

  it('creates zero posts (not garbage) when the model output is unparseable', async () => {
    const prisma = createMockPrisma('Anything.');
    const infer: FeedInferFn = vi.fn().mockResolvedValue({ content: 'sorry, no json today' });
    const gen = new FeedGeneratorService(prisma as never, infer);

    const result = await gen.generateForUser('u1', 3);
    expect(result.postsCreated).toBe(0);
    expect(result.skipped).toBe(3);
    expect(prisma.created).toHaveLength(0);
  });

  it('caps briefs per run', async () => {
    const prisma = createMockPrisma('Anything.');
    const infer: FeedInferFn = vi.fn().mockResolvedValue({ content: briefsJson });
    const gen = new FeedGeneratorService(prisma as never, infer);

    await gen.generateForUser('u1', 100);
    const sentPrompt = (infer as ReturnType<typeof vi.fn>).mock.calls[0][0].prompt as string;
    expect(sentPrompt).toContain('Write 5 briefs');
  });
});
