import { ContentItem } from '../models/content-item';
import { ModerationResult } from '../models/moderation-result';

export class ModerationEngine {
  private bannedWords: Set<string> = new Set([
    'spam',
    'scam',
    'hate',
    'violence',
    'illegal',
    // Add more banned words
  ]);

  private toxicPatterns: RegExp[] = [
    /\b(hate|kill|die|stupid|idiot)\b/i,
    /\b(fuck|shit|asshole)\b/i,
    // Add more patterns
  ];

  async moderateContent(content: ContentItem): Promise<ModerationResult> {
    const text = `${content.title} ${content.description || ''}`.toLowerCase();

    let toxicityScore = 0;
    const flags: string[] = [];

    // Check banned words
    for (const word of this.bannedWords) {
      if (text.includes(word)) {
        toxicityScore += 0.3;
        flags.push(`banned_word:${word}`);
      }
    }

    // Check toxic patterns
    for (const pattern of this.toxicPatterns) {
      if (pattern.test(text)) {
        toxicityScore += 0.2;
        flags.push('toxic_pattern');
      }
    }

    // Check for spam patterns
    if (this.isSpam(text)) {
      toxicityScore += 0.4;
      flags.push('spam');
    }

    const isApproved = toxicityScore < 0.5;
    const confidence = Math.max(0.6, 1 - toxicityScore);

    const result: ModerationResult = {
      contentId: content.id,
      isApproved,
      toxicityScore: Math.min(toxicityScore, 1),
      confidence,
      flags,
      reviewedAt: new Date(),
      reviewer: 'ai_moderator',
    };

    return result;
  }

  private isSpam(text: string): boolean {
    // Simple spam detection
    const urlCount = (text.match(/https?:\/\//g) || []).length;
    const repeatedChars = /(.)\1{4,}/g.test(text);
    const excessiveCaps = (text.match(/[A-Z]/g) || []).length > text.length * 0.7;

    return urlCount > 2 || repeatedChars || excessiveCaps;
  }

  async batchModerate(contents: ContentItem[]): Promise<ModerationResult[]> {
    return Promise.all(contents.map((content) => this.moderateContent(content)));
  }

  addBannedWord(word: string) {
    this.bannedWords.add(word.toLowerCase());
  }

  removeBannedWord(word: string) {
    this.bannedWords.delete(word.toLowerCase());
  }
}

export const moderationEngine = new ModerationEngine();
