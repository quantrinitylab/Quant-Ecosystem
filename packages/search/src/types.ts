// ============================================================================
// Search Package - Type Definitions
// ============================================================================

/** Search query parameters */
export interface SearchQuery {
  query: string;
  filters?: SearchFilter[];
  facets?: string[];
  page?: number;
  pageSize?: number;
  sort?: SortOption;
  highlight?: boolean;
  fuzzy?: boolean;
  fuzziness?: number;
  fields?: string[];
  boost?: Record<string, number>;
  minScore?: number;
}

/** Search result */
export interface SearchResult<T = Record<string, unknown>> {
  id: string;
  score: number;
  document: T;
  highlights?: Record<string, string[]>;
  matchedTerms: string[];
  explanation?: ScoreExplanation;
}

/** Search response wrapper */
export interface SearchResponse<T = Record<string, unknown>> {
  results: SearchResult<T>[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  took: number; // ms
  facets?: FacetResult[];
  suggestions?: SearchSuggestion[];
}

/** Search filter */
export interface SearchFilter {
  field: string;
  operator: FilterOperator;
  value: unknown;
}

/** Filter operator types */
export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'between'
  | 'exists';

/** Sort option */
export interface SortOption {
  field: string;
  direction: 'asc' | 'desc';
}

/** Score explanation for debugging */
export interface ScoreExplanation {
  score: number;
  description: string;
  details: Array<{ term: string; tf: number; idf: number; fieldBoost: number; score: number }>;
}

/** Facet definition */
export interface FacetDefinition {
  name: string;
  field: string;
  type: FacetType;
  size?: number;
  ranges?: FacetRange[];
  minCount?: number;
}

/** Facet type */
export type FacetType = 'terms' | 'range' | 'date_histogram' | 'numeric_range';

/** Facet range */
export interface FacetRange {
  label: string;
  from?: number;
  to?: number;
}

/** Facet result */
export interface FacetResult {
  name: string;
  field: string;
  type: FacetType;
  buckets: FacetBucket[];
  total: number;
}

/** Individual facet bucket */
export interface FacetBucket {
  key: string;
  count: number;
  label?: string;
  from?: number;
  to?: number;
  selected?: boolean;
}

/** Document for indexing */
export interface IndexDocument {
  id: string;
  fields: Record<string, unknown>;
  metadata?: DocumentMetadata;
}

/** Document metadata */
export interface DocumentMetadata {
  createdAt?: number;
  updatedAt?: number;
  source?: string;
  language?: string;
  boost?: number;
  tags?: string[];
}

/** Search suggestion */
export interface SearchSuggestion {
  text: string;
  score: number;
  frequency?: number;
  highlighted?: string;
  source: 'autocomplete' | 'did_you_mean' | 'popular' | 'trending';
}

/** Token information from analysis */
export interface TokenInfo {
  original: string;
  normalized: string;
  stemmed: string;
  position: number;
  startOffset: number;
  endOffset: number;
}

/** TF-IDF score components */
export interface TFIDFScore {
  term: string;
  tf: number;
  idf: number;
  tfidf: number;
  documentId: string;
}

/** BM25 configuration parameters */
export interface BM25Config {
  k1: number; // Term frequency saturation (default 1.2)
  b: number; // Length normalization (default 0.75)
  delta?: number; // BM25+ delta parameter
}

/** Search analytics entry */
export interface SearchAnalyticsEntry {
  id: string;
  query: string;
  userId?: string;
  timestamp: number;
  resultsCount: number;
  clickedResults: string[];
  clickPositions: number[];
  responseTimeMs: number;
  filters: SearchFilter[];
  page: number;
  converted: boolean;
}

/** Trie node for autocomplete */
export interface TrieNode {
  children: Map<string, TrieNode>;
  isEnd: boolean;
  frequency: number;
  data?: unknown;
}

/** Index statistics */
export interface IndexStats {
  documentCount: number;
  termCount: number;
  averageDocLength: number;
  totalTokens: number;
  lastUpdated: number;
  sizeEstimateBytes: number;
}

/** Search index configuration */
export interface SearchIndexConfig {
  name: string;
  fields: IndexFieldConfig[];
  defaultSearchFields?: string[];
  analyzer?: AnalyzerConfig;
}

/** Index field configuration */
export interface IndexFieldConfig {
  name: string;
  type: 'text' | 'keyword' | 'number' | 'date' | 'boolean';
  searchable: boolean;
  filterable: boolean;
  facetable: boolean;
  boost?: number;
}

/** Text analyzer configuration */
export interface AnalyzerConfig {
  tokenizer: 'standard' | 'whitespace' | 'ngram';
  filters: Array<'lowercase' | 'stemmer' | 'stopwords' | 'ascii_folding'>;
  stopwords?: string[];
  language?: string;
}
