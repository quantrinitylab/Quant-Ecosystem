// ============================================================================
// Search - BM25 Ranker
// Complete BM25/BM25+ implementation with tunable parameters
// ============================================================================

import type { BM25Config, SearchResult, IndexDocument } from '../types';

/** Internal document representation for scoring */
interface ScoredDocument {
  id: string;
  fields: Record<string, unknown>;
  fieldLengths: Map<string, number>;
  totalLength: number;
}

/** Term statistics for IDF calculation */
interface TermStats {
  documentFrequency: number;
  totalFrequency: number;
  postings: Map<string, { frequency: number; positions: number[]; field: string }>;
}

/**
 * BM25Ranker - Okapi BM25 ranking algorithm implementation
 *
 * Implements the BM25 (Best Match 25) probabilistic relevance
 * ranking model with configurable k1 and b parameters.
 * Supports BM25+ with delta parameter for better handling of
 * long documents.
 */
export class BM25Ranker {
  private config: BM25Config;
  private documents: Map<string, ScoredDocument>;
  private termIndex: Map<string, TermStats>;
  private averageDocLength: number = 0;
  private fieldBoosts: Map<string, number>;

  constructor(config: Partial<BM25Config> = {}) {
    this.config = {
      k1: config.k1 || 1.2,
      b: config.b || 0.75,
      delta: config.delta || 0,
    };
    this.documents = new Map();
    this.termIndex = new Map();
    this.fieldBoosts = new Map();
  }

  /**
   * Add a document to the ranker's corpus
   */
  public addDocument(document: IndexDocument): void {
    const fieldLengths = new Map<string, number>();
    let totalLength = 0;

    for (const [fieldName, fieldValue] of Object.entries(document.fields)) {
      if (typeof fieldValue !== 'string') continue;

      const tokens = this.tokenize(fieldValue);
      fieldLengths.set(fieldName, tokens.length);
      totalLength += tokens.length;

      // Build term statistics
      const termCounts: Map<string, { count: number; positions: number[] }> = new Map();
      for (let i = 0; i < tokens.length; i++) {
        const term = tokens[i]!;
        const existing = termCounts.get(term) || { count: 0, positions: [] };
        existing.count++;
        existing.positions.push(i);
        termCounts.set(term, existing);
      }

      for (const [term, data] of termCounts) {
        if (!this.termIndex.has(term)) {
          this.termIndex.set(term, {
            documentFrequency: 0,
            totalFrequency: 0,
            postings: new Map(),
          });
        }
        const stats = this.termIndex.get(term)!;
        if (!stats.postings.has(document.id)) {
          stats.documentFrequency++;
        }
        stats.totalFrequency += data.count;
        stats.postings.set(document.id, {
          frequency: data.count,
          positions: data.positions,
          field: fieldName,
        });
      }
    }

    this.documents.set(document.id, {
      id: document.id,
      fields: document.fields,
      fieldLengths,
      totalLength,
    });

    this.updateAverageDocLength();
  }

  /**
   * Remove a document from the corpus
   */
  public removeDocument(documentId: string): boolean {
    if (!this.documents.has(documentId)) return false;

    // Remove from term index
    for (const [term, stats] of this.termIndex) {
      if (stats.postings.has(documentId)) {
        const posting = stats.postings.get(documentId)!;
        stats.totalFrequency -= posting.frequency;
        stats.documentFrequency--;
        stats.postings.delete(documentId);

        if (stats.postings.size === 0) {
          this.termIndex.delete(term);
        }
      }
    }

    this.documents.delete(documentId);
    this.updateAverageDocLength();
    return true;
  }

  /**
   * Score a single document against a query
   */
  public score(query: string, documentId: string): number {
    const doc = this.documents.get(documentId);
    if (!doc) return 0;

    const queryTerms = this.tokenize(query);
    let totalScore = 0;

    for (const term of queryTerms) {
      totalScore += this.scoreTermForDocument(term, doc);
    }

    return totalScore;
  }

  /**
   * Rank all documents against a query
   */
  public rank(
    query: string,
    options: { limit?: number; minScore?: number; explain?: boolean } = {},
  ): SearchResult[] {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const results: SearchResult[] = [];

    for (const [docId, doc] of this.documents) {
      let totalScore = 0;
      const matchedTerms: string[] = [];
      const details: Array<{
        term: string;
        tf: number;
        idf: number;
        fieldBoost: number;
        score: number;
      }> = [];

      for (const term of queryTerms) {
        const termScore = this.scoreTermForDocument(term, doc);
        if (termScore > 0) {
          totalScore += termScore;
          matchedTerms.push(term);

          if (options.explain) {
            const idf = this.calculateIDF(term);
            const tf = this.getTermFrequencyInDoc(term, docId);
            details.push({
              term,
              tf,
              idf,
              fieldBoost: 1.0,
              score: termScore,
            });
          }
        }
      }

      if (totalScore <= 0) continue;
      if (options.minScore && totalScore < options.minScore) continue;

      const result: SearchResult = {
        id: docId,
        score: totalScore,
        document: doc.fields,
        matchedTerms,
      };

      if (options.explain) {
        result.explanation = {
          score: totalScore,
          description: `BM25 score (k1=${this.config.k1}, b=${this.config.b})`,
          details,
        };
      }

      results.push(result);
    }

    results.sort((a, b) => b.score - a.score);

    return options.limit ? results.slice(0, options.limit) : results;
  }

  /**
   * Calculate IDF (Inverse Document Frequency) for a term
   */
  public calculateIDF(term: string): number {
    const N = this.documents.size;
    if (N === 0) return 0;

    const stats = this.termIndex.get(term);
    const df = stats ? stats.documentFrequency : 0;

    // Standard BM25 IDF formula
    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Calculate term frequency component of BM25
   */
  public calculateTF(rawTf: number, docLength: number): number {
    const { k1, b, delta } = this.config;
    const avgDl = this.averageDocLength || 1;

    // BM25 TF normalization
    const numerator = rawTf * (k1 + 1);
    const denominator = rawTf + k1 * (1 - b + b * (docLength / avgDl));

    // BM25+ adds delta to prevent zero scores for very long documents
    return numerator / denominator + (delta || 0);
  }

  /**
   * Set k1 parameter (term frequency saturation)
   * Higher k1 means term frequency has more impact
   * Typical range: 1.2 - 2.0
   */
  public setK1(k1: number): void {
    if (k1 < 0) throw new Error('k1 must be non-negative');
    this.config.k1 = k1;
  }

  /**
   * Set b parameter (document length normalization)
   * b=0: no length normalization
   * b=1: full length normalization
   * Typical: 0.75
   */
  public setB(b: number): void {
    if (b < 0 || b > 1) throw new Error('b must be between 0 and 1');
    this.config.b = b;
  }

  /**
   * Set field boost factor
   */
  public setFieldBoost(fieldName: string, boost: number): void {
    if (boost < 0) throw new Error('Boost must be non-negative');
    this.fieldBoosts.set(fieldName, boost);
  }

  /**
   * Get average document length in the corpus
   */
  public getAverageDocLength(): number {
    return this.averageDocLength;
  }

  /**
   * Get current BM25 parameters
   */
  public getConfig(): BM25Config {
    return { ...this.config };
  }

  /**
   * Get corpus statistics
   */
  public getCorpusStats(): {
    documentCount: number;
    termCount: number;
    averageDocLength: number;
    totalTokens: number;
  } {
    let totalTokens = 0;
    for (const [, doc] of this.documents) {
      totalTokens += doc.totalLength;
    }

    return {
      documentCount: this.documents.size,
      termCount: this.termIndex.size,
      averageDocLength: this.averageDocLength,
      totalTokens,
    };
  }

  /**
   * Get term statistics
   */
  public getTermStats(term: string): { documentFrequency: number; totalFrequency: number } | null {
    const normalized = term.toLowerCase().trim();
    const stats = this.termIndex.get(normalized);
    if (!stats) return null;
    return { documentFrequency: stats.documentFrequency, totalFrequency: stats.totalFrequency };
  }

  /**
   * Compute scores for multiple queries (batch scoring)
   */
  public batchRank(queries: string[], limit: number = 10): Map<string, SearchResult[]> {
    const results = new Map<string, SearchResult[]>();
    for (const query of queries) {
      results.set(query, this.rank(query, { limit }));
    }
    return results;
  }

  // ---- Private Methods ----

  private scoreTermForDocument(term: string, doc: ScoredDocument): number {
    const stats = this.termIndex.get(term);
    if (!stats) return 0;

    const posting = stats.postings.get(doc.id);
    if (!posting) return 0;

    const idf = this.calculateIDF(term);
    const tf = this.calculateTF(posting.frequency, doc.totalLength);
    const fieldBoost = this.fieldBoosts.get(posting.field) || 1.0;

    return idf * tf * fieldBoost;
  }

  private getTermFrequencyInDoc(term: string, docId: string): number {
    const stats = this.termIndex.get(term);
    if (!stats) return 0;
    const posting = stats.postings.get(docId);
    return posting ? posting.frequency : 0;
  }

  private updateAverageDocLength(): void {
    if (this.documents.size === 0) {
      this.averageDocLength = 0;
      return;
    }

    let totalLength = 0;
    for (const [, doc] of this.documents) {
      totalLength += doc.totalLength;
    }
    this.averageDocLength = totalLength / this.documents.size;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }
}
