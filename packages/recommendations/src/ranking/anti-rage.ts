// ============================================================================
// Anti-Rage Scorer - Penalizes rage-bait content, boosts quality
// ============================================================================

export interface ContentItem {
  text: string;
  quoteRetweetRatio: number;
  capsRatio: number;
  exclamationDensity: number;
  angryReplyRatio: number;
  replyLengthAvg: number;
  replySubstanceScore: number;
}

const OUTRAGE_WORDS = [
  'outrageous',
  'disgusting',
  'shameful',
  'unbelievable',
  'shocking',
  'appalling',
  'infuriating',
  'enraging',
  'despicable',
  'vile',
  'abhorrent',
  'atrocious',
  'horrendous',
  'unconscionable',
  'reprehensible',
  'deplorable',
  'scandalous',
  'monstrous',
  'hideous',
  'grotesque',
];

export class AntiRageScorer {
  computeOutragePenalty(item: ContentItem): number {
    // Each component contributes to the total penalty
    // outrage word density (0-0.3)
    const outrageDensity = this.computeOutrageWordDensity(item.text);
    const outrageScore = Math.min(outrageDensity * 3, 0.3);

    // inflammatory quote-retweet ratio (0-0.3)
    const quoteRetweetScore = Math.min(item.quoteRetweetRatio * 0.6, 0.3);

    // ALL CAPS ratio (0-0.1)
    const capsScore = Math.min(item.capsRatio, 0.1);

    // exclamation density (0-0.1)
    const exclamationScore = Math.min(item.exclamationDensity, 0.1);

    // angry reply ratio (0-0.2)
    const angryReplyScore = Math.min(item.angryReplyRatio * 0.4, 0.2);

    // Total penalty capped at 0.6 (max 60% score reduction)
    const total = outrageScore + quoteRetweetScore + capsScore + exclamationScore + angryReplyScore;
    return Math.min(total, 0.6);
  }

  computeReplyQualityBoost(item: ContentItem): number {
    // Boost content with high-quality thoughtful replies
    let boost = 0;

    // Longer average replies indicate thoughtful discussion
    if (item.replyLengthAvg > 100) {
      boost += Math.min((item.replyLengthAvg - 100) / 500, 0.15);
    }

    // High substance score (coherent, on-topic replies)
    if (item.replySubstanceScore > 0.5) {
      boost += (item.replySubstanceScore - 0.5) * 0.3;
    }

    // Low angry reply ratio is a positive signal
    if (item.angryReplyRatio < 0.1) {
      boost += 0.05;
    }

    return Math.min(boost, 0.3);
  }

  private computeOutrageWordDensity(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    if (words.length === 0) return 0;

    let outrageCount = 0;
    for (const word of words) {
      const cleaned = word.replace(/[^a-z]/g, '');
      if (OUTRAGE_WORDS.includes(cleaned)) {
        outrageCount++;
      }
    }

    return outrageCount / words.length;
  }

  scoreItem(item: ContentItem, baseScore: number): number {
    const penalty = this.computeOutragePenalty(item);
    const boost = this.computeReplyQualityBoost(item);
    return baseScore * (1 - penalty) * (1 + boost);
  }
}
