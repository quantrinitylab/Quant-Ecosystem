// ============================================================================
// ML Pipeline - Spam Classifier (TF-IDF + Logistic Regression with ONNX backend)
// ============================================================================

/** Backend interface for ML model inference (e.g., ONNX via ModelLoader) */
export interface SpamModelBackend {
  /** Run inference on text features, returning spam probability */
  predict(features: number[]): Promise<number>;
  /** Whether the backend is ready for inference */
  isReady(): boolean;
}

/** Options for configuring the SpamClassifier */
export interface SpamClassifierOptions {
  threshold?: number;
  smoothingAlpha?: number;
  /** Optional ONNX or external model backend for real inference */
  modelBackend?: SpamModelBackend;
}

/** Result of spam classification with confidence scoring */
export interface SpamClassificationResult {
  isSpam: boolean;
  probability: number;
  confidence: number;
  features: { name: string; weight: number }[];
  backend: 'model' | 'naive';
}

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

export class SpamClassifier {
  private classes: Map<string, ClassStats> = new Map();
  private vocabulary: Set<string> = new Set();
  private totalDocuments: number = 0;
  private spamThreshold: number;
  private truePositives: number = 0;
  private falsePositives: number = 0;
  private trueNegatives: number = 0;
  private falseNegatives: number = 0;
  private featureImportance: Map<string, number> = new Map();
  private charNgramSize: number = 3;
  private maxVocabSize: number = 50000;

  private weights: Map<string, number> = new Map();
  private bias: number = 0;
  private idfCache: Map<string, number> = new Map();
  private idfDirty: boolean = true;
  private documentFrequency: Map<string, number> = new Map();
  private learningRate: number = 0.05;
  private l2RegLambda: number = 0.001;
  private trainingExamples: { features: Map<string, number>; label: number }[] = [];

  private readonly modelBackend: SpamModelBackend | null;

  constructor(options: SpamClassifierOptions = {}) {
    this.spamThreshold = options.threshold ?? 0.5;
    this.l2RegLambda = options.smoothingAlpha ?? 0.001;
    this.modelBackend = options.modelBackend ?? null;
    this.classes.set('spam', { wordCounts: new Map(), totalWords: 0, documentCount: 0 });
    this.classes.set('ham', { wordCounts: new Map(), totalWords: 0, documentCount: 0 });
  }

  /** Returns true if a model backend is configured and ready */
  hasModelBackend(): boolean {
    return this.modelBackend !== null && this.modelBackend.isReady();
  }

  private extractFeatures(text: string): Map<string, number> {
    const features: Map<string, number> = new Map();
    const lower = text.toLowerCase();
    const words = lower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);
    for (const word of words) {
      features.set(`w:${word}`, (features.get(`w:${word}`) ?? 0) + 1);
    }
    for (let i = 0; i <= lower.length - this.charNgramSize; i++) {
      const ngram = lower.substring(i, i + this.charNgramSize);
      features.set(`c:${ngram}`, (features.get(`c:${ngram}`) ?? 0) + 1);
    }
    const specialCharRatio = (text.match(/[!@#$%^&*()]/g)?.length ?? 0) / Math.max(text.length, 1);
    features.set('meta:special_ratio', specialCharRatio * 10);
    const urlCount = text.match(/https?:\/\/|www\./g)?.length ?? 0;
    features.set('meta:url_count', urlCount);
    const capsRatio = (text.match(/[A-Z]/g)?.length ?? 0) / Math.max(text.length, 1);
    features.set('meta:caps_ratio', capsRatio * 10);
    const exclamCount = text.match(/!/g)?.length ?? 0;
    features.set('meta:exclam_count', exclamCount);
    const digitRatio = (text.match(/\d/g)?.length ?? 0) / Math.max(text.length, 1);
    features.set('meta:digit_ratio', digitRatio * 10);
    const avgWordLen = words.reduce((s, w) => s + w.length, 0) / Math.max(words.length, 1);
    features.set('meta:avg_word_len', avgWordLen);
    return features;
  }

  /** Extract a fixed-size numeric feature vector for model inference */
  private extractNumericFeatures(text: string): number[] {
    const lower = text.toLowerCase();
    const words = lower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    return [
      words.length,
      text.length,
      (text.match(/[!@#$%^&*()]/g)?.length ?? 0) / Math.max(text.length, 1),
      text.match(/https?:\/\/|www\./g)?.length ?? 0,
      (text.match(/[A-Z]/g)?.length ?? 0) / Math.max(text.length, 1),
      text.match(/!/g)?.length ?? 0,
      (text.match(/\d/g)?.length ?? 0) / Math.max(text.length, 1),
      words.reduce((s, w) => s + w.length, 0) / Math.max(words.length, 1),
      text.match(/\$/g)?.length ?? 0,
      text.includes('free') ? 1 : 0,
      text.includes('click') ? 1 : 0,
      text.includes('buy') ? 1 : 0,
    ];
  }

  private computeTF(rawFeatures: Map<string, number>): Map<string, number> {
    const tf: Map<string, number> = new Map();
    let total = 0;
    for (const count of rawFeatures.values()) {
      total += count;
    }
    if (total === 0) return tf;
    for (const [feature, count] of rawFeatures.entries()) {
      tf.set(feature, count / total);
    }
    return tf;
  }

  private recomputeIDF(): void {
    if (!this.idfDirty) return;
    this.idfCache.clear();
    const N = this.totalDocuments;
    if (N === 0) return;
    for (const [feature, df] of this.documentFrequency.entries()) {
      this.idfCache.set(feature, Math.log((N + 1) / (df + 1)) + 1);
    }
    this.idfDirty = false;
  }

  private computeTFIDF(rawFeatures: Map<string, number>): Map<string, number> {
    this.recomputeIDF();
    const tf = this.computeTF(rawFeatures);
    const tfidf: Map<string, number> = new Map();
    for (const [feature, tfVal] of tf.entries()) {
      const idfVal = this.idfCache.get(feature) ?? Math.log((this.totalDocuments + 1) / 1 + 1) + 1;
      tfidf.set(feature, tfVal * idfVal);
    }
    return tfidf;
  }

  private sigmoid(z: number): number {
    if (z >= 0) {
      return 1 / (1 + Math.exp(-z));
    }
    const expZ = Math.exp(z);
    return expZ / (1 + expZ);
  }

  private dotProductCalc(features: Map<string, number>): number {
    let sum = this.bias;
    for (const [feature, value] of features.entries()) {
      const w = this.weights.get(feature) ?? 0;
      sum += w * value;
    }
    return sum;
  }

  private trainSGD(): void {
    if (this.trainingExamples.length === 0) return;
    const epochs = 20;
    const lr = this.learningRate;
    const lambda = this.l2RegLambda;

    for (let epoch = 0; epoch < epochs; epoch++) {
      for (const example of this.trainingExamples) {
        const tfidf = this.computeTFIDF(example.features);
        const z = this.dotProductCalc(tfidf);
        const pred = this.sigmoid(z);
        const error = pred - example.label;

        for (const [feature, value] of tfidf.entries()) {
          const w = this.weights.get(feature) ?? 0;
          const grad = error * value + lambda * w;
          this.weights.set(feature, w - lr * grad);
        }
        this.bias -= lr * error;
      }
    }

    this.featureImportance.clear();
    for (const [feature, weight] of this.weights.entries()) {
      this.featureImportance.set(feature, weight);
    }
  }

  trainOne(text: string, label: 'spam' | 'ham'): void {
    const features = this.extractFeatures(text);
    const classStats = this.classes.get(label)!;
    classStats.documentCount++;
    this.totalDocuments++;

    const docFeatures = new Set(features.keys());
    for (const feature of docFeatures) {
      this.documentFrequency.set(feature, (this.documentFrequency.get(feature) ?? 0) + 1);
    }
    this.idfDirty = true;

    for (const [feature, count] of features.entries()) {
      classStats.wordCounts.set(feature, (classStats.wordCounts.get(feature) ?? 0) + count);
      classStats.totalWords += count;
      this.vocabulary.add(feature);
    }

    this.trainingExamples.push({
      features,
      label: label === 'spam' ? 1 : 0,
    });

    if (this.vocabulary.size > this.maxVocabSize) {
      this.pruneVocabulary();
    }
  }

  train(documents: { text: string; label: 'spam' | 'ham' }[]): void {
    for (const doc of documents) {
      this.trainOne(doc.text, doc.label);
    }
    this.trainSGD();
  }

  update(text: string, label: 'spam' | 'ham'): void {
    this.trainOne(text, label);
    this.trainSGD();
  }

  /**
   * Predict using model backend if available, falling back to naive classifier.
   * Returns an enhanced SpamClassificationResult with backend indication.
   */
  async predictWithBackend(text: string): Promise<SpamClassificationResult> {
    if (this.modelBackend && this.modelBackend.isReady()) {
      try {
        const features = this.extractNumericFeatures(text);
        const probability = await this.modelBackend.predict(features);
        const confidence = Math.abs(probability - 0.5) * 2;
        return {
          isSpam: probability >= this.spamThreshold,
          probability,
          confidence,
          features: [],
          backend: 'model',
        };
      } catch {
        // Fall through to naive classifier on backend error
      }
    }

    const result = this.predict(text);
    return { ...result, backend: 'naive' };
  }

  predict(text: string): ClassificationResult {
    const rawFeatures = this.extractFeatures(text);
    const tfidf = this.computeTFIDF(rawFeatures);
    const priorAdjustment = Math.log(this.getPrior('spam') / Math.max(this.getPrior('ham'), 1e-10));
    const z = this.dotProductCalc(tfidf) + priorAdjustment * 0.1;
    const probability = this.sigmoid(z);

    const topFeatures: { name: string; weight: number }[] = [];
    for (const [feature, value] of tfidf.entries()) {
      const w = this.weights.get(feature) ?? 0;
      topFeatures.push({ name: feature, weight: w * value });
    }
    topFeatures.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
    const confidence = Math.abs(probability - 0.5) * 2;

    return {
      isSpam: probability >= this.spamThreshold,
      probability,
      confidence,
      features: topFeatures.slice(0, 10),
    };
  }

  classifyBatch(texts: string[]): ClassificationResult[] {
    return texts.map((text) => this.predict(text));
  }

  private getPrior(label: string): number {
    const classStats = this.classes.get(label)!;
    if (this.totalDocuments === 0) return 0.5;
    return classStats.documentCount / this.totalDocuments;
  }

  trackPrediction(text: string, actualLabel: 'spam' | 'ham'): ClassificationResult {
    const result = this.predict(text);
    if (result.isSpam && actualLabel === 'spam') this.truePositives++;
    else if (result.isSpam && actualLabel === 'ham') this.falsePositives++;
    else if (!result.isSpam && actualLabel === 'ham') this.trueNegatives++;
    else this.falseNegatives++;
    return result;
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
    const total =
      this.truePositives + this.falsePositives + this.trueNegatives + this.falseNegatives;
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
    return (2 * p * r) / (p + r);
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
    const allCounts: { feature: string; count: number }[] = [];
    for (const feature of this.vocabulary) {
      const spamCount = this.classes.get('spam')!.wordCounts.get(feature) ?? 0;
      const hamCount = this.classes.get('ham')!.wordCounts.get(feature) ?? 0;
      allCounts.push({ feature, count: spamCount + hamCount });
    }
    allCounts.sort((a, b) => b.count - a.count);
    const keepSize = Math.floor(this.maxVocabSize * 0.8);
    const toKeep = new Set(allCounts.slice(0, keepSize).map((x) => x.feature));
    for (const feature of this.vocabulary) {
      if (!toKeep.has(feature)) {
        this.vocabulary.delete(feature);
        this.classes.get('spam')!.wordCounts.delete(feature);
        this.classes.get('ham')!.wordCounts.delete(feature);
        this.weights.delete(feature);
        this.documentFrequency.delete(feature);
      }
    }
    this.idfDirty = true;
  }

  resetMetrics(): void {
    this.truePositives = 0;
    this.falsePositives = 0;
    this.trueNegatives = 0;
    this.falseNegatives = 0;
  }
}
