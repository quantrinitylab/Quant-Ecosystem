// ============================================================================
// Search - Inverted Index
// Full inverted index with BM25+ scoring, phrase search, and fuzzy matching
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
 * InvertedIndex - Full-text search inverted index implementation
 *
 * Provides document indexing with tokenization, stop word removal,
 * Porter stemming, BM25+ scoring, phrase search, and fuzzy matching.
 */
export class InvertedIndex {
  private index: Map<string, Posting[]>;
  private documents: Map<string, DocumentRecord>;
  private totalTokens: number = 0;
  private fieldBoosts: Map<string, number>;
  private useStopWords: boolean;
  private useStemming: boolean;
  private k1: number;
  private b: number;
  private delta: number;

  constructor(
    options: {
      useStopWords?: boolean;
      useStemming?: boolean;
      fieldBoosts?: Record<string, number>;
      k1?: number;
      b?: number;
      delta?: number;
    } = {},
  ) {
    this.index = new Map();
    this.documents = new Map();
    this.fieldBoosts = new Map();
    this.useStopWords = options.useStopWords !== false;
    this.useStemming = options.useStemming !== false;
    this.k1 = options.k1 ?? 1.2;
    this.b = options.b ?? 0.75;
    this.delta = options.delta ?? 1.0;

    if (options.fieldBoosts) {
      for (const [field, boost] of Object.entries(options.fieldBoosts)) {
        this.fieldBoosts.set(field, boost);
      }
    }
  }

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

      const termPositions: Map<string, number[]> = new Map();
      for (let i = 0; i < processed.length; i++) {
        const term = processed[i]!;
        if (!termPositions.has(term)) {
          termPositions.set(term, []);
        }
        termPositions.get(term)!.push(i);
      }

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

  public removeDocument(documentId: string): boolean {
    const doc = this.documents.get(documentId);
    if (!doc) return false;

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

  public search(
    query: string,
    options: { fields?: string[]; limit?: number } = {},
  ): Array<{ documentId: string; score: number; matchedTerms: string[] }> {
    const { phraseTerms, regularTerms, fuzzyTerms } = this.parseQuery(query);

    if (phraseTerms.length === 0 && regularTerms.length === 0 && fuzzyTerms.length === 0) {
      return [];
    }

    const scores: Map<string, { score: number; matchedTerms: Set<string> }> = new Map();
    const avgDocLength = this.getAverageDocLength();

    const allTerms = [...regularTerms];

    for (const term of regularTerms) {
      const postings = this.index.get(term);
      if (!postings) continue;

      const idf = this.calculateBM25IDF(term);

      for (const posting of postings) {
        if (options.fields && !options.fields.includes(posting.fieldName)) continue;

        const doc = this.documents.get(posting.documentId);
        if (!doc) continue;

        const fieldLength = doc.fieldLengths.get(posting.fieldName) || 1;
        const fieldBoost = this.fieldBoosts.get(posting.fieldName) || 1.0;
        const termScore =
          this.bm25PlusScore(posting.frequency, fieldLength, avgDocLength, idf) * fieldBoost;

        const existing = scores.get(posting.documentId) || { score: 0, matchedTerms: new Set() };
        existing.score += termScore;
        existing.matchedTerms.add(term);
        scores.set(posting.documentId, existing);
      }
    }

    for (const fuzzyTerm of fuzzyTerms) {
      const candidates = this.fuzzyMatch(fuzzyTerm, 2);
      for (const candidate of candidates) {
        const postings = this.index.get(candidate);
        if (!postings) continue;

        const idf = this.calculateBM25IDF(candidate);
        const editDist = this.editDistance(fuzzyTerm, candidate);
        const fuzzyPenalty = 1 - editDist * 0.15;

        for (const posting of postings) {
          if (options.fields && !options.fields.includes(posting.fieldName)) continue;

          const doc = this.documents.get(posting.documentId);
          if (!doc) continue;

          const fieldLength = doc.fieldLengths.get(posting.fieldName) || 1;
          const fieldBoost = this.fieldBoosts.get(posting.fieldName) || 1.0;
          const termScore =
            this.bm25PlusScore(posting.frequency, fieldLength, avgDocLength, idf) *
            fieldBoost *
            fuzzyPenalty;

          const existing = scores.get(posting.documentId) || { score: 0, matchedTerms: new Set() };
          existing.score += termScore;
          existing.matchedTerms.add(candidate);
          scores.set(posting.documentId, existing);
        }
      }
    }

    if (phraseTerms.length > 0) {
      for (const phrase of phraseTerms) {
        const phraseProcessed = this.processTokens(this.tokenize(phrase));
        if (phraseProcessed.length < 2) {
          allTerms.push(...phraseProcessed);
          continue;
        }

        const firstTermPostings = this.index.get(phraseProcessed[0]!);
        if (!firstTermPostings) continue;

        for (const posting of firstTermPostings) {
          if (options.fields && !options.fields.includes(posting.fieldName)) continue;

          const doc = this.documents.get(posting.documentId);
          if (!doc) continue;

          if (this.hasPhraseMatch(phraseProcessed, posting)) {
            const existing = scores.get(posting.documentId) || {
              score: 0,
              matchedTerms: new Set(),
            };
            const phraseBoost = 2.0;
            const idf = this.calculateBM25IDF(phraseProcessed[0]!);
            const fieldLength = doc.fieldLengths.get(posting.fieldName) || 1;
            const fieldBoost = this.fieldBoosts.get(posting.fieldName) || 1.0;
            existing.score +=
              this.bm25PlusScore(posting.frequency, fieldLength, avgDocLength, idf) *
              fieldBoost *
              phraseBoost;
            for (const t of phraseProcessed) {
              existing.matchedTerms.add(t);
            }
            scores.set(posting.documentId, existing);
          }
        }
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

  public tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }

  public normalize(token: string): string {
    return token.toLowerCase().trim().replace(/[^\w]/g, '');
  }

  public stem(word: string): string {
    if (word.length < 3) return word;

    let stem = word.toLowerCase();

    if (stem.endsWith('sses')) {
      stem = stem.slice(0, -2);
    } else if (stem.endsWith('ies')) {
      stem = stem.slice(0, -2);
    } else if (!stem.endsWith('ss') && stem.endsWith('s')) {
      stem = stem.slice(0, -1);
    }

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

    if (stem.endsWith('y') && this.hasVowel(stem.slice(0, -1))) {
      stem = stem.slice(0, -1) + 'i';
    }

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

  public getTermFrequency(term: string, documentId: string): number {
    const processed = this.processTokens([term]);
    if (processed.length === 0) return 0;

    const normalizedTerm = processed[0]!;
    const postings = this.index.get(normalizedTerm);
    if (!postings) return 0;

    const posting = postings.find((p) => p.documentId === documentId);
    return posting ? posting.frequency : 0;
  }

  public getDocumentFrequency(term: string): number {
    const processed = this.processTokens([term]);
    if (processed.length === 0) return 0;

    const normalizedTerm = processed[0]!;
    const postings = this.index.get(normalizedTerm);
    if (!postings) return 0;

    const uniqueDocs = new Set(postings.map((p) => p.documentId));
    return uniqueDocs.size;
  }

  public getDocCount(): number {
    return this.documents.size;
  }

  public getDocument(documentId: string): IndexDocument | undefined {
    const record = this.documents.get(documentId);
    if (!record) return undefined;
    return { id: record.id, fields: record.fields };
  }

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

  private bm25PlusScore(tf: number, docLength: number, avgDocLength: number, idf: number): number {
    const tfNorm =
      (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLength / avgDocLength)));
    return idf * (tfNorm + this.delta);
  }

  private calculateBM25IDF(term: string): number {
    const N = this.documents.size;
    if (N === 0) return 0;

    const postings = this.index.get(term);
    if (!postings) return 0;

    const df = new Set(postings.map((p) => p.documentId)).size;
    return Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  private parseQuery(query: string): {
    phraseTerms: string[];
    regularTerms: string[];
    fuzzyTerms: string[];
  } {
    const phraseTerms: string[] = [];
    const regularTerms: string[] = [];
    const fuzzyTerms: string[] = [];

    const MAX_QUERY_LENGTH = 1000;
    const safeQuery = query.length > MAX_QUERY_LENGTH ? query.slice(0, MAX_QUERY_LENGTH) : query;

    const phraseRegex = /"([^"]+)"/g;
    let match: RegExpExecArray | null;
    let remaining = safeQuery;

    while ((match = phraseRegex.exec(safeQuery)) !== null) {
      phraseTerms.push(match[1]!);
      remaining = remaining.replace(match[0], '');
    }

    const fuzzyRegex = /(\w+)~/g;
    let fuzzyMatch: RegExpExecArray | null;
    while ((fuzzyMatch = fuzzyRegex.exec(remaining)) !== null) {
      const term = fuzzyMatch[1]!;
      const processed = this.processTokens(this.tokenize(term));
      fuzzyTerms.push(...processed);
      remaining = remaining.replace(fuzzyMatch[0], '');
    }

    const tokens = this.tokenize(remaining);
    const processed = this.processTokens(tokens);
    regularTerms.push(...processed);

    return { phraseTerms, regularTerms, fuzzyTerms };
  }

  private hasPhraseMatch(phraseProcessed: string[], posting: Posting): boolean {
    if (phraseProcessed.length < 2) return true;

    const doc = this.documents.get(posting.documentId);
    if (!doc) return false;

    const firstTermPostings = this.index.get(phraseProcessed[0]!);
    if (!firstTermPostings) return false;

    const docPosting = firstTermPostings.find(
      (p) => p.documentId === posting.documentId && p.fieldName === posting.fieldName,
    );
    if (!docPosting) return false;

    for (const startPos of docPosting.positions) {
      let found = true;
      for (let i = 1; i < phraseProcessed.length; i++) {
        const expectedPos = startPos + i;
        const termPostings = this.index.get(phraseProcessed[i]!);
        if (!termPostings) {
          found = false;
          break;
        }
        const termDocPosting = termPostings.find(
          (p) => p.documentId === posting.documentId && p.fieldName === posting.fieldName,
        );
        if (!termDocPosting || !termDocPosting.positions.includes(expectedPos)) {
          found = false;
          break;
        }
      }
      if (found) return true;
    }

    return false;
  }

  private editDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i]![0] = i;
    for (let j = 0; j <= n; j++) dp[0]![j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
      }
    }

    return dp[m]![n]!;
  }

  private fuzzyMatch(term: string, maxDistance: number): string[] {
    const candidates: string[] = [];
    for (const indexTerm of this.index.keys()) {
      if (Math.abs(indexTerm.length - term.length) > maxDistance) continue;
      if (this.editDistance(term, indexTerm) <= maxDistance) {
        candidates.push(indexTerm);
      }
    }
    return candidates;
  }

  private measure(stem: string): number {
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
      size += term.length * 2;
      size += postings.length * 32;
    }
    size += this.documents.size * 256;
    return size;
  }
}
