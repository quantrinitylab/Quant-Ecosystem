// ============================================================================
// Search - Autocomplete Engine
// Trie-based prefix matching with Levenshtein distance fuzzy matching
// ============================================================================

import type { SearchSuggestion, TrieNode } from '../types';

/** Autocomplete configuration */
interface AutocompleteConfig {
  maxSuggestions: number;
  minQueryLength: number;
  maxEditDistance: number;
  enableFuzzy: boolean;
  popularityDecayMs: number;
  trendingWindowMs: number;
}

const DEFAULT_CONFIG: AutocompleteConfig = {
  maxSuggestions: 10,
  minQueryLength: 1,
  maxEditDistance: 2,
  enableFuzzy: true,
  popularityDecayMs: 604800000, // 7 days
  trendingWindowMs: 86400000, // 24 hours
};

/** Entry in the suggestion index */
interface SuggestionEntry {
  text: string;
  frequency: number;
  lastUsedAt: number;
  score: number;
  data?: unknown;
}

/**
 * AutocompleteEngine - Trie-based autocomplete with fuzzy matching
 *
 * Provides fast prefix-based suggestions using a trie data structure.
 * Supports Levenshtein distance for typo-tolerant fuzzy matching,
 * popularity-based ranking, and trending query detection.
 */
export class AutocompleteEngine {
  private config: AutocompleteConfig;
  private root: TrieNode;
  private entries: Map<string, SuggestionEntry>;
  private searchHistory: Array<{ query: string; timestamp: number }>;
  private popularCache: SearchSuggestion[] | null = null;
  private popularCacheExpiry: number = 0;

  constructor(config: Partial<AutocompleteConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.root = this.createNode();
    this.entries = new Map();
    this.searchHistory = [];
  }

  /**
   * Get suggestions for a prefix query
   */
  public suggest(
    query: string,
    options: { limit?: number; fuzzy?: boolean } = {},
  ): SearchSuggestion[] {
    if (query.length < this.config.minQueryLength) return [];

    const limit = options.limit || this.config.maxSuggestions;
    const useFuzzy = options.fuzzy !== undefined ? options.fuzzy : this.config.enableFuzzy;
    const normalized = query.toLowerCase().trim();

    // Record the query for popularity tracking
    this.searchHistory.push({ query: normalized, timestamp: Date.now() });

    // Get exact prefix matches
    const prefixMatches = this.getPrefixMatches(normalized);

    // Get fuzzy matches if enabled and prefix matches are insufficient
    let fuzzyMatches: SearchSuggestion[] = [];
    if (useFuzzy && prefixMatches.length < limit) {
      fuzzyMatches = this.getFuzzyMatches(normalized, limit - prefixMatches.length);
    }

    // Combine and deduplicate
    const seen = new Set<string>();
    const combined: SearchSuggestion[] = [];

    for (const match of [...prefixMatches, ...fuzzyMatches]) {
      if (!seen.has(match.text)) {
        seen.add(match.text);
        combined.push(match);
      }
    }

    // Sort by score and return top results
    combined.sort((a, b) => b.score - a.score);
    return combined.slice(0, limit);
  }

  /**
   * Add a term to the autocomplete index
   */
  public addToIndex(text: string, options: { frequency?: number; data?: unknown } = {}): void {
    const normalized = text.toLowerCase().trim();
    if (normalized.length === 0) return;

    // Add to trie
    let node = this.root;
    for (const char of normalized) {
      if (!node.children.has(char)) {
        node.children.set(char, this.createNode());
      }
      node = node.children.get(char)!;
    }
    node.isEnd = true;
    node.frequency += options.frequency || 1;
    node.data = options.data;

    // Add/update entry
    const existing = this.entries.get(normalized);
    if (existing) {
      existing.frequency += options.frequency || 1;
      existing.lastUsedAt = Date.now();
      existing.score = this.calculateScore(existing);
      if (options.data) existing.data = options.data;
    } else {
      const entry: SuggestionEntry = {
        text: normalized,
        frequency: options.frequency || 1,
        lastUsedAt: Date.now(),
        score: 0,
        data: options.data,
      };
      entry.score = this.calculateScore(entry);
      this.entries.set(normalized, entry);
    }

    // Invalidate popular cache
    this.popularCache = null;
  }

  /**
   * Add multiple terms at once
   */
  public addBulk(terms: Array<{ text: string; frequency?: number; data?: unknown }>): void {
    for (const term of terms) {
      this.addToIndex(term.text, { frequency: term.frequency, data: term.data });
    }
  }

  /**
   * Calculate Levenshtein edit distance between two strings
   */
  public editDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    // Create distance matrix
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    // Initialize base cases
    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;

    // Fill the matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i]![j] = dp[i - 1]![j - 1]!;
        } else {
          dp[i]![j] =
            1 +
            Math.min(
              dp[i - 1]![j]!, // deletion
              dp[i]![j - 1]!, // insertion
              dp[i - 1]![j - 1]!, // substitution
            );
        }
      }
    }

    return dp[m]![n]!;
  }

  /**
   * Fuzzy match using Levenshtein distance
   */
  public fuzzyMatch(query: string, maxDistance?: number): SearchSuggestion[] {
    const normalized = query.toLowerCase().trim();
    const maxDist = maxDistance || this.config.maxEditDistance;
    const matches: SearchSuggestion[] = [];

    for (const [text, entry] of this.entries) {
      const distance = this.editDistance(normalized, text);
      if (distance <= maxDist && distance > 0) {
        const score = entry.score * (1 - distance / (maxDist + 1));
        matches.push({
          text: entry.text,
          score,
          frequency: entry.frequency,
          highlighted: this.highlightDifferences(normalized, text),
          source: 'autocomplete',
        });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  /**
   * Get popular queries sorted by frequency
   */
  public getPopular(limit: number = 10): SearchSuggestion[] {
    const now = Date.now();

    // Use cache if valid
    if (this.popularCache && this.popularCacheExpiry > now) {
      return this.popularCache.slice(0, limit);
    }

    const suggestions: SearchSuggestion[] = [];
    for (const [, entry] of this.entries) {
      suggestions.push({
        text: entry.text,
        score: entry.score,
        frequency: entry.frequency,
        source: 'popular',
      });
    }

    suggestions.sort((a, b) => b.frequency! - a.frequency!);
    this.popularCache = suggestions.slice(0, 50);
    this.popularCacheExpiry = now + 60000; // Cache for 1 minute

    return suggestions.slice(0, limit);
  }

  /**
   * Get trending queries (high frequency in recent time window)
   */
  public getTrending(limit: number = 10): SearchSuggestion[] {
    const now = Date.now();
    const windowStart = now - this.config.trendingWindowMs;

    // Count recent queries
    const recentCounts: Map<string, number> = new Map();
    for (const entry of this.searchHistory) {
      if (entry.timestamp >= windowStart) {
        const count = recentCounts.get(entry.query) || 0;
        recentCounts.set(entry.query, count + 1);
      }
    }

    // Calculate trending score (recent frequency / historical frequency)
    const trending: SearchSuggestion[] = [];
    for (const [query, recentCount] of recentCounts) {
      const entry = this.entries.get(query);
      const historicalFreq = entry ? entry.frequency : 1;
      const trendScore = recentCount / Math.sqrt(historicalFreq);

      trending.push({
        text: query,
        score: trendScore,
        frequency: recentCount,
        source: 'trending',
      });
    }

    trending.sort((a, b) => b.score - a.score);
    return trending.slice(0, limit);
  }

  /**
   * Set maximum number of suggestions returned
   */
  public setMaxSuggestions(max: number): void {
    if (max < 1) throw new Error('Max suggestions must be at least 1');
    this.config.maxSuggestions = max;
  }

  /**
   * Get the size of the autocomplete index
   */
  public getSize(): number {
    return this.entries.size;
  }

  /**
   * Remove a term from the index
   */
  public remove(text: string): boolean {
    const normalized = text.toLowerCase().trim();
    if (!this.entries.has(normalized)) return false;

    this.entries.delete(normalized);

    // Remove from trie
    this.removeFromTrie(normalized);
    this.popularCache = null;

    return true;
  }

  /**
   * Clear the entire index
   */
  public clear(): void {
    this.root = this.createNode();
    this.entries.clear();
    this.searchHistory = [];
    this.popularCache = null;
  }

  /**
   * Clean up old search history
   */
  public cleanup(olderThanMs?: number): number {
    const cutoff = Date.now() - (olderThanMs || this.config.popularityDecayMs);
    const before = this.searchHistory.length;
    this.searchHistory = this.searchHistory.filter((h) => h.timestamp >= cutoff);
    return before - this.searchHistory.length;
  }

  // ---- Private Methods ----

  private getPrefixMatches(prefix: string): SearchSuggestion[] {
    // Navigate to the prefix node in the trie
    let node = this.root;
    for (const char of prefix) {
      if (!node.children.has(char)) {
        return [];
      }
      node = node.children.get(char)!;
    }

    // Collect all completions from this node
    const completions: SearchSuggestion[] = [];
    this.collectCompletions(node, prefix, completions);
    return completions;
  }

  private collectCompletions(
    node: TrieNode,
    currentWord: string,
    results: SearchSuggestion[],
  ): void {
    if (results.length >= this.config.maxSuggestions * 2) return;

    if (node.isEnd) {
      const entry = this.entries.get(currentWord);
      if (entry) {
        results.push({
          text: entry.text,
          score: entry.score,
          frequency: entry.frequency,
          source: 'autocomplete',
        });
      }
    }

    for (const [char, childNode] of node.children) {
      this.collectCompletions(childNode, currentWord + char, results);
    }
  }

  private getFuzzyMatches(query: string, limit: number): SearchSuggestion[] {
    const maxDist = Math.min(this.config.maxEditDistance, Math.floor(query.length / 3) + 1);
    const matches: SearchSuggestion[] = [];

    for (const [text, entry] of this.entries) {
      // Quick length check to avoid unnecessary calculations
      if (Math.abs(text.length - query.length) > maxDist) continue;

      // Quick prefix check - first character should be close
      if (text[0] !== query[0] && this.editDistance(text[0]!, query[0]!) > 0) {
        // Allow first character mismatch but reduce max distance
        if (maxDist < 2) continue;
      }

      const distance = this.editDistance(query, text);
      if (distance <= maxDist && distance > 0) {
        const score = entry.score * (1 - distance / (maxDist + 1));
        matches.push({
          text: entry.text,
          score,
          frequency: entry.frequency,
          highlighted: this.highlightDifferences(query, text),
          source: 'autocomplete',
        });
      }

      if (matches.length >= limit * 3) break;
    }

    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, limit);
  }

  private highlightDifferences(query: string, match: string): string {
    let highlighted = '';
    const m = query.length;
    const n = match.length;

    let i = 0;
    let j = 0;

    while (i < m && j < n) {
      if (query[i] === match[j]) {
        highlighted += match[j];
        i++;
        j++;
      } else {
        highlighted += `<em>${match[j]}</em>`;
        j++;
      }
    }

    while (j < n) {
      highlighted += `<em>${match[j]}</em>`;
      j++;
    }

    return highlighted;
  }

  private calculateScore(entry: SuggestionEntry): number {
    const now = Date.now();
    const age = now - entry.lastUsedAt;
    const decayFactor = Math.exp(-age / this.config.popularityDecayMs);

    return entry.frequency * decayFactor;
  }

  private removeFromTrie(word: string): void {
    const path: Array<{ node: TrieNode; char: string }> = [];
    let node = this.root;

    for (const char of word) {
      const child = node.children.get(char);
      if (!child) return;
      path.push({ node, char });
      node = child;
    }

    node.isEnd = false;
    node.frequency = 0;

    // Clean up unused branches
    for (let i = path.length - 1; i >= 0; i--) {
      const { node: parentNode, char } = path[i]!;
      const childNode = parentNode.children.get(char)!;
      if (childNode.children.size === 0 && !childNode.isEnd) {
        parentNode.children.delete(char);
      } else {
        break;
      }
    }
  }

  private createNode(): TrieNode {
    return {
      children: new Map(),
      isEnd: false,
      frequency: 0,
    };
  }
}
