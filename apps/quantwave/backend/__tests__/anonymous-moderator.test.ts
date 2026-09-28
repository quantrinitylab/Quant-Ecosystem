import { describe, it, expect } from 'vitest';
import type { ModerationAPIClient, TextModerationResponse } from '@quant/moderation';
import { EngineAnonymousModerator } from '../services/anonymous-moderator';

function response(
  over: Partial<
    Record<
      'hate' | 'harassment' | 'selfHarm' | 'sexual' | 'violence',
      { flagged: boolean; score: number }
    >
  > = {},
): TextModerationResponse {
  const clean = { flagged: false, score: 0 };
  return {
    hate: over.hate ?? clean,
    harassment: over.harassment ?? clean,
    selfHarm: over.selfHarm ?? clean,
    sexual: over.sexual ?? clean,
    violence: over.violence ?? clean,
  } as TextModerationResponse;
}

function client(resp: TextModerationResponse): ModerationAPIClient {
  return { moderateText: async () => resp };
}

function throwingClient(): ModerationAPIClient {
  return {
    moderateText: async () => {
      throw new Error('provider down');
    },
  };
}

describe('EngineAnonymousModerator', () => {
  it('blocks empty and over-length content', async () => {
    const mod = new EngineAnonymousModerator({ apiClient: client(response()) });
    expect((await mod.check('   ')).allowed).toBe(false);
    expect((await mod.check('a'.repeat(50001))).allowed).toBe(false);
  });

  it('blocks hard-denylist markers even with no provider', async () => {
    const mod = new EngineAnonymousModerator();
    const verdict = await mod.check('this is csam content');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/policy/i);
  });

  it('allows clean content when no provider configured (non-strict)', async () => {
    const mod = new EngineAnonymousModerator();
    expect((await mod.check('hello world, a normal post')).allowed).toBe(true);
  });

  it('blocks everything when strict and no provider configured (fail-closed)', async () => {
    const mod = new EngineAnonymousModerator({ strict: true });
    const verdict = await mod.check('hello world, a normal post');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/unavailable/i);
  });

  it('blocks high-confidence harmful content via the ML engine', async () => {
    const mod = new EngineAnonymousModerator({
      apiClient: client(response({ hate: { flagged: true, score: 0.95 } })),
    });
    const verdict = await mod.check('a hateful message');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/flagged/i);
  });

  it('allows clean content scored by the ML engine', async () => {
    const mod = new EngineAnonymousModerator({ apiClient: client(response()) });
    expect((await mod.check('a perfectly nice message')).allowed).toBe(true);
  });

  it('fails closed when the provider throws', async () => {
    const mod = new EngineAnonymousModerator({ apiClient: throwingClient() });
    const verdict = await mod.check('a normal message');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/failed/i);
  });
});
