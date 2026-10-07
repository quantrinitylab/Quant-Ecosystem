// ============================================================================
// ML Pipeline - Sentiment Analyzer (VADER-style with AI backend option)
// ============================================================================

import { SentimentResult, SentimentLabel } from '../types';

/** Backend interface for AI-powered sentiment analysis */
export interface SentimentBackend {
  /** Analyze sentiment of text, returning score from -1 to 1 and a label */
  analyze(text: string): Promise<{ score: number; label: SentimentLabel }>;
  /** Whether the backend is available for inference */
  isAvailable(): boolean;
}

/** Options for creating a SentimentAnalyzer */
export interface SentimentAnalyzerOptions {
  /** Optional AI backend for real sentiment analysis (e.g., UnifiedAIService adapter) */
  backend?: SentimentBackend;
}

const VADER_ALPHA = 15;
const NEGATION_DAMPENER = 0.74;
const NEGATION_SCOPE = 3;
const PUNCT_EXCLAMATION_WEIGHT = 0.292;
const PUNCT_QUESTION_WEIGHT = 0.18;
const MAX_QUESTION_MARKS = 3;
const CAPS_BOOST = 0.9;

export class SentimentAnalyzer {
  private valenceDictionary: Map<string, number> = new Map();
  private negators: Set<string> = new Set();
  private degreeModifiers: Map<string, number> = new Map();
  private emojiSentiments: Map<string, number> = new Map();

  private positiveCount: number = 0;
  private negativeCount: number = 0;

  private readonly backend: SentimentBackend | null;

  constructor(options?: SentimentAnalyzerOptions) {
    this.backend = options?.backend ?? null;
    this.initializeLexicons();
  }

  /** Returns true if an AI backend is configured and available */
  hasBackend(): boolean {
    return this.backend !== null && this.backend.isAvailable();
  }

  /**
   * Analyze sentiment using AI backend when available, falling back to lexicon-based.
   * Returns result with a `backend` field indicating the source.
   */
  async analyzeWithBackend(text: string): Promise<SentimentResult & { backend: 'ai' | 'lexicon' }> {
    if (this.backend && this.backend.isAvailable()) {
      try {
        const result = await this.backend.analyze(text);
        const confidence = Math.min(1, Math.abs(result.score) * 0.8 + 0.2);
        return {
          sentiment: result.label,
          score: result.score,
          confidence,
          backend: 'ai',
        };
      } catch {
        // Fall through to lexicon-based on backend error
      }
    }

    const result = this.analyze(text);
    return { ...result, backend: 'lexicon' };
  }

  private initializeLexicons(): void {
    const positiveWords: [string, number][] = [
      ['good', 1.9],
      ['great', 2.7],
      ['excellent', 3.2],
      ['amazing', 3.2],
      ['wonderful', 3.0],
      ['fantastic', 3.1],
      ['outstanding', 3.5],
      ['superb', 3.2],
      ['love', 2.8],
      ['happy', 2.4],
      ['best', 3.0],
      ['perfect', 3.5],
      ['beautiful', 2.6],
      ['brilliant', 3.0],
      ['awesome', 3.0],
      ['enjoy', 2.1],
      ['pleased', 2.4],
      ['delighted', 2.8],
      ['impressive', 2.6],
      ['remarkable', 2.8],
      ['positive', 1.9],
      ['success', 2.4],
      ['win', 2.4],
      ['gain', 1.9],
      ['improve', 2.1],
      ['recommend', 2.4],
      ['satisfied', 2.4],
      ['helpful', 2.1],
      ['effective', 2.4],
      ['valuable', 2.4],
      ['exciting', 2.6],
      ['innovative', 2.4],
      ['reliable', 2.1],
      ['friendly', 1.9],
      ['comfortable', 1.9],
      ['convenient', 1.9],
      ['efficient', 2.1],
      ['elegant', 2.4],
      ['fun', 2.1],
      ['generous', 2.4],
      ['adore', 3.0],
      ['terrific', 3.0],
      ['fabulous', 3.0],
      ['magnificent', 3.2],
      ['splendid', 2.8],
      ['grateful', 2.4],
      ['thankful', 2.2],
      ['proud', 2.4],
      ['optimistic', 2.2],
      ['cheerful', 2.4],
    ];
    for (const [word, score] of positiveWords) {
      this.valenceDictionary.set(word, score);
      this.positiveCount++;
    }

    const negativeWords: [string, number][] = [
      ['bad', -1.9],
      ['terrible', -3.2],
      ['horrible', -3.2],
      ['awful', -3.0],
      ['poor', -1.9],
      ['worst', -3.5],
      ['hate', -3.0],
      ['ugly', -2.4],
      ['disgusting', -3.2],
      ['dreadful', -3.0],
      ['fail', -2.4],
      ['failure', -2.6],
      ['useless', -2.8],
      ['disappointing', -2.6],
      ['boring', -1.9],
      ['annoying', -2.1],
      ['frustrating', -2.4],
      ['pathetic', -2.8],
      ['mediocre', -1.5],
      ['inferior', -2.4],
      ['negative', -1.5],
      ['loss', -1.9],
      ['lose', -1.9],
      ['decline', -1.7],
      ['damage', -2.1],
      ['broken', -2.4],
      ['painful', -2.4],
      ['waste', -2.1],
      ['expensive', -1.2],
      ['slow', -1.2],
      ['confusing', -1.7],
      ['complicated', -1.3],
      ['unreliable', -2.4],
      ['rude', -2.4],
      ['unfair', -2.1],
      ['dangerous', -2.4],
      ['weak', -1.7],
      ['error', -1.9],
      ['bug', -1.5],
      ['crash', -2.4],
      ['abysmal', -3.2],
      ['atrocious', -3.2],
      ['dismal', -2.8],
      ['ghastly', -3.0],
      ['hideous', -2.8],
      ['miserable', -2.8],
      ['repulsive', -3.0],
      ['vile', -3.0],
      ['wretched', -2.8],
      ['loathsome', -3.0],
    ];
    for (const [word, score] of negativeWords) {
      this.valenceDictionary.set(word, score);
      this.negativeCount++;
    }

    this.negators = new Set([
      'not',
      'no',
      'never',
      'neither',
      'nobody',
      'nothing',
      'nowhere',
      'nor',
      'cannot',
      "can't",
      "don't",
      "doesn't",
      "didn't",
      "won't",
      "wouldn't",
      "shouldn't",
      "couldn't",
      "isn't",
      "aren't",
      "wasn't",
      "weren't",
      "haven't",
      "hasn't",
      "hadn't",
      'without',
      'lack',
      'lacking',
    ]);

    const degreeWords: [string, number][] = [
      ['very', 1.5],
      ['extremely', 2.0],
      ['incredibly', 1.8],
      ['absolutely', 2.0],
      ['completely', 1.7],
      ['totally', 1.7],
      ['really', 1.4],
      ['highly', 1.5],
      ['so', 1.3],
      ['truly', 1.5],
      ['deeply', 1.6],
      ['utterly', 1.8],
      ['remarkably', 1.6],
      ['exceptionally', 1.8],
      ['particularly', 1.3],
      ['slightly', 0.5],
      ['somewhat', 0.6],
      ['barely', 0.4],
      ['hardly', 0.3],
      ['kind', 0.6],
      ['sort', 0.6],
      ['most', 1.4],
      ['very much', 1.6],
      ['enormously', 1.8],
      ['immensely', 1.8],
      ['tremendously', 1.7],
      ['fairly', 0.7],
      ['rather', 0.8],
      ['quite', 1.2],
      ['marginally', 0.4],
    ];
    for (const [word, mult] of degreeWords) {
      this.degreeModifiers.set(word, mult);
    }

    const emojiMap: [string, number][] = [
      [':-)', 1.9],
      [':)', 1.9],
      [':D', 2.7],
      ['<3', 2.4],
      [';)', 1.2],
      [':-(', -1.9],
      [':(', -1.9],
      [':/:', -0.9],
      ['>:(', -2.8],
      [':P', 1.2],
      [':p', 1.2],
      ['=)', 1.9],
      ['=D', 2.7],
      ['=(', -1.9],
    ];
    for (const [emoji, score] of emojiMap) {
      this.emojiSentiments.set(emoji, score);
    }
  }

  private normalizeCompound(sum: number): number {
    const norm = sum / Math.sqrt(sum * sum + VADER_ALPHA);
    return Math.max(-1, Math.min(1, norm));
  }

  private isAllCaps(word: string): boolean {
    return word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word);
  }

  private punctuationEmphasis(text: string): number {
    let emphasis = 0;
    const exclamations = (text.match(/!/g) ?? []).length;
    if (exclamations > 0) {
      emphasis += Math.min(exclamations, 4) * PUNCT_EXCLAMATION_WEIGHT;
    }
    const questions = (text.match(/\?/g) ?? []).length;
    if (questions > 1) {
      emphasis += Math.min(questions, MAX_QUESTION_MARKS) * PUNCT_QUESTION_WEIGHT;
    }
    return emphasis;
  }

  private isNegated(tokens: string[], idx: number): boolean {
    for (let i = Math.max(0, idx - NEGATION_SCOPE); i < idx; i++) {
      if (this.negators.has(tokens[i]!.toLowerCase())) return true;
    }
    return false;
  }

  private scalarIncrement(tokens: string[], idx: number): number {
    let scalar = 0;
    if (idx > 0) {
      const prev = tokens[idx - 1]!.toLowerCase();
      const deg = this.degreeModifiers.get(prev);
      if (deg !== undefined) {
        scalar = deg - 1;
        if (idx > 1) {
          const prev2 = tokens[idx - 2]!.toLowerCase();
          const deg2 = this.degreeModifiers.get(prev2);
          if (deg2 !== undefined) {
            scalar *= 0.95;
          }
        }
      }
    }
    if (idx > 1) {
      const prev2 = tokens[idx - 2]!.toLowerCase();
      const deg2 = this.degreeModifiers.get(prev2);
      if (
        deg2 !== undefined &&
        this.degreeModifiers.get(tokens[idx - 1]!.toLowerCase()) === undefined
      ) {
        scalar += (deg2 - 1) * 0.5;
      }
    }
    return scalar;
  }

  private hasConjunctionButContrast(tokens: string[], idx: number): number {
    const contrastWords = new Set([
      'but',
      'however',
      'although',
      'though',
      'yet',
      'despite',
      'except',
    ]);
    for (let i = 0; i < tokens.length; i++) {
      if (contrastWords.has(tokens[i]!.toLowerCase())) {
        if (i < idx) return 0.5;
        if (i > idx) return 1.5;
      }
    }
    return 1.0;
  }

  analyze(text: string): SentimentResult {
    const tokens = this.tokenize(text);
    const sentiments: number[] = [];
    let totalValence = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const lower = token.toLowerCase();

      const valence = this.valenceDictionary.get(lower);
      if (valence === undefined) continue;

      let score = valence;

      const scalar = this.scalarIncrement(tokens, i);
      if (scalar !== 0) {
        if (score > 0) {
          score += scalar;
        } else {
          score -= scalar;
        }
      }

      if (this.isAllCaps(token) && Math.abs(valence) > 0) {
        if (score > 0) {
          score += CAPS_BOOST;
        } else {
          score -= CAPS_BOOST;
        }
      }

      if (this.isNegated(tokens, i)) {
        score = -score * NEGATION_DAMPENER;
      }

      const conjWeight = this.hasConjunctionButContrast(tokens, i);
      score *= conjWeight;

      sentiments.push(score);
      totalValence += score;
    }

    for (const [emoji, score] of this.emojiSentiments.entries()) {
      if (text.includes(emoji)) {
        sentiments.push(score);
        totalValence += score;
      }
    }

    const punctEmph = this.punctuationEmphasis(text);
    if (totalValence > 0) {
      totalValence += punctEmph;
    } else if (totalValence < 0) {
      totalValence -= punctEmph;
    }

    const compound = this.normalizeCompound(totalValence);
    const sentiment: SentimentLabel =
      compound >= 0.05 ? 'positive' : compound <= -0.05 ? 'negative' : 'neutral';

    let posSum = 0,
      negSum = 0,
      neuCount = 0;
    for (const s of sentiments) {
      if (s > 0) posSum += s;
      else if (s < 0) negSum += Math.abs(s);
      else neuCount++;
    }
    const total = posSum + negSum + neuCount;
    const confidence =
      total > 0
        ? Math.min(1, Math.abs(compound) * 0.6 + (Math.max(posSum, negSum) / total) * 0.4)
        : 0;

    return { sentiment, score: compound, confidence };
  }

  analyzeAspects(text: string, aspects: string[]): SentimentResult {
    const baseResult = this.analyze(text);
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const aspectResults: { aspect: string; sentiment: SentimentLabel; score: number }[] = [];
    for (const aspect of aspects) {
      let aspectScore = 0;
      let found = false;
      for (const sentence of sentences) {
        if (sentence.toLowerCase().includes(aspect.toLowerCase())) {
          const sentResult = this.analyze(sentence);
          aspectScore = sentResult.score;
          found = true;
          break;
        }
      }
      if (found) {
        const sentiment: SentimentLabel =
          aspectScore >= 0.05 ? 'positive' : aspectScore <= -0.05 ? 'negative' : 'neutral';
        aspectResults.push({ aspect, sentiment, score: aspectScore });
      }
    }
    return {
      ...baseResult,
      aspects: aspectResults.length > 0 ? aspectResults : undefined,
    };
  }

  aggregateSentiment(texts: string[]): SentimentResult {
    let totalScore = 0;
    let totalConfidence = 0;
    for (const text of texts) {
      const result = this.analyze(text);
      totalScore += result.score;
      totalConfidence += result.confidence;
    }
    const avgScore = totalScore / Math.max(texts.length, 1);
    const avgConfidence = totalConfidence / Math.max(texts.length, 1);
    const sentiment: SentimentLabel =
      avgScore >= 0.05 ? 'positive' : avgScore <= -0.05 ? 'negative' : 'neutral';
    return { sentiment, score: avgScore, confidence: avgConfidence };
  }

  private tokenize(text: string): string[] {
    return text.split(/\s+/).filter((t) => t.length > 0);
  }

  addPositiveWord(word: string, score: number): void {
    const clamped = Math.max(0, Math.min(1, score));
    const vaderScore = clamped * 4;
    this.valenceDictionary.set(word.toLowerCase(), vaderScore);
    this.positiveCount++;
  }

  addNegativeWord(word: string, score: number): void {
    const clamped = Math.max(-1, Math.min(0, score));
    const vaderScore = clamped * 4;
    this.valenceDictionary.set(word.toLowerCase(), vaderScore);
    this.negativeCount++;
  }

  getLexiconSize(): { positive: number; negative: number } {
    return { positive: this.positiveCount, negative: this.negativeCount };
  }
}
