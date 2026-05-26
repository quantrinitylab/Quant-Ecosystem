import { describe, it, expect } from 'vitest';
import { AntiRageScorer, ContentItem } from '../ranking/anti-rage';

describe('AntiRageScorer', () => {
  const scorer = new AntiRageScorer();

  function makeRageBait(): ContentItem {
    return {
      text: 'This is OUTRAGEOUS and DISGUSTING! How can anyone support this APPALLING behavior?! SHOCKING!!!',
      quoteRetweetRatio: 0.8,
      capsRatio: 0.3,
      exclamationDensity: 0.3,
      angryReplyRatio: 0.7,
      replyLengthAvg: 20,
      replySubstanceScore: 0.1,
    };
  }

  function makeQualityContent(): ContentItem {
    return {
      text: 'Here is a thoughtful analysis of the current economic situation with data and nuance.',
      quoteRetweetRatio: 0.1,
      capsRatio: 0.0,
      exclamationDensity: 0.0,
      angryReplyRatio: 0.05,
      replyLengthAvg: 250,
      replySubstanceScore: 0.8,
    };
  }

  it('should penalize rage-bait content (max 60% reduction)', () => {
    const rageBait = makeRageBait();
    const penalty = scorer.computeOutragePenalty(rageBait);

    // Penalty should be significant
    expect(penalty).toBeGreaterThan(0.3);
    // But capped at 0.6
    expect(penalty).toBeLessThanOrEqual(0.6);
  });

  it('should not penalize quality content', () => {
    const quality = makeQualityContent();
    const penalty = scorer.computeOutragePenalty(quality);

    // Quality content should have minimal penalty
    expect(penalty).toBeLessThan(0.1);
  });

  it('should cap penalty at 60%', () => {
    // Extreme rage-bait with max values
    const extreme: ContentItem = {
      text: 'outrageous disgusting shameful unbelievable shocking appalling infuriating enraging despicable vile',
      quoteRetweetRatio: 1.0,
      capsRatio: 1.0,
      exclamationDensity: 1.0,
      angryReplyRatio: 1.0,
      replyLengthAvg: 5,
      replySubstanceScore: 0,
    };

    const penalty = scorer.computeOutragePenalty(extreme);
    expect(penalty).toBe(0.6);
  });

  it('should boost quality content with thoughtful replies', () => {
    const quality = makeQualityContent();
    const boost = scorer.computeReplyQualityBoost(quality);

    expect(boost).toBeGreaterThan(0);
    expect(boost).toBeLessThanOrEqual(0.3);
  });

  it('should not boost rage-bait replies', () => {
    const rageBait = makeRageBait();
    const boost = scorer.computeReplyQualityBoost(rageBait);

    // Low quality replies should get minimal/no boost
    expect(boost).toBeLessThan(0.05);
  });

  it('should rank rage-bait LOWER despite higher click-through', () => {
    const rageBait = makeRageBait();
    const quality = makeQualityContent();

    // Rage-bait has higher base click-through rate
    const rageBaitCTR = 0.8;
    const qualityCTR = 0.4;

    // But after anti-rage scoring...
    const rageBaitFinalScore = scorer.scoreItem(rageBait, rageBaitCTR);
    const qualityFinalScore = scorer.scoreItem(quality, qualityCTR);

    // Quality content should rank HIGHER
    expect(qualityFinalScore).toBeGreaterThan(rageBaitFinalScore);
  });

  it('should compute penalty components correctly', () => {
    // Item with only high caps ratio
    const capsOnly: ContentItem = {
      text: 'A normal sentence without outrage words.',
      quoteRetweetRatio: 0,
      capsRatio: 0.1,
      exclamationDensity: 0,
      angryReplyRatio: 0,
      replyLengthAvg: 100,
      replySubstanceScore: 0.5,
    };

    const penalty = scorer.computeOutragePenalty(capsOnly);
    // Should only have caps contribution (0-0.1)
    expect(penalty).toBeGreaterThanOrEqual(0);
    expect(penalty).toBeLessThanOrEqual(0.1);
  });

  it('should handle empty text gracefully', () => {
    const emptyText: ContentItem = {
      text: '',
      quoteRetweetRatio: 0,
      capsRatio: 0,
      exclamationDensity: 0,
      angryReplyRatio: 0,
      replyLengthAvg: 0,
      replySubstanceScore: 0,
    };

    const penalty = scorer.computeOutragePenalty(emptyText);
    expect(penalty).toBe(0);
  });
});
