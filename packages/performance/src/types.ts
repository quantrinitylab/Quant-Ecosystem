// ============================================================================
// Performance Package - Type Definitions
// ============================================================================

/** LRU Cache configuration */
export interface LRUConfig {
  maxSize: number;
  ttlMs: number;
  enableStats: boolean;
  onEvict?: (key: string, value: unknown) => void;
  warmUpKeys?: string[];
}

/** Doubly-linked list node for LRU */
export interface LRUNode<T = unknown> {
  key: string;
  value: T;
  prev: LRUNode<T> | null;
  next: LRUNode<T> | null;
  createdAt: number;
  accessedAt: number;
  ttl: number;
  size: number;
}

/** Cache entry with metadata */
export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
  tags: string[];
  layer: CacheLayerType;
  hitCount: number;
  size: number;
}

/** Cache layer type */
export type CacheLayerType = 'L1_MEMORY' | 'L2_DISTRIBUTED' | 'L3_CDN';

/** Cache layer configuration */
export interface CacheLayerConfig {
  type: CacheLayerType;
  maxSize: number;
  ttlMs: number;
  enabled: boolean;
  readThrough: boolean;
  writeThrough: boolean;
}

/** Multi-layer cache configuration */
export interface MultiLayerCacheConfig {
  l1: CacheLayerConfig;
  l2: CacheLayerConfig;
  l3: CacheLayerConfig;
  coherenceProtocol: CoherenceProtocol;
  enableMetrics: boolean;
}

/** Cache coherence protocol type */
export type CoherenceProtocol = 'MESI' | 'MOESI' | 'WRITE_INVALIDATE' | 'WRITE_UPDATE';

/** Cache coherence state */
export type CoherenceState = 'MODIFIED' | 'EXCLUSIVE' | 'SHARED' | 'INVALID';

/** Distributed cache shard */
export interface CacheShard {
  id: string;
  nodeId: string;
  startHash: number;
  endHash: number;
  entries: number;
  lastSync: number;
}

/** CDN edge location */
export interface CDNEdgeLocation {
  id: string;
  region: string;
  latencyMs: number;
  hitRate: number;
  capacity: number;
  used: number;
}

/** Cache invalidation strategy */
export type InvalidationStrategy = 'TTL' | 'EVENT_DRIVEN' | 'TAG_BASED' | 'PATTERN' | 'DEPENDENCY';

/** Invalidation event */
export interface InvalidationEvent {
  id: string;
  strategy: InvalidationStrategy;
  target: string;
  tags: string[];
  timestamp: number;
  propagated: boolean;
  source: string;
}

/** Stampede prevention config */
export interface StampedeConfig {
  enabled: boolean;
  lockTimeoutMs: number;
  probabilisticEarlyExpiration: boolean;
  beta: number;
}

/** Request deduplication config */
export interface DeduplicationConfig {
  maxPendingRequests: number;
  timeoutMs: number;
  keyGenerator: (request: DeduplicationRequest) => string;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerResetMs: number;
}

/** Deduplication request */
export interface DeduplicationRequest {
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
}

/** Pending request tracking */
export interface PendingRequest<T = unknown> {
  key: string;
  promise: Promise<T>;
  startedAt: number;
  subscriberCount: number;
  timeoutId: ReturnType<typeof setTimeout> | null;
}

/** Connection pool configuration */
export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeoutMs: number;
  idleTimeoutMs: number;
  maxAge: number;
  maxUses: number;
  healthCheckIntervalMs: number;
  enableAffinity: boolean;
}

/** Pooled connection */
export interface PooledConnection {
  id: string;
  state: ConnectionState;
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
  healthScore: number;
  affinityKey?: string;
}

/** Connection state */
export type ConnectionState = 'IDLE' | 'ACTIVE' | 'DRAINING' | 'CLOSED' | 'HEALTH_CHECK';

/** Wait queue entry */
export interface WaitQueueEntry {
  id: string;
  resolve: (conn: PooledConnection) => void;
  reject: (err: Error) => void;
  enqueuedAt: number;
  timeoutId: ReturnType<typeof setTimeout>;
  affinityKey?: string;
}

/** Query plan */
export interface QueryPlan {
  id: string;
  query: string;
  estimatedCost: number;
  actualCost: number;
  scanType: ScanType;
  indexUsed: string | null;
  rowsExamined: number;
  rowsReturned: number;
  executionTimeMs: number;
}

/** Scan type */
export type ScanType = 'FULL_TABLE' | 'INDEX_SCAN' | 'INDEX_SEEK' | 'HASH_JOIN' | 'NESTED_LOOP';

/** Query optimization suggestion */
export interface QueryOptimization {
  query: string;
  suggestion: string;
  type: OptimizationType;
  estimatedImprovement: number;
  indexSuggestion?: IndexSuggestion;
}

/** Optimization type */
export type OptimizationType =
  | 'ADD_INDEX'
  | 'REWRITE_QUERY'
  | 'BATCH_QUERIES'
  | 'ELIMINATE_N_PLUS_1'
  | 'PARTITION';

/** Index suggestion */
export interface IndexSuggestion {
  table: string;
  columns: string[];
  type: 'BTREE' | 'HASH' | 'COMPOSITE' | 'COVERING';
  estimatedSize: number;
}

/** Compression configuration */
export interface CompressionConfig {
  algorithm: CompressionAlgorithm;
  level: number;
  minSize: number;
  contentTypes: string[];
  enableStreaming: boolean;
  dictionarySize: number;
}

/** Compression algorithm */
export type CompressionAlgorithm = 'GZIP' | 'BROTLI' | 'DEFLATE' | 'ZSTD';

/** Compression result */
export interface CompressionResult {
  originalSize: number;
  compressedSize: number;
  ratio: number;
  algorithm: CompressionAlgorithm;
  durationMs: number;
}

/** Lazy load configuration */
export interface LazyLoadConfig {
  rootMargin: string;
  threshold: number;
  fallbackSrc: string;
  progressive: boolean;
  priorityLevels: number;
  preconnectOrigins: string[];
}

/** Lazy load item */
export interface LazyLoadItem {
  id: string;
  src: string;
  priority: number;
  loaded: boolean;
  visible: boolean;
  loadStartTime: number;
  loadEndTime: number;
}

/** Virtual scroll configuration */
export interface VirtualScrollConfig {
  containerHeight: number;
  overscan: number;
  estimatedItemHeight: number;
  enableScrollAnchoring: boolean;
  recyclePoolSize: number;
  momentumDecay: number;
}

/** Scroll state */
export interface ScrollState {
  scrollTop: number;
  visibleStartIndex: number;
  visibleEndIndex: number;
  totalHeight: number;
  offsetTop: number;
  velocity: number;
  isScrolling: boolean;
}

/** Virtual scroll item */
export interface VirtualScrollItem {
  index: number;
  height: number;
  offset: number;
  data: unknown;
  recycled: boolean;
}

/** Code split configuration */
export interface CodeSplitConfig {
  entryPoints: string[];
  maxChunkSize: number;
  minChunkSize: number;
  sharedThreshold: number;
  preloadStrategy: PreloadStrategy;
}

/** Preload strategy */
export type PreloadStrategy = 'EAGER' | 'LAZY' | 'VIEWPORT' | 'INTERACTION' | 'IDLE';

/** Chunk info */
export interface ChunkInfo {
  id: string;
  name: string;
  modules: string[];
  size: number;
  isEntry: boolean;
  isShared: boolean;
  dependencies: string[];
  loadPriority: number;
}

/** Bundle metrics */
export interface BundleMetrics {
  totalSize: number;
  gzipSize: number;
  moduleCount: number;
  chunkCount: number;
  duplicateModules: string[];
  treeShakeableBytes: number;
  budgetStatus: BudgetStatus[];
}

/** Budget status */
export interface BudgetStatus {
  name: string;
  budget: number;
  actual: number;
  exceeded: boolean;
  delta: number;
}

/** Web Vitals metrics */
export interface WebVitalsMetrics {
  fcp: number;
  lcp: number;
  fid: number;
  cls: number;
  ttfb: number;
  timestamp: number;
  url: string;
  deviceType: string;
}

/** Percentile result */
export interface PercentileResult {
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  count: number;
}

/** Web Vitals threshold */
export interface VitalsThreshold {
  metric: string;
  good: number;
  needsImprovement: number;
  poor: number;
}

/** Vitals attribution */
export interface VitalsAttribution {
  metric: string;
  element?: string;
  source?: string;
  contribution: number;
  suggestion: string;
}

/** Preload hint */
export interface PreloadHint {
  href: string;
  as: ResourceType;
  type?: string;
  crossorigin?: boolean;
  media?: string;
  fetchPriority: FetchPriority;
  rel: 'preload' | 'prefetch' | 'preconnect' | 'dns-prefetch';
}

/** Resource type */
export type ResourceType = 'script' | 'style' | 'image' | 'font' | 'fetch' | 'document';

/** Fetch priority */
export type FetchPriority = 'high' | 'low' | 'auto';

/** Service worker configuration */
export interface ServiceWorkerConfig {
  cacheName: string;
  version: string;
  precacheUrls: string[];
  runtimeCachingRules: RuntimeCachingRule[];
  offlineFallback: string;
  skipWaiting: boolean;
  clientsClaim: boolean;
}

/** Runtime caching rule */
export interface RuntimeCachingRule {
  urlPattern: string;
  strategy: CacheStrategy;
  maxEntries: number;
  maxAge: number;
  networkTimeoutMs: number;
}

/** Cache strategy */
export type CacheStrategy =
  | 'CACHE_FIRST'
  | 'NETWORK_FIRST'
  | 'STALE_WHILE_REVALIDATE'
  | 'NETWORK_ONLY'
  | 'CACHE_ONLY';

/** Background sync queue item */
export interface SyncQueueItem {
  id: string;
  url: string;
  method: string;
  body?: string;
  headers: Record<string, string>;
  attempts: number;
  maxAttempts: number;
  lastAttempt: number;
  nextAttempt: number;
  status: SyncStatus;
  priority: number;
  createdAt: number;
}

/** Sync status */
export type SyncStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** Memory snapshot */
export interface MemorySnapshot {
  id: string;
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  objectCounts: Map<string, number>;
  retainedSizes: Map<string, number>;
}

/** Leak report */
export interface LeakReport {
  id: string;
  detectedAt: number;
  severity: LeakSeverity;
  growthRate: number;
  suspectedObjects: SuspectedLeak[];
  retentionPath: string[];
  recommendation: string;
}

/** Leak severity */
export type LeakSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** Suspected leak info */
export interface SuspectedLeak {
  objectType: string;
  count: number;
  retainedSize: number;
  growthPerSnapshot: number;
  allocationSite?: string;
}
