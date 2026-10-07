// ============================================================================
// Search Package - Barrel Export
// ============================================================================

export { InvertedIndex } from './core/inverted-index';
export { BM25Ranker } from './core/bm25-ranker';
export { AutocompleteEngine } from './core/autocomplete';
export { FacetedSearch } from './core/faceted-search';
export { SearchAnalytics } from './core/search-analytics';
export { SearchClient, QUANT_INDEXES, SearchOptionsSchema } from './services/search-client';
export {
  VectorClient,
  QdrantPointSchema,
  VectorSearchOptionsSchema,
} from './services/vector-client';
export { HybridSearchEngine, HybridSearchOptionsSchema } from './services/hybrid-search';
export {
  QueryParser,
  ParsedQuerySchema,
  ParsedFilterSchema,
  DateRangeSchema,
} from './services/query-parser';
export {
  PermissionFilter,
  VisibilitySchema,
  SearchResultWithPermissionsSchema,
  UserPermissionsSchema,
} from './services/permission-filter';
export { CohereReranker, RerankDocumentSchema, RerankOptionsSchema } from './services/reranker';
export { SearchExplainer } from './services/search-explainer';
export { UGCEmbeddingIndexer } from './services/embedding-indexer';
export { HybridSearchPipeline } from './services/hybrid-search-pipeline';
export { SearchFacetAggregator, FacetableResultSchema, FacetScopeSchema } from './services/facets';
export {
  ProactiveSearch,
  ProactiveContextSchema,
  ProactiveResultSchema,
} from './services/proactive';

export type { SearchOptions, IndexConfig } from './services/search-client';
export type {
  QdrantPoint,
  VectorSearchOptions,
  VectorSearchResult,
  CollectionInfo,
  VectorClientOptions,
} from './services/vector-client';
export type { HybridSearchOptions, HybridSearchResult } from './services/hybrid-search';
export type { ParsedQuery, ParsedFilter, DateRange } from './services/query-parser';
export type {
  Visibility,
  SearchResultWithPermissions,
  UserPermissions,
} from './services/permission-filter';
export type { RerankDocument, RerankOptions, RerankResult } from './services/reranker';
export type { RankingSignal, ExplanationResult, ExplainContext } from './services/search-explainer';
export type {
  EmbeddingProvider,
  IndexableContent,
  EmbeddingIndexerOptions,
} from './services/embedding-indexer';
export type {
  PipelineSearchResult,
  PipelineSearchOptions,
  HybridSearchPipelineOptions,
} from './services/hybrid-search-pipeline';
export type { FacetableResult, FacetScope } from './services/facets';
export type {
  ProactiveContext,
  ProactiveResult,
  ProactiveSearchOptions,
} from './services/proactive';

export {
  SavedSearchService,
  SavedSearchSchema,
  AlertFrequencySchema,
} from './services/saved-search';
export type {
  SavedSearch,
  AlertFrequency,
  CreateSavedSearchInput,
  UpdateSavedSearchInput,
  DocumentToMatch,
  SavedSearchMatch,
} from './services/saved-search';

export { SearchObservabilityService } from './services/search-observability';
export type {
  QueryRecord,
  TimeRange,
  SearchMetrics,
  SlowQuery,
  PopularQuery,
  ZeroResultQuery,
} from './services/search-observability';

export { ReindexJobManager, ReindexJobStateSchema, ReindexJobSchema } from './services/reindex-job';
export type { ReindexJob, ReindexJobState } from './services/reindex-job';

export { NLQueryEnhancer } from './services/nl-query-enhancer';
export type { QueryIntent, ExtractedEntity, EnhancedQuery } from './services/nl-query-enhancer';

export { CrossAppSearchService } from './cross-app-search';
export { CrossAppSearchApi } from './services/cross-app-search-api';
export type { SearchApiOptions, SearchApiResponse } from './services/cross-app-search-api';
export type {
  CrossAppSearchResult,
  CrossAppSearchOptions,
  CrossAppSearchSuggestion,
  CrossAppSearchResponse,
} from './cross-app-search';

export { SnippetHighlighter } from './services/snippet-highlighter';
export type { SnippetHighlightOptions, HighlightedSnippet } from './services/snippet-highlighter';

export { RagAnswerSynthesizer } from './services/rag-answer-synthesizer';
export type {
  RagContext,
  Citation,
  RagAnswer,
  RagAnswerSynthesizerOptions,
} from './services/rag-answer-synthesizer';

export { SearchHistoryService } from './services/search-history';
export type { SearchHistoryEntry, SearchHistoryOptions } from './services/search-history';

export { UniversalSearchService } from './services/universal-search';
export type {
  UniversalSearchRequest,
  UniversalSearchOptions,
  UniversalSearchResultItem,
  UniversalSearchResponse,
  UniversalSearchDependencies,
} from './services/universal-search';

export { ContentExtractor } from './services/content-extractor';

export { FindSimilarService } from './services/find-similar';
export type { FindSimilarOptions, FindSimilarResult } from './services/find-similar';

export { TypeaheadService } from './services/typeahead';
export type {
  TypeaheadOptions,
  TypeaheadSuggestion,
  TypeaheadResponse,
} from './services/typeahead';

export type {
  SearchQuery,
  SearchResult,
  SearchResponse,
  SearchFilter,
  FilterOperator,
  SortOption,
  ScoreExplanation,
  FacetDefinition,
  FacetType,
  FacetRange,
  FacetResult,
  FacetBucket,
  IndexDocument,
  DocumentMetadata,
  SearchSuggestion,
  TokenInfo,
  TFIDFScore,
  BM25Config,
  SearchAnalyticsEntry,
  TrieNode,
  IndexStats,
  SearchIndexConfig,
  IndexFieldConfig,
  AnalyzerConfig,
} from './types';

// Engine factory pattern
export { createSearchEngine, MeilisearchEngine, InMemoryEngine } from './engines/index';
export type {
  SearchEngine,
  SearchResult as EngineSearchResult,
  SearchEngineOptions,
  IndexConfig as EngineIndexConfig,
} from './engines/types';
