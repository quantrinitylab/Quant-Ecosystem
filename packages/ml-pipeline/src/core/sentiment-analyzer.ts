// ============================================================================
// ML Pipeline - Sentiment Analyzer (Lexicon-based with context awareness)
// ============================================================================

import { SentimentResult, SentimentLabel } from '../types';

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Lexicon-based scoring
 * Production path: Use transformer model (e.g. DistilBERT) via ONNX
 */
export class SentimentAnalyzer {
  private positiveLexicon: Map<string, number> = new Map();
  private negativeLexicon: Map<string, number> = new Map();
  private negators: Set<string> = new Set();
  private intensifiers: Map<string, number> = new Map();
  private diminishers: Map<string, number> = new Map();
  private emojiSentiments: Map<string, number> = new Map();
  private comparatives: Map<string, number> = new Map();

  constructor() {
    this.initializeLexicons();
  }

  private initializeLexicons(): void {
    // Positive words with scores (0 to 1)
    const positiveWords: [string, number][] = [
      ['good', 0.6],
      ['great', 0.8],
      ['excellent', 0.9],
      ['amazing', 0.9],
      ['wonderful', 0.85],
      ['fantastic', 0.9],
      ['outstanding', 0.95],
      ['superb', 0.9],
      ['love', 0.8],
      ['happy', 0.7],
      ['best', 0.85],
      ['perfect', 0.95],
      ['beautiful', 0.75],
      ['brilliant', 0.85],
      ['awesome', 0.85],
      ['enjoy', 0.65],
      ['pleased', 0.7],
      ['delighted', 0.8],
      ['impressive', 0.75],
      ['remarkable', 0.8],
      ['positive', 0.6],
      ['success', 0.7],
      ['win', 0.7],
      ['gain', 0.6],
      ['improve', 0.65],
      ['recommend', 0.7],
      ['satisfied', 0.7],
      ['helpful', 0.65],
      ['effective', 0.7],
      ['valuable', 0.7],
      ['exciting', 0.75],
      ['innovative', 0.7],
      ['reliable', 0.65],
      ['friendly', 0.6],
      ['comfortable', 0.6],
      ['convenient', 0.6],
      ['efficient', 0.65],
      ['elegant', 0.7],
      ['fun', 0.65],
      ['generous', 0.7],
    ];
    for (const [word, score] of positiveWords) {
      this.positiveLexicon.set(word, score);
    }
    // Negative words with scores (0 to -1)
    const negativeWords: [string, number][] = [
      ['bad', -0.6],
      ['terrible', -0.9],
      ['horrible', -0.9],
      ['awful', -0.85],
      ['poor', -0.6],
      ['worst', -0.95],
      ['hate', -0.85],
      ['ugly', -0.7],
      ['disgusting', -0.9],
      ['dreadful', -0.85],
      ['fail', -0.7],
      ['failure', -0.75],
      ['useless', -0.8],
      ['disappointing', -0.75],
      ['boring', -0.6],
      ['annoying', -0.65],
      ['frustrating', -0.7],
      ['pathetic', -0.8],
      ['mediocre', -0.5],
      ['inferior', -0.7],
      ['negative', -0.5],
      ['loss', -0.6],
      ['lose', -0.6],
      ['decline', -0.55],
      ['damage', -0.65],
      ['broken', -0.7],
      ['painful', -0.7],
      ['waste', -0.65],
      ['expensive', -0.4],
      ['slow', -0.4],
      ['confusing', -0.55],
      ['complicated', -0.45],
      ['unreliable', -0.7],
      ['rude', -0.7],
      ['unfair', -0.65],
      ['dangerous', -0.7],
      ['weak', -0.55],
      ['error', -0.6],
      ['bug', -0.5],
      ['crash', -0.7],
    ];
    for (const [word, score] of negativeWords) {
      this.negativeLexicon.set(word, score);
    }
    // Negation words
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
    ]);
    // Intensifiers (multiply score)
    const intensifierWords: [string, number][] = [
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
    ];
    for (const [word, mult] of intensifierWords) {
      this.intensifiers.set(word, mult);
    }
    // Diminishers (reduce score)
    const diminisherWords: [string, number][] = [
      ['slightly', 0.5],
      ['somewhat', 0.6],
      ['barely', 0.4],
      ['hardly', 0.3],
      ['a bit', 0.5],
      ['a little', 0.5],
      ['kind of', 0.6],
      ['sort of', 0.6],
    ];
    for (const [word, mult] of diminisherWords) {
      this.diminishers.set(word, mult);
    }
    // Emoji sentiments
    const emojiMap: [string, number][] = [
      [':-)', 0.6],
      [':)', 0.6],
      [':D', 0.8],
      ['<3', 0.7],
      [';)', 0.4],
      [':-(', -0.6],
      [':(', -0.6],
      [':/:', -0.3],
      ['>:(', -0.8],
    ];
    for (const [emoji, score] of emojiMap) {
      this.emojiSentiments.set(emoji, score);
    }
    // Comparatives
    const comparativeWords: [string, number][] = [
      ['better', 0.5],
      ['worse', -0.5],
      ['superior', 0.6],
      ['inferior', -0.6],
      ['improved', 0.5],
      ['degraded', -0.5],
      ['faster', 0.4],
      ['slower', -0.4],
    ];
    for (const [word, score] of comparativeWords) {
      this.comparatives.set(word, score);
    }
  }

  analyze(text: string): SentimentResult {
    const tokens = this.tokenize(text);
    let totalScore = 0;
    let wordCount = 0;
    let negationActive = false;
    let intensifierMult = 1.0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!.toLowerCase();
      // Check for negation
      if (this.negators.has(token)) {
        negationActive = true;
        continue;
      }
      // Check for intensifiers
      if (this.intensifiers.has(token)) {
        intensifierMult = this.intensifiers.get(token)!;
        continue;
      }
      // Check for diminishers
      if (this.diminishers.has(token)) {
        intensifierMult = this.diminishers.get(token)!;
        continue;
      }
      // Score the word
      let wordScore = 0;
      if (this.positiveLexicon.has(token)) {
        wordScore = this.positiveLexicon.get(token)!;
      } else if (this.negativeLexicon.has(token)) {
        wordScore = this.negativeLexicon.get(token)!;
      } else if (this.comparatives.has(token)) {
        wordScore = this.comparatives.get(token)!;
      }
      if (wordScore !== 0) {
        // Apply negation
        if (negationActive) {
          wordScore = -wordScore * 0.8;
          negationActive = false;
        }
        // Apply intensifier/diminisher
        wordScore *= intensifierMult;
        intensifierMult = 1.0;
        totalScore += wordScore;
        wordCount++;
      } else {
        // Reset negation after 3 tokens
        if (negationActive && i > 0) {
          const lastNegIdx = tokens
            .slice(0, i)
            .lastIndexOf(tokens.find((t) => this.negators.has(t.toLowerCase())) ?? '');
          if (i - lastNegIdx > 3) {
            negationActive = false;
          }
        }
      }
    }
    // Check emojis
    for (const [emoji, score] of this.emojiSentiments.entries()) {
      if (text.includes(emoji)) {
        totalScore += score;
        wordCount++;
      }
    }
    // Normalize score to [-1, 1]
    const normalizedScore =
      wordCount > 0 ? Math.max(-1, Math.min(1, totalScore / Math.sqrt(wordCount))) : 0;
    const sentiment: SentimentLabel =
      normalizedScore > 0.1 ? 'positive' : normalizedScore < -0.1 ? 'negative' : 'neutral';
    // Confidence based on how many sentiment words were found
    const coverage = wordCount / Math.max(tokens.length, 1);
    const confidence = Math.min(1, coverage * 3 + Math.abs(normalizedScore) * 0.5);
    return { sentiment, score: normalizedScore, confidence };
  }

  // Aspect-based sentiment analysis
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
          aspectScore > 0.1 ? 'positive' : aspectScore < -0.1 ? 'negative' : 'neutral';
        aspectResults.push({ aspect, sentiment, score: aspectScore });
      }
    }
    return {
      ...baseResult,
      aspects: aspectResults.length > 0 ? aspectResults : undefined,
    };
  }

  // Aggregated sentiment for multiple texts
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
      avgScore > 0.1 ? 'positive' : avgScore < -0.1 ? 'negative' : 'neutral';
    return { sentiment, score: avgScore, confidence: avgConfidence };
  }

  private tokenize(text: string): string[] {
    return text.split(/\s+/).filter((t) => t.length > 0);
  }

  // Add custom words to lexicon
  addPositiveWord(word: string, score: number): void {
    this.positiveLexicon.set(word.toLowerCase(), Math.max(0, Math.min(1, score)));
  }

  addNegativeWord(word: string, score: number): void {
    this.negativeLexicon.set(word.toLowerCase(), Math.max(-1, Math.min(0, score)));
  }

  getLexiconSize(): { positive: number; negative: number } {
    return { positive: this.positiveLexicon.size, negative: this.negativeLexicon.size };
  }
}
