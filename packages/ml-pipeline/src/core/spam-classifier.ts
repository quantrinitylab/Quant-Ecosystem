// ============================================================================
// ML Pipeline - Spam Classifier (Naive Bayes + TF-IDF)
// ============================================================================

interface ClassStats {
  wordCounts: Map<string, number>;
  totalWords: number;
  documentCount: number;
}

interface ClassificationResult {
  isSpam: boolean;
  probability: number;
  confidence: number;
  features: { name: string; weight: number }[];
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Naive Bayes in pure JS
 * Production path: Use trained ML model via inference service
 */
export class SpamClassifier {
  private classes: Map<string, ClassStats> = new Map();
  private vocabulary: Set<string> = new Set();
  private totalDocuments: number = 0;
  private spamThreshold: number;
  private laplaceSmoothingAlpha: number;
  private truePositives: number = 0;
  private falsePositives: number = 0;
  private trueNegatives: number = 0;
  private falseNegatives: number = 0;
  private featureImportance: Map<string, number> = new Map();
  private charNgramSize: number = 3;
  private maxVocabSize: number = 50000;

  constructor(options: { threshold?: number; smoothingAlpha?: number } = {}) {
    this.spamThreshold = options.threshold ?? 0.5;
    this.laplaceSmoothingAlpha = options.smoothingAlpha ?? 1.0;
    this.classes.set('spam', { wordCounts: new Map(), totalWords: 0, documentCount: 0 });
    this.classes.set('ham', { wordCounts: new Map(), totalWords: 0, documentCount: 0 });
  }

  // Extract features from text
  private extractFeatures(text: string): Map<string, number> {
    const features: Map<string, number> = new Map();
    const lower = text.toLowerCase();
    // Word tokens
    const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
    for (const word of words) {
      features.set(`w:${word}`, (features.get(`w:${word}`) ?? 0) + 1);
    }
    // Character n-grams
    for (let i = 0; i <= lower.length - this.charNgramSize; i++) {
      const ngram = lower.substring(i, i + this.charNgramSize);
      features.set(`c:${ngram}`, (features.get(`c:${ngram}`) ?? 0) + 1);
    }
    // Meta features
    const specialCharRatio = (text.match(/[!@#$%^&*()]/g)?.length ?? 0) / Math.max(text.length, 1);
    features.set('meta:special_ratio', specialCharRatio * 10);
    const urlCount = (text.match(/https?:\/\/|www\./g)?.length ?? 0);
    features.set('meta:url_count', urlCount);
    const capsRatio = (text.match(/[A-Z]/g)?.length ?? 0) / Math.max(text.length, 1);
    features.set('meta:caps_ratio', capsRatio * 10);
    const exclamCount = (text.match(/!/g)?.length ?? 0);
    features.set('meta:exclam_count', exclamCount);
    const digitRatio = (text.match(/\d/g)?.length ?? 0) / Math.max(text.length, 1);
    features.set('meta:digit_ratio', digitRatio * 10);
    // Word length stats
    const avgWordLen = words.reduce((s, w) => s + w.length, 0) / Math.max(words.length, 1);
    features.set('meta:avg_word_len', avgWordLen);
    return features;
  }

  // Train on a single document
  trainOne(text: string, label: 'spam' | 'ham'): void {
    const features = this.extractFeatures(text);
    const classStats = this.classes.get(label)!;
    classStats.documentCount++;
    this.totalDocuments++;
    for (const [feature, count] of features.entries()) {
      classStats.wordCounts.set(feature, (classStats.wordCounts.get(feature) ?? 0) + count);
      classStats.totalWords += count;
      this.vocabulary.add(feature);
    }
    // Trim vocabulary if too large
    if (this.vocabulary.size > this.maxVocabSize) {
      this.pruneVocabulary();
    }
  }

  // Batch training
  train(documents: { text: string; label: 'spam' | 'ham' }[]): void {
    for (const doc of documents) {
      this.trainOne(doc.text, doc.label);
    }
    this.computeFeatureImportance();
  }

  // Online learning: update model with new example
  update(text: string, label: 'spam' | 'ham'): void {
    this.trainOne(text, label);
  }

  // Predict spam probability using Naive Bayes
  predict(text: string): ClassificationResult {
    const features = this.extractFeatures(text);
    const vocabSize = this.vocabulary.size;
    const alpha = this.laplaceSmoothingAlpha;
    let logProbSpam = Math.log(this.getPrior('spam'));
    let logProbHam = Math.log(this.getPrior('ham'));
    const spamStats = this.classes.get('spam')!;
    const hamStats = this.classes.get('ham')!;
    const topFeatures: { name: string; weight: number }[] = [];
    for (const [feature, count] of features.entries()) {
      // Laplace smoothed probability
      const spamCount = (spamStats.wordCounts.get(feature) ?? 0) + alpha;
      const hamCount = (hamStats.wordCounts.get(feature) ?? 0) + alpha;
      const spamDenom = spamStats.totalWords + alpha * vocabSize;
      const hamDenom = hamStats.totalWords + alpha * vocabSize;
      const pFeatureSpam = Math.log(spamCount / spamDenom) * count;
      const pFeatureHam = Math.log(hamCount / hamDenom) * count;
      logProbSpam += pFeatureSpam;
      logProbHam += pFeatureHam;
      const weight = pFeatureSpam - pFeatureHam;
      topFeatures.push({ name: feature, weight });
    }
    // Log-sum-exp for numerical stability
    const maxLog = Math.max(logProbSpam, logProbHam);
    const expSpam = Math.exp(logProbSpam - maxLog);
    const expHam = Math.exp(logProbHam - maxLog);
    const probability = expSpam / (expSpam + expHam);
    topFeatures.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    const confidence = Math.abs(probability - 0.5) * 2;
    return {
      isSpam: probability >= this.spamThreshold,
      probability,
      confidence,
      features: topFeatures.slice(0, 10),
    };
  }

  // Batch classification
  classifyBatch(texts: string[]): ClassificationResult[] {
    return texts.map(text => this.predict(text));
  }

  private getPrior(label: string): number {
    const classStats = this.classes.get(label)!;
    if (this.totalDocuments === 0) return 0.5;
    return classStats.documentCount / this.totalDocuments;
  }

  // Track predictions for accuracy
  trackPrediction(text: string, actualLabel: 'spam' | 'ham'): ClassificationResult {
    const result = this.predict(text);
    if (result.isSpam && actualLabel === 'spam') this.truePositives++;
    else if (result.isSpam && actualLabel === 'ham') this.falsePositives++;
    else if (!result.isSpam && actualLabel === 'ham') this.trueNegatives++;
    else this.falseNegatives++;
    return result;
  }

  // Compute feature importance (log-likelihood ratio)
  private computeFeatureImportance(): void {
    this.featureImportance.clear();
    const spamStats = this.classes.get('spam')!;
    const hamStats = this.classes.get('ham')!;
    const alpha = this.laplaceSmoothingAlpha;
    const vocabSize = this.vocabulary.size;
    for (const feature of this.vocabulary) {
      const spamCount = (spamStats.wordCounts.get(feature) ?? 0) + alpha;
      const hamCount = (hamStats.wordCounts.get(feature) ?? 0) + alpha;
      const spamProb = spamCount / (spamStats.totalWords + alpha * vocabSize);
      const hamProb = hamCount / (hamStats.totalWords + alpha * vocabSize);
      const ratio = Math.log(spamProb / hamProb);
      this.featureImportance.set(feature, ratio);
    }
  }

  getTopSpamIndicators(n: number = 20): { feature: string; score: number }[] {
    return Array.from(this.featureImportance.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([feature, score]) => ({ feature, score }));
  }

  getTopHamIndicators(n: number = 20): { feature: string; score: number }[] {
    return Array.from(this.featureImportance.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, n)
      .map(([feature, score]) => ({ feature, score: -score }));
  }

  getAccuracy(): number {
    const total = this.truePositives + this.falsePositives + this.trueNegatives + this.falseNegatives;
    if (total === 0) return 0;
    return (this.truePositives + this.trueNegatives) / total;
  }

  getPrecision(): number {
    const denom = this.truePositives + this.falsePositives;
    if (denom === 0) return 0;
    return this.truePositives / denom;
  }

  getRecall(): number {
    const denom = this.truePositives + this.falseNegatives;
    if (denom === 0) return 0;
    return this.truePositives / denom;
  }

  getF1Score(): number {
    const p = this.getPrecision();
    const r = this.getRecall();
    if (p + r === 0) return 0;
    return 2 * p * r / (p + r);
  }

  getFalsePositiveRate(): number {
    const denom = this.falsePositives + this.trueNegatives;
    if (denom === 0) return 0;
    return this.falsePositives / denom;
  }

  setThreshold(threshold: number): void {
    this.spamThreshold = threshold;
  }

  getVocabularySize(): number {
    return this.vocabulary.size;
  }

  private pruneVocabulary(): void {
    // Keep only the most frequent features
    const allCounts: { feature: string; count: number }[] = [];
    for (const feature of this.vocabulary) {
      const spamCount = this.classes.get('spam')!.wordCounts.get(feature) ?? 0;
      const hamCount = this.classes.get('ham')!.wordCounts.get(feature) ?? 0;
      allCounts.push({ feature, count: spamCount + hamCount });
    }
    allCounts.sort((a, b) => b.count - a.count);
    const keepSize = Math.floor(this.maxVocabSize * 0.8);
    const toKeep = new Set(allCounts.slice(0, keepSize).map(x => x.feature));
    for (const feature of this.vocabulary) {
      if (!toKeep.has(feature)) {
        this.vocabulary.delete(feature);
        this.classes.get('spam')!.wordCounts.delete(feature);
        this.classes.get('ham')!.wordCounts.delete(feature);
      }
    }
  }

  resetMetrics(): void {
    this.truePositives = 0;
    this.falsePositives = 0;
    this.trueNegatives = 0;
    this.falseNegatives = 0;
  }
}
