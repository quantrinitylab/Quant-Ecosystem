// ============================================================================
// Search - Inverted Index
// Full inverted index with tokenization, stemming, and stop word removal
// ============================================================================

import type { IndexDocument, TokenInfo, IndexStats } from '../types';

/** Posting entry in the inverted index */
interface Posting {
  documentId: string;
  frequency: number;
  positions: number[];
  fieldName: string;
}

/** Document length record */
interface DocumentRecord {
  id: string;
  fields: Record<string, unknown>;
  fieldLengths: Map<string, number>;
  totalLength: number;
  indexedAt: number;
}

/** English stop words list */
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'shall',
  'can',
  'need',
  'dare',
  'not',
  'so',
  'no',
  'nor',
  'as',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'my',
  'we',
  'our',
  'you',
  'your',
  'he',
  'him',
  'his',
  'she',
  'her',
  'they',
  'them',
  'their',
  'what',
  'which',
  'who',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'than',
  'too',
  'very',
  'just',
]);

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: In-memory BM25 with JS tokenizer and stop-word list, not production search
 * Production path: Use Meilisearch, Elasticsearch, or Typesense
 */
/**
 * InvertedIndex - Full-text search inverted index implementation
 *
 * Provides document indexing with tokenization, stop word removal,
 * Porter stemming, and term frequency tracking. Supports multi-field
 * documents and position-based search.
 */
export class InvertedIndex {
  private index: Map<string, Posting[]>; // term -> postings
  private documents: Map<string, DocumentRecord>;
  private totalTokens: number = 0;
  private fieldBoosts: Map<string, number>;
  private useStopWords: boolean;
  private useStemming: boolean;

  constructor(
    options: {
      useStopWords?: boolean;
      useStemming?: boolean;
      fieldBoosts?: Record<string, number>;
    } = {},
  ) {
    this.index = new Map();
    this.documents = new Map();
    this.fieldBoosts = new Map();
    this.useStopWords = options.useStopWords !== false;
    this.useStemming = options.useStemming !== false;

    if (options.fieldBoosts) {
      for (const [field, boost] of Object.entries(options.fieldBoosts)) {
        this.fieldBoosts.set(field, boost);
      }
    }
  }

  /**
   * Add a document to the index
   */
  public addDocument(document: IndexDocument): void {
    if (this.documents.has(document.id)) {
      this.removeDocument(document.id);
    }

    const fieldLengths = new Map<string, number>();
    let totalLength = 0;

    for (const [fieldName, fieldValue] of Object.entries(document.fields)) {
      if (typeof fieldValue !== 'string') continue;

      const tokens = this.tokenize(fieldValue);
      const processed = this.processTokens(tokens);
      fieldLengths.set(fieldName, processed.length);
      totalLength += processed.length;

      // Build postings for each term
      const termPositions: Map<string, number[]> = new Map();
      for (let i = 0; i < processed.length; i++) {
        const term = processed[i]!;
        if (!termPositions.has(term)) {
          termPositions.set(term, []);
        }
        termPositions.get(term)!.push(i);
      }

      // Add to inverted index
      for (const [term, positions] of termPositions) {
        if (!this.index.has(term)) {
          this.index.set(term, []);
        }

        this.index.get(term)!.push({
          documentId: document.id,
          frequency: positions.length,
          positions,
          fieldName,
        });
      }

      this.totalTokens += processed.length;
    }

    this.documents.set(document.id, {
      id: document.id,
      fields: document.fields,
      fieldLengths,
      totalLength,
      indexedAt: Date.now(),
    });
  }

  /**
   * Remove a document from the index
   */
  public removeDocument(documentId: string): boolean {
    const doc = this.documents.get(documentId);
    if (!doc) return false;

    // Remove from all posting lists
    for (const [term, postings] of this.index) {
      const filtered = postings.filter((p) => p.documentId !== documentId);
      if (filtered.length === 0) {
        this.index.delete(term);
      } else {
        this.index.set(term, filtered);
      }
    }

    this.totalTokens -= doc.totalLength;
    this.documents.delete(documentId);
    return true;
  }

  /**
   * Search the index for documents matching the query
   */
  public search(
    query: string,
    options: { fields?: string[]; limit?: number } = {},
  ): Array<{ documentId: string; score: number; matchedTerms: string[] }> {
    const tokens = this.tokenize(query);
    const terms = this.processTokens(tokens);

    if (terms.length === 0) return [];

    const scores: Map<string, { score: number; matchedTerms: Set<string> }> = new Map();

    for (const term of terms) {
      const postings = this.index.get(term);
      if (!postings) continue;

      const idf = this.calculateIDF(term);

      for (const posting of postings) {
        // Filter by fields if specified
        if (options.fields && !options.fields.includes(posting.fieldName)) continue;

        const doc = this.documents.get(posting.documentId);
        if (!doc) continue;

        const fieldLength = doc.fieldLengths.get(posting.fieldName) || 1;
        const tf = posting.frequency / fieldLength;
        const fieldBoost = this.fieldBoosts.get(posting.fieldName) || 1.0;
        const termScore = tf * idf * fieldBoost;

        const existing = scores.get(posting.documentId) || { score: 0, matchedTerms: new Set() };
        existing.score += termScore;
        existing.matchedTerms.add(term);
        scores.set(posting.documentId, existing);
      }
    }

    const results = Array.from(scores.entries())
      .map(([documentId, data]) => ({
        documentId,
        score: data.score,
        matchedTerms: Array.from(data.matchedTerms),
      }))
      .sort((a, b) => b.score - a.score);

    return options.limit ? results.slice(0, options.limit) : results;
  }

  /**
   * Tokenize text into individual tokens
   */
  public tokenize(text: string): string[] {
    // Split on whitespace and punctuation
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }

  /**
   * Normalize a token (lowercase, trim, remove special chars)
   */
  public normalize(token: string): string {
    return token.toLowerCase().trim().replace(/[^\w]/g, '');
  }

  /**
   * Apply Porter stemming algorithm
   */
  public stem(word: string): string {
    if (word.length < 3) return word;

    let stem = word.toLowerCase();

    // Step 1a: plurals
    if (stem.endsWith('sses')) {
      stem = stem.slice(0, -2);
    } else if (stem.endsWith('ies')) {
      stem = stem.slice(0, -2);
    } else if (!stem.endsWith('ss') && stem.endsWith('s')) {
      stem = stem.slice(0, -1);
    }

    // Step 1b: -ed, -ing
    if (stem.endsWith('eed')) {
      if (this.measure(stem.slice(0, -3)) > 0) {
        stem = stem.slice(0, -1);
      }
    } else if (stem.endsWith('ed') && this.hasVowel(stem.slice(0, -2))) {
      stem = stem.slice(0, -2);
      stem = this.step1bHelper(stem);
    } else if (stem.endsWith('ing') && this.hasVowel(stem.slice(0, -3))) {
      stem = stem.slice(0, -3);
      stem = this.step1bHelper(stem);
    }

    // Step 1c: y -> i
    if (stem.endsWith('y') && this.hasVowel(stem.slice(0, -1))) {
      stem = stem.slice(0, -1) + 'i';
    }

    // Step 2: double suffixes
    const step2Suffixes: Record<string, string> = {
      ational: 'ate',
      tional: 'tion',
      enci: 'ence',
      anci: 'ance',
      izer: 'ize',
      abli: 'able',
      alli: 'al',
      entli: 'ent',
      eli: 'e',
      ousli: 'ous',
      ization: 'ize',
      ation: 'ate',
      ator: 'ate',
      alism: 'al',
      iveness: 'ive',
      fulness: 'ful',
      ousness: 'ous',
      aliti: 'al',
      iviti: 'ive',
      biliti: 'ble',
    };

    for (const [suffix, replacement] of Object.entries(step2Suffixes)) {
      if (stem.endsWith(suffix)) {
        const base = stem.slice(0, -suffix.length);
        if (this.measure(base) > 0) {
          stem = base + replacement;
        }
        break;
      }
    }

    // Step 3
    const step3Suffixes: Record<string, string> = {
      icate: 'ic',
      ative: '',
      alize: 'al',
      iciti: 'ic',
      ical: 'ic',
      ful: '',
      ness: '',
    };

    for (const [suffix, replacement] of Object.entries(step3Suffixes)) {
      if (stem.endsWith(suffix)) {
        const base = stem.slice(0, -suffix.length);
        if (this.measure(base) > 0) {
          stem = base + replacement;
        }
        break;
      }
    }

    return stem;
  }

  /**
   * Get term frequency for a term in a specific document
   */
  public getTermFrequency(term: string, documentId: string): number {
    const processed = this.processTokens([term]);
    if (processed.length === 0) return 0;

    const normalizedTerm = processed[0]!;
    const postings = this.index.get(normalizedTerm);
    if (!postings) return 0;

    const posting = postings.find((p) => p.documentId === documentId);
    return posting ? posting.frequency : 0;
  }

  /**
   * Get document frequency for a term (how many documents contain it)
   */
  public getDocumentFrequency(term: string): number {
    const processed = this.processTokens([term]);
    if (processed.length === 0) return 0;

    const normalizedTerm = processed[0]!;
    const postings = this.index.get(normalizedTerm);
    if (!postings) return 0;

    const uniqueDocs = new Set(postings.map((p) => p.documentId));
    return uniqueDocs.size;
  }

  /**
   * Get total document count
   */
  public getDocCount(): number {
    return this.documents.size;
  }

  /**
   * Get a document by ID
   */
  public getDocument(documentId: string): IndexDocument | undefined {
    const record = this.documents.get(documentId);
    if (!record) return undefined;
    return { id: record.id, fields: record.fields };
  }

  /**
   * Get index statistics
   */
  public getStats(): IndexStats {
    const docCount = this.documents.size;
    const avgDocLength = docCount > 0 ? this.totalTokens / docCount : 0;

    return {
      documentCount: docCount,
      termCount: this.index.size,
      averageDocLength: avgDocLength,
      totalTokens: this.totalTokens,
      lastUpdated: Date.now(),
      sizeEstimateBytes: this.estimateSize(),
    };
  }

  /**
   * Get detailed token analysis for text
   */
  public analyze(text: string): TokenInfo[] {
    const tokens = this.tokenize(text);
    const result: TokenInfo[] = [];
    let offset = 0;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const startOffset = text.toLowerCase().indexOf(token, offset);
      const normalized = this.normalize(token);
      const stemmed = this.useStemming ? this.stem(normalized) : normalized;

      result.push({
        original: token,
        normalized,
        stemmed,
        position: i,
        startOffset: startOffset >= 0 ? startOffset : offset,
        endOffset: (startOffset >= 0 ? startOffset : offset) + token.length,
      });

      offset = (startOffset >= 0 ? startOffset : offset) + token.length;
    }

    return result;
  }

  /**
   * Get average document length
   */
  public getAverageDocLength(): number {
    const docCount = this.documents.size;
    return docCount > 0 ? this.totalTokens / docCount : 0;
  }

  // ---- Private Methods ----

  private processTokens(tokens: string[]): string[] {
    let processed = tokens.map((t) => this.normalize(t)).filter((t) => t.length > 0);

    if (this.useStopWords) {
      processed = processed.filter((t) => !STOP_WORDS.has(t));
    }

    if (this.useStemming) {
      processed = processed.map((t) => this.stem(t));
    }

    return processed.filter((t) => t.length > 0);
  }

  private calculateIDF(term: string): number {
    const N = this.documents.size;
    if (N === 0) return 0;

    const postings = this.index.get(term);
    if (!postings) return 0;

    const df = new Set(postings.map((p) => p.documentId)).size;
    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  private measure(stem: string): number {
    // Count VC patterns (vowel-consonant sequences)
    let count = 0;
    let isVowel = false;
    const vowels = new Set(['a', 'e', 'i', 'o', 'u']);

    for (const char of stem) {
      const currentIsVowel = vowels.has(char);
      if (!currentIsVowel && isVowel) {
        count++;
      }
      isVowel = currentIsVowel;
    }

    return count;
  }

  private hasVowel(stem: string): boolean {
    const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
    for (const char of stem) {
      if (vowels.has(char)) return true;
    }
    return false;
  }

  private step1bHelper(stem: string): string {
    if (stem.endsWith('at') || stem.endsWith('bl') || stem.endsWith('iz')) {
      return stem + 'e';
    }

    if (stem.length >= 2) {
      const last = stem[stem.length - 1]!;
      const secondLast = stem[stem.length - 2]!;
      if (last === secondLast && !['l', 's', 'z'].includes(last)) {
        return stem.slice(0, -1);
      }
    }

    if (this.measure(stem) === 1 && this.endsWithCVC(stem)) {
      return stem + 'e';
    }

    return stem;
  }

  private endsWithCVC(word: string): boolean {
    if (word.length < 3) return false;
    const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
    const last = word[word.length - 1]!;
    const mid = word[word.length - 2]!;
    const first = word[word.length - 3]!;

    return (
      !vowels.has(last) && vowels.has(mid) && !vowels.has(first) && !['w', 'x', 'y'].includes(last)
    );
  }

  private estimateSize(): number {
    let size = 0;
    for (const [term, postings] of this.index) {
      size += term.length * 2; // term string
      size += postings.length * 32; // posting entries
    }
    size += this.documents.size * 256; // document records
    return size;
  }
}
