// ============================================================================
// QuantCooks Studio (Phase 2 Unit 1) — pricing table + prompt parsing.
// The Composer's live cost and its structured @-mention / / reference
// exposure both come from these pure modules, so they are pinned here.
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  computeQuote,
  generateButtonLabel,
  DEFAULT_COMPOSER_SETTINGS,
  type ComposerSettings,
} from '../lib/studio/pricing';
import { parsePromptMentions, removeMention, promptHasInput } from '../lib/studio/mentions';

const video = (patch: Partial<ComposerSettings> = {}): ComposerSettings => ({
  ...DEFAULT_COMPOSER_SETTINGS,
  modelId: 'qc-motion-standard',
  resolution: '720p',
  durationSeconds: 5,
  batch: 1,
  stackedExtras: 0,
  ...patch,
});

describe('studio pricing (quote-before-spend)', () => {
  it('prices a standard 5s video run at the base rate', () => {
    const quote = computeQuote('video', video());
    expect(quote.credits).toBe(8);
    expect(quote.modelLabel).toBe('QC Motion');
  });

  it('re-prices live when duration grows past the base duration', () => {
    const longer = computeQuote('video', video({ durationSeconds: 10 }));
    expect(longer.credits).toBe(8 + 5 * 1); // +5s at 1 credit/s
    expect(longer.lines.some((l) => l.includes('+5s'))).toBe(true);
  });

  it('re-prices for resolution and stacked extras', () => {
    const quote = computeQuote('video', video({ resolution: '1080p', stackedExtras: 2 }));
    expect(quote.credits).toBe(Math.round(8 * 1.5) + 2 * 2);
  });

  it('multiplies by batch and never prices below one whole credit', () => {
    expect(computeQuote('video', video({ batch: 3 })).credits).toBe(24);
    const cheap = computeQuote('image', {
      ...DEFAULT_COMPOSER_SETTINGS,
      modelId: 'qc-still-standard',
      resolution: 'Draft',
      durationSeconds: 0,
      batch: 1,
    });
    expect(Number.isInteger(cheap.credits)).toBe(true);
    expect(cheap.credits).toBeGreaterThanOrEqual(1);
  });

  it('button label carries the price, or a dash when there is no input', () => {
    const quote = computeQuote('video', video());
    expect(generateButtonLabel(quote, true)).toBe('Generate · 8 credits');
    expect(generateButtonLabel(quote, false)).toBe('Generate · —');
    expect(generateButtonLabel(null, true)).toBe('Generate · —');
  });
});

describe('prompt mention parsing', () => {
  it('parses @-mentions and / references into structured objects', () => {
    const text = 'Steam over @paneer-tikka tonight, use /festival-menu and @chef-ria';
    const mentions = parsePromptMentions(text);
    expect(mentions.map((m) => [m.kind, m.name])).toEqual([
      ['mention', 'paneer-tikka'],
      ['reference', 'festival-menu'],
      ['mention', 'chef-ria'],
    ]);
    for (const m of mentions) {
      expect(text.slice(m.start, m.end)).toBe(m.raw);
    }
  });

  it('does not turn ratios or slashes inside words into references', () => {
    expect(parsePromptMentions('shoot 16/9, sweet/sour glaze')).toEqual([]);
  });

  it('removes a mention cleanly', () => {
    const text = 'Make @paneer-tikka shine';
    const [mention] = parsePromptMentions(text);
    expect(removeMention(text, mention!)).toBe('Make shine');
  });

  it('promptHasInput ignores whitespace-only prompts', () => {
    expect(promptHasInput('   ')).toBe(false);
    expect(promptHasInput(' hi ')).toBe(true);
  });
});
