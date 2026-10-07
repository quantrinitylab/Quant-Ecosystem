// ============================================================================
// Recommendations Package - Content-Based Filtering
// ============================================================================

import type { ContentFilterConfig, ItemProfile, RecommendedItem } from '../types';

/** Content-based filtering using TF-IDF and cosine similarity */
export class ContentBasedFilter {
  private config: ContentFilterConfig;
  private documents: Map<string, Map<string, number>>;
  private idfScores: Map<string, number>;
  private itemProfiles: Map<string, ItemProfile>;
  private userProfiles: Map<string, Map<string, number>>;
  private documentCount: number;

  constructor(config: ContentFilterConfig) {
    this.config = config;
    this.documents = new Map();
    this.idfScores = new Map();
    this.itemProfiles = new Map();
    this.userProfiles = new Map();
    this.documentCount = 0;
  }

  /** Add an item profile to the system */
  addItem(item: ItemProfile): void {
    this.itemProfiles.set(item.id, item);
    const terms = this.extractTerms(item);
    const tfVector = this.computeTF(terms);
    this.documents.set(item.id, tfVector);
    this.documentCount++;
    this.recomputeIDF();
  }

  /** Extract terms from an item profile */
  private extractTerms(item: ItemProfile): string[] {
    const terms: string[] = [];
    // Extract from title
    const titleWords = item.title.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    terms.push(...titleWords);
    // Extract from description
    const descWords = item.description.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    terms.push(...descWords);
    // Extract from tags
    terms.push(...item.tags.map(t => t.toLowerCase()));
    // Extract from category
    terms.push(item.category.toLowerCase());
    return terms;
  }

  /** Compute term frequency for a document */
  private computeTF(terms: string[]): Map<string, number> {
    const termCounts: Map<string, number> = new Map();
    for (const term of terms) {
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    }
    // Normalize by document length
    const maxFreq = Math.max(...termCounts.values(), 1);
    const tfVector: Map<string, number> = new Map();
    for (const [term, count] of termCounts) {
      tfVector.set(term, 0.5 + 0.5 * (count / maxFreq));
    }
    return tfVector;
  }

  /** Recompute inverse document frequency scores */
  private recomputeIDF(): void {
    const documentFrequency: Map<string, number> = new Map();
    for (const tfVector of this.documents.values()) {
      for (const term of tfVector.keys()) {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      }
    }
    this.idfScores.clear();
    for (const [term, df] of documentFrequency) {
      this.idfScores.set(term, Math.log(this.documentCount / (1 + df)) + 1);
    }
  }

  /** Get TF-IDF vector for an item */
  getTFIDFVector(itemId: string): Map<string, number> {
    const tfVector = this.documents.get(itemId);
    if (!tfVector) return new Map();
    const tfidfVector: Map<string, number> = new Map();
    for (const [term, tf] of tfVector) {
      const idf = this.idfScores.get(term) || 1;
      const boost = this.config.boostFactors.get(term) || 1;
      tfidfVector.set(term, tf * idf * boost);
    }
    return tfidfVector;
  }

  /** Compute cosine similarity between two TF-IDF vectors */
  computeCosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (const [term, valueA] of vecA) {
      magnitudeA += valueA * valueA;
      if (vecB.has(term)) {
        dotProduct += valueA * vecB.get(term)!;
      }
    }
    for (const valueB of vecB.values()) {
      magnitudeB += valueB * valueB;
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /** Build user profile from interaction history */
  buildUserProfile(userId: string, likedItemIds: string[], weights?: Map<string, number>): void {
    const profile: Map<string, number> = new Map();
    let totalWeight = 0;

    for (const itemId of likedItemIds) {
      const itemVector = this.getTFIDFVector(itemId);
      const weight = weights?.get(itemId) || 1;
      totalWeight += weight;

      for (const [term, value] of itemVector) {
        profile.set(term, (profile.get(term) || 0) + value * weight);
      }
    }

    // Normalize
    if (totalWeight > 0) {
      for (const [term, value] of profile) {
        profile.set(term, value / totalWeight);
      }
    }

    this.userProfiles.set(userId, profile);
  }

  /** Score an item against a user profile */
  scoreItem(userId: string, itemId: string): number {
    const userProfile = this.userProfiles.get(userId);
    if (!userProfile) return 0;
    const itemVector = this.getTFIDFVector(itemId);
    if (itemVector.size === 0) return 0;

    // Apply feature weights from config
    const weightedItem: Map<string, number> = new Map();
    for (const [term, value] of itemVector) {
      const categoryWeight = this.config.featureWeights['category'] || 1;
      const tagWeight = this.config.featureWeights['tags'] || 1;
      const item = this.itemProfiles.get(itemId);
      let multiplier = 1;
      if (item && item.tags.includes(term)) multiplier = tagWeight;
      if (item && item.category.toLowerCase() === term) multiplier = categoryWeight;
      weightedItem.set(term, value * multiplier);
    }

    return this.computeCosineSimilarity(userProfile, weightedItem);
  }

  /** Generate content-based recommendations for a user */
  recommend(userId: string, excludeItemIds: Set<string>, topN: number = 10): RecommendedItem[] {
    const userProfile = this.userProfiles.get(userId);
    if (!userProfile) return [];

    const candidates: Array<{ itemId: string; score: number }> = [];

    for (const [itemId] of this.itemProfiles) {
      if (excludeItemIds.has(itemId)) continue;
      const score = this.scoreItem(userId, itemId);
      if (score > 0) {
        candidates.push({ itemId, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, topN).map((c, index) => ({
      itemId: c.itemId,
      score: c.score,
      rank: index + 1,
      source: 'content_based',
      reason: 'Matches your content preferences',
    }));
  }

  /** Find similar items based on content */
  findSimilarItems(itemId: string, topN: number = 10): Array<{ itemId: string; similarity: number }> {
    const itemVector = this.getTFIDFVector(itemId);
    if (itemVector.size === 0) return [];

    const similarities: Array<{ itemId: string; similarity: number }> = [];

    for (const [otherId] of this.itemProfiles) {
      if (otherId === itemId) continue;
      const otherVector = this.getTFIDFVector(otherId);
      const similarity = this.computeCosineSimilarity(itemVector, otherVector);
      if (similarity > 0) {
        similarities.push({ itemId: otherId, similarity });
      }
    }

    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topN);
  }

  /** Extract top keywords from user profile */
  getTopKeywords(userId: string, topN: number = 20): Array<{ term: string; weight: number }> {
    const profile = this.userProfiles.get(userId);
    if (!profile) return [];

    const sorted = Array.from(profile.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    return sorted.map(([term, weight]) => ({ term, weight }));
  }

  /** Get document frequency stats */
  getStatistics(): { items: number; terms: number; avgTermsPerDoc: number } {
    let totalTerms = 0;
    for (const tfVector of this.documents.values()) {
      totalTerms += tfVector.size;
    }
    return {
      items: this.documentCount,
      terms: this.idfScores.size,
      avgTermsPerDoc: this.documentCount > 0 ? totalTerms / this.documentCount : 0,
    };
  }
}
