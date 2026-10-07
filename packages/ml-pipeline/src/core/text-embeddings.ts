// ============================================================================
// ML Pipeline - Text Embedding Engine
// ============================================================================

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: TF-IDF or random projections
 * Production path: Use sentence-transformers or OpenAI embeddings API
 */
export class TextEmbeddingEngine {
  private vocabulary: Map<string, number> = new Map();
  private wordVectors: Map<string, number[]> = new Map();
  private wordFrequencies: Map<string, number> = new Map();
  private documentCount: number = 0;
  private documentFrequency: Map<string, number> = new Map();
  private embeddingDim: number;
  private minCount: number;
  private windowSize: number;

  constructor(options: { embeddingDim?: number; minCount?: number; windowSize?: number } = {}) {
    this.embeddingDim = options.embeddingDim ?? 100;
    this.minCount = options.minCount ?? 2;
    this.windowSize = options.windowSize ?? 5;
  }

  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  buildVocabulary(documents: string[]): void {
    this.wordFrequencies.clear();
    this.documentFrequency.clear();
    this.documentCount = documents.length;
    for (const doc of documents) {
      const tokens = this.tokenize(doc);
      const uniqueTokens = new Set(tokens);
      for (const token of tokens) {
        this.wordFrequencies.set(token, (this.wordFrequencies.get(token) ?? 0) + 1);
      }
      for (const token of uniqueTokens) {
        this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
      }
    }
    // Build vocabulary (filter by min count)
    this.vocabulary.clear();
    let idx = 0;
    const sorted = Array.from(this.wordFrequencies.entries())
      .filter(([, count]) => count >= this.minCount)
      .sort((a, b) => b[1] - a[1]);
    for (const [word] of sorted) {
      this.vocabulary.set(word, idx++);
    }
  }

  // Skip-gram inspired training: learn word vectors from co-occurrence
  trainEmbeddings(documents: string[], epochs: number = 5, learningRate: number = 0.025): void {
    this.buildVocabulary(documents);
    // Initialize random vectors
    for (const [word] of this.vocabulary.entries()) {
      const vec = new Array(this.embeddingDim)
        .fill(0)
        .map(() => (Math.random() - 0.5) / this.embeddingDim);
      this.wordVectors.set(word, vec);
    }
    // Context vectors for negative sampling
    const contextVectors: Map<string, number[]> = new Map();
    for (const [word] of this.vocabulary.entries()) {
      contextVectors.set(
        word,
        new Array(this.embeddingDim).fill(0).map(() => (Math.random() - 0.5) / this.embeddingDim),
      );
    }
    const vocabWords = Array.from(this.vocabulary.keys());
    const numNegSamples = 5;
    for (let epoch = 0; epoch < epochs; epoch++) {
      const lr = learningRate * (1 - epoch / epochs);
      for (const doc of documents) {
        const tokens = this.tokenize(doc).filter((t) => this.vocabulary.has(t));
        for (let i = 0; i < tokens.length; i++) {
          const centerWord = tokens[i]!;
          const centerVec = this.wordVectors.get(centerWord)!;
          // Positive pairs within window
          const windowStart = Math.max(0, i - this.windowSize);
          const windowEnd = Math.min(tokens.length - 1, i + this.windowSize);
          for (let j = windowStart; j <= windowEnd; j++) {
            if (j === i) continue;
            const contextWord = tokens[j]!;
            const ctxVec = contextVectors.get(contextWord)!;
            // Positive sample: sigmoid(dot product) should be 1
            const dot = this.dotProduct(centerVec, ctxVec);
            const sigmoid = 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, dot))));
            const gradPos = (1 - sigmoid) * lr;
            for (let d = 0; d < this.embeddingDim; d++) {
              centerVec[d]! += gradPos * ctxVec[d]!;
              ctxVec[d]! += gradPos * centerVec[d]!;
            }
            // Negative samples
            for (let n = 0; n < numNegSamples; n++) {
              const negWord = vocabWords[Math.floor(Math.random() * vocabWords.length)]!;
              if (negWord === contextWord) continue;
              const negVec = contextVectors.get(negWord)!;
              const negDot = this.dotProduct(centerVec, negVec);
              const negSigmoid = 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, negDot))));
              const gradNeg = -negSigmoid * lr;
              for (let d = 0; d < this.embeddingDim; d++) {
                centerVec[d]! += gradNeg * negVec[d]!;
                negVec[d]! += gradNeg * centerVec[d]!;
              }
            }
          }
        }
      }
    }
  }

  private dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i]! * b[i]!;
    }
    return sum;
  }

  getWordVector(word: string): number[] | null {
    return this.wordVectors.get(word.toLowerCase()) ?? null;
  }

  // Sentence embedding: average of word vectors
  getSentenceEmbedding(text: string): number[] {
    const tokens = this.tokenize(text);
    const embedding = new Array(this.embeddingDim).fill(0);
    let count = 0;
    for (const token of tokens) {
      const vec = this.wordVectors.get(token);
      if (vec) {
        for (let i = 0; i < this.embeddingDim; i++) {
          embedding[i] += vec[i];
        }
        count++;
      }
    }
    if (count > 0) {
      for (let i = 0; i < this.embeddingDim; i++) {
        embedding[i] /= count;
      }
    }
    return embedding;
  }

  // TF-IDF computation
  computeTFIDF(document: string): Map<string, number> {
    const tokens = this.tokenize(document);
    const tf: Map<string, number> = new Map();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    const tfidf: Map<string, number> = new Map();
    for (const [term, freq] of tf.entries()) {
      const termFreq = freq / tokens.length;
      const df = this.documentFrequency.get(term) ?? 1;
      const idf = Math.log((this.documentCount + 1) / (df + 1)) + 1;
      tfidf.set(term, termFreq * idf);
    }
    return tfidf;
  }

  // Document vectorization using TF-IDF weights
  vectorizeDocument(document: string): number[] {
    const tfidf = this.computeTFIDF(document);
    const vector = new Array(this.embeddingDim).fill(0);
    let totalWeight = 0;
    for (const [term, weight] of tfidf.entries()) {
      const wordVec = this.wordVectors.get(term);
      if (wordVec) {
        for (let i = 0; i < this.embeddingDim; i++) {
          vector[i]! += wordVec[i]! * weight;
        }
        totalWeight += weight;
      }
    }
    if (totalWeight > 0) {
      for (let i = 0; i < this.embeddingDim; i++) {
        vector[i]! /= totalWeight;
      }
    }
    return vector;
  }

  // Text similarity using sentence embeddings
  textSimilarity(textA: string, textB: string): number {
    const embA = this.getSentenceEmbedding(textA);
    const embB = this.getSentenceEmbedding(textB);
    return this.cosineSimilarity(embA, embB);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;
    return dot / denom;
  }

  getVocabularySize(): number {
    return this.vocabulary.size;
  }

  hasWord(word: string): boolean {
    return this.vocabulary.has(word.toLowerCase());
  }

  getMostSimilarWords(word: string, topK: number = 10): { word: string; score: number }[] {
    const vec = this.wordVectors.get(word.toLowerCase());
    if (!vec) return [];
    const results: { word: string; score: number }[] = [];
    for (const [w, wVec] of this.wordVectors.entries()) {
      if (w === word.toLowerCase()) continue;
      const sim = this.cosineSimilarity(vec, wVec);
      results.push({ word: w, score: sim });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  // Serialize vocabulary for persistence
  serializeVocabulary(): { vocab: [string, number][]; vectors: [string, number[]][] } {
    return {
      vocab: Array.from(this.vocabulary.entries()),
      vectors: Array.from(this.wordVectors.entries()),
    };
  }

  deserializeVocabulary(data: { vocab: [string, number][]; vectors: [string, number[]][] }): void {
    this.vocabulary = new Map(data.vocab);
    this.wordVectors = new Map(data.vectors);
    this.embeddingDim = data.vectors[0]?.[1]?.length ?? this.embeddingDim;
  }

  getWordFrequency(word: string): number {
    return this.wordFrequencies.get(word.toLowerCase()) ?? 0;
  }

  getTopWords(n: number = 100): { word: string; frequency: number }[] {
    return Array.from(this.wordFrequencies.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([word, frequency]) => ({ word, frequency }));
  }
}
