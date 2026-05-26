// ============================================================================
// Anti-Rage Integration - Wraps AntiRageScorer for feed ranking pipeline
// ============================================================================

import type { RankedItem } from './types.js';

export interface ContentItem {
  text: string;
  quoteRetweetRatio: number;
  capsRatio: number;
  exclamationDensity: number;
  angryReplyRatio: number;
  replyLengthAvg: number;
  replySubstanceScore: number;
}

export interface AntiRageScorerInterface {
  scoreItem(item: ContentItem, baseScore: number): number;
}

/**
 * Default scorer implementation compatible with @quant/recommendations AntiRageScorer.
 * Computes outrage penalty and reply quality boost.
 */
class DefaultAntiRageScorer implements AntiRageScorerInterface {
  private static readonly OUTRAGE_WORDS = [
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

  scoreItem(item: ContentItem, baseScore: number): number {
    const penalty = this.computeOutragePenalty(item);
    const boost = this.computeReplyQualityBoost(item);
    return baseScore * (1 - penalty) * (1 + boost);
  }

  private computeOutragePenalty(item: ContentItem): number {
    const outrageDensity = this.computeOutrageWordDensity(item.text);
    const outrageScore = Math.min(outrageDensity * 3, 0.3);
    const quoteRetweetScore = Math.min(item.quoteRetweetRatio * 0.6, 0.3);
    const capsScore = Math.min(item.capsRatio, 0.1);
    const exclamationScore = Math.min(item.exclamationDensity, 0.1);
    const angryReplyScore = Math.min(item.angryReplyRatio * 0.4, 0.2);
    const total = outrageScore + quoteRetweetScore + capsScore + exclamationScore + angryReplyScore;
    return Math.min(total, 0.6);
  }

  private computeReplyQualityBoost(item: ContentItem): number {
    let boost = 0;
    if (item.replyLengthAvg > 100) {
      boost += Math.min((item.replyLengthAvg - 100) / 500, 0.15);
    }
    if (item.replySubstanceScore > 0.5) {
      boost += (item.replySubstanceScore - 0.5) * 0.3;
    }
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
      if (DefaultAntiRageScorer.OUTRAGE_WORDS.includes(cleaned)) {
        outrageCount++;
      }
    }
    return outrageCount / words.length;
  }
}

export class AntiRageFilter {
  private scorer: AntiRageScorerInterface;

  constructor(scorer?: AntiRageScorerInterface) {
    this.scorer = scorer ?? new DefaultAntiRageScorer();
  }

  applyFilter(items: RankedItem[]): RankedItem[] {
    return items.map((item) => {
      const contentItem = this.toContentItem(item);
      const adjustedScore = this.scorer.scoreItem(contentItem, item.score);
      return {
        ...item,
        score: adjustedScore,
      };
    });
  }

  private toContentItem(item: RankedItem): ContentItem {
    const metadata = item.metadata as Record<string, unknown>;

    return {
      text: item.content,
      quoteRetweetRatio: (metadata['quoteRetweetRatio'] as number) ?? 0,
      capsRatio: this.computeCapsRatio(item.content),
      exclamationDensity: this.computeExclamationDensity(item.content),
      angryReplyRatio: (metadata['angryReplyRatio'] as number) ?? 0,
      replyLengthAvg: (metadata['replyLengthAvg'] as number) ?? 50,
      replySubstanceScore: item.replyQuality,
    };
  }

  private computeCapsRatio(text: string): number {
    if (text.length === 0) return 0;
    const capsCount = text.split('').filter((c) => c >= 'A' && c <= 'Z').length;
    return capsCount / text.length;
  }

  private computeExclamationDensity(text: string): number {
    if (text.length === 0) return 0;
    const exclamationCount = text.split('').filter((c) => c === '!').length;
    return exclamationCount / text.length;
  }
}
