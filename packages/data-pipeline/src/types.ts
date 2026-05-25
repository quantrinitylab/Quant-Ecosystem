// ============================================================================
// Data Pipeline Package - Type Definitions
// ============================================================================

// ---------------------------------------------------------------------------
// Event Stream Types
// ---------------------------------------------------------------------------

/** Kafka-like topic configuration */
export interface Topic {
  name: string;
  partitions: number;
  replicationFactor: number;
  retentionMs: number;
  compactionEnabled: boolean;
  maxMessageSize: number;
  createdAt: number;
}

/** Topic partition with offset tracking */
export interface Partition {
  id: number;
  topicName: string;
  leader: string;
  replicas: string[];
  inSyncReplicas: string[];
  highWatermark: number;
  logStartOffset: number;
}

/** Consumer group for coordinated consumption */
export interface ConsumerGroup {
  groupId: string;
  members: ConsumerGroupMember[];
  state: ConsumerGroupState;
  assignmentStrategy: AssignmentStrategy;
  generationId: number;
  coordinatorId: string;
}

/** Member within a consumer group */
export interface ConsumerGroupMember {
  memberId: string;
  clientId: string;
  assignedPartitions: PartitionAssignment[];
  joinedAt: number;
  lastHeartbeat: number;
}

/** Partition assignment for a consumer */
export interface PartitionAssignment {
  topicName: string;
  partitionId: number;
}

/** Consumer group state */
export type ConsumerGroupState = 'stable' | 'rebalancing' | 'dead' | 'empty' | 'preparing';

/** Assignment strategy for partitions */
export type AssignmentStrategy = 'round-robin' | 'range' | 'sticky';

/** Offset position in a partition */
export interface Offset {
  topicName: string;
  partitionId: number;
  offset: number;
  metadata: string;
  committedAt: number;
}

/** Offset reset strategy */
export type OffsetReset = 'earliest' | 'latest' | 'specific';

/** Message in the event stream */
export interface Message {
  key: string | null;
  value: unknown;
  topic: string;
  partition: number;
  offset: number;
  timestamp: number;
  headers: Record<string, string>;
}

/** Batch of messages for efficient processing */
export interface MessageBatch {
  messages: Message[];
  topic: string;
  partition: number;
  firstOffset: number;
  lastOffset: number;
  batchSize: number;
}

/** Handler for subscription callbacks */
export interface SubscriptionHandler {
  onMessage: (message: Message) => void | Promise<void>;
  onError: (error: Error) => void;
  onRebalance?: (assignments: PartitionAssignment[]) => void;
}

// ---------------------------------------------------------------------------
// ETL Pipeline Types
// ---------------------------------------------------------------------------

/** ETL pipeline stage type */
export type ETLStageType = 'extract' | 'transform' | 'load';

/** Individual ETL stage */
export interface ETLStage {
  name: string;
  type: ETLStageType;
  config: ExtractConfig | TransformConfig | LoadConfig;
  retryPolicy: RetryPolicy;
  timeout: number;
  enabled: boolean;
}

/** Configuration for data extraction */
export interface ExtractConfig {
  source: ExtractSource;
  connectionString: string;
  query?: string;
  endpoint?: string;
  filePath?: string;
  batchSize: number;
  incrementalField?: string;
  lastExtractedValue?: unknown;
}

/** Extract source type */
export type ExtractSource = 'database' | 'api' | 'file' | 'stream' | 's3' | 'ftp';

/** Configuration for data transformation */
export interface TransformConfig {
  operations: TransformOperation[];
  errorHandling: 'skip' | 'fail' | 'quarantine';
  parallelism: number;
}

/** Transform operation types */
export interface TransformOperation {
  type: TransformType;
  config: Record<string, unknown>;
  name: string;
}

/** Types of transformations */
export type TransformType = 'map' | 'filter' | 'aggregate' | 'join' | 'deduplicate' | 'pivot' | 'unpivot' | 'enrich' | 'flatten';

/** Configuration for data loading */
export interface LoadConfig {
  destination: LoadDestination;
  connectionString: string;
  tableName?: string;
  mode: LoadMode;
  batchSize: number;
  conflictResolution: ConflictResolution;
}

/** Load destination type */
export type LoadDestination = 'database' | 'warehouse' | 'file' | 'api' | 's3' | 'elasticsearch';

/** Load mode */
export type LoadMode = 'insert' | 'upsert' | 'replace' | 'append';

/** Conflict resolution strategy */
export type ConflictResolution = 'skip' | 'overwrite' | 'merge' | 'error';

/** ETL pipeline configuration */
export interface PipelineConfig {
  name: string;
  stages: ETLStage[];
  schedule?: CronSchedule;
  maxRetries: number;
  alertOnFailure: boolean;
  timeout: number;
  tags: string[];
}

/** Pipeline execution status */
export interface PipelineStatus {
  pipelineId: string;
  name: string;
  state: PipelineState;
  currentStage: string;
  progress: number;
  startedAt: number;
  completedAt: number | null;
  recordsProcessed: number;
  recordsFailed: number;
  errors: PipelineError[];
  metrics: StageMetrics;
}

/** Pipeline state */
export type PipelineState = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** Pipeline error */
export interface PipelineError {
  stage: string;
  message: string;
  record?: unknown;
  timestamp: number;
  retryCount: number;
}

/** Result from a pipeline stage */
export interface StageResult {
  stageName: string;
  status: 'success' | 'partial' | 'failed';
  recordsIn: number;
  recordsOut: number;
  recordsErrored: number;
  duration: number;
  errors: PipelineError[];
}

/** Metrics for pipeline stages */
export interface StageMetrics {
  totalRecordsProcessed: number;
  totalRecordsFailed: number;
  totalDuration: number;
  throughputPerSecond: number;
  stageResults: StageResult[];
}

// ---------------------------------------------------------------------------
// Validation Types
// ---------------------------------------------------------------------------

/** Schema definition for validation */
export interface ValidationSchema {
  name: string;
  version: number;
  fields: FieldValidator[];
  strict: boolean;
  allowAdditionalFields: boolean;
}

/** Validation rule for a field */
export interface ValidationRule {
  type: ValidationRuleType;
  value?: unknown;
  message?: string;
}

/** Types of validation rules */
export type ValidationRuleType =
  | 'required'
  | 'type'
  | 'min'
  | 'max'
  | 'minLength'
  | 'maxLength'
  | 'regex'
  | 'enum'
  | 'custom'
  | 'email'
  | 'url'
  | 'uuid'
  | 'dateFormat';

/** Field-level validator */
export interface FieldValidator {
  path: string;
  type: FieldType;
  rules: ValidationRule[];
  coerce: boolean;
  defaultValue?: unknown;
  description?: string;
}

/** Supported field types */
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null' | 'any';

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationErrorDetail[];
  coercedData?: unknown;
  warnings: string[];
}

/** Validation error detail */
export interface ValidationErrorDetail {
  path: string;
  rule: ValidationRuleType;
  message: string;
  receivedValue: unknown;
  expectedValue?: unknown;
}

// ---------------------------------------------------------------------------
// Dead Letter Queue Types
// ---------------------------------------------------------------------------

/** Entry in the dead letter queue */
export interface DeadLetterEntry {
  id: string;
  originalMessage: Message;
  error: DeadLetterError;
  retryCount: number;
  maxRetries: number;
  firstFailedAt: number;
  lastFailedAt: number;
  nextRetryAt: number | null;
  status: DLQEntryStatus;
  metadata: Record<string, unknown>;
}

/** Error information for DLQ entries */
export interface DeadLetterError {
  type: ErrorCategory;
  message: string;
  stack?: string;
  code?: string;
}

/** Error category for classification */
export type ErrorCategory = 'transient' | 'permanent' | 'unknown' | 'validation' | 'timeout' | 'rate_limit';

/** Status of a DLQ entry */
export type DLQEntryStatus = 'pending' | 'retrying' | 'exhausted' | 'resolved' | 'purged';

/** DLQ configuration */
export interface DLQConfig {
  maxRetries: number;
  retryPolicy: RetryPolicy;
  maxAge: number;
  maxSize: number;
  alertThreshold: number;
  autoRetryEnabled: boolean;
}

/** Retry policy configuration */
export interface RetryPolicy {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: ErrorCategory[];
}

// ---------------------------------------------------------------------------
// Batch Scheduler Types
// ---------------------------------------------------------------------------

/** Batch job definition */
export interface BatchJob {
  id: string;
  name: string;
  schedule: CronSchedule;
  handler: string;
  config: BatchConfig;
  dependencies: JobDependency[];
  status: JobStatus;
  lastRun: JobRun | null;
  nextRunAt: number | null;
  enabled: boolean;
  createdAt: number;
}

/** Cron schedule expression */
export interface CronSchedule {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  expression: string;
}

/** Job dependency definition */
export interface JobDependency {
  jobId: string;
  type: DependencyType;
  timeout: number;
}

/** Dependency type */
export type DependencyType = 'success' | 'completion' | 'failure';

/** Batch job configuration */
export interface BatchConfig {
  queue: string;
  priority: number;
  timeout: number;
  concurrencyLimit: number;
  retryPolicy: RetryPolicy;
  tags: string[];
}

/** Job status */
export type JobStatus = 'scheduled' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_dependency';

/** Job run record */
export interface JobRun {
  runId: string;
  jobId: string;
  status: JobStatus;
  startedAt: number;
  completedAt: number | null;
  duration: number;
  result?: unknown;
  error?: string;
  attempts: number;
}

// ---------------------------------------------------------------------------
// Aggregation Types
// ---------------------------------------------------------------------------

/** Aggregation window configuration */
export interface AggregationWindow {
  id: string;
  type: WindowType;
  size: number;
  slide?: number;
  gap?: number;
  aggregations: AggregateFunction[];
  groupBy: string[];
  watermarkDelay: number;
}

/** Window type for aggregation */
export type WindowType = 'tumbling' | 'sliding' | 'session';

/** Aggregate function definition */
export interface AggregateFunction {
  name: string;
  type: AggregateFunctionType;
  field: string;
  alias: string;
  percentile?: number;
}

/** Types of aggregate functions */
export type AggregateFunctionType = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'percentile' | 'distinct_count' | 'first' | 'last' | 'stddev' | 'variance';

/** Window result */
export interface WindowResult {
  windowId: string;
  windowStart: number;
  windowEnd: number;
  groupKey: string;
  aggregates: Record<string, number>;
  eventCount: number;
  isLate: boolean;
}

// ---------------------------------------------------------------------------
// Data Warehouse Types
// ---------------------------------------------------------------------------

/** Fact table definition */
export interface FactTable {
  name: string;
  grain: string[];
  measures: MeasureColumn[];
  dimensionKeys: DimensionKey[];
  partitionStrategy: PartitionStrategy;
  indexes: IndexDefinition[];
}

/** Measure column in a fact table */
export interface MeasureColumn {
  name: string;
  type: 'integer' | 'decimal' | 'bigint';
  aggregation: AggregateFunctionType;
  nullable: boolean;
}

/** Foreign key to a dimension table */
export interface DimensionKey {
  name: string;
  dimensionTable: string;
  dimensionColumn: string;
}

/** Dimension table definition */
export interface DimensionTable {
  name: string;
  columns: DimensionColumn[];
  hierarchies: Hierarchy[];
  scdType: SCDType;
  naturalKey: string[];
}

/** Column in a dimension table */
export interface DimensionColumn {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
}

/** Hierarchy within a dimension */
export interface Hierarchy {
  name: string;
  levels: string[];
}

/** Slowly changing dimension type */
export type SCDType = 'type1' | 'type2' | 'type3';

/** Star schema definition */
export interface StarSchema {
  name: string;
  factTable: FactTable;
  dimensions: DimensionTable[];
  description: string;
  version: number;
}

/** Partition strategy configuration */
export interface PartitionStrategy {
  type: PartitionType;
  column: string;
  granularity?: string;
  numPartitions?: number;
}

/** Partition type */
export type PartitionType = 'date' | 'range' | 'hash' | 'list' | 'region';

/** Index definition */
export interface IndexDefinition {
  name: string;
  columns: string[];
  type: 'btree' | 'hash' | 'bitmap';
  unique: boolean;
}

/** Slowly changing dimension configuration */
export interface SlowlyChangingDimension {
  dimensionTable: string;
  type: SCDType;
  trackedColumns: string[];
  effectiveDateColumn: string;
  expirationDateColumn?: string;
  currentFlagColumn?: string;
  versionColumn?: string;
}

// ---------------------------------------------------------------------------
// Materialized View Types
// ---------------------------------------------------------------------------

/** Materialized view definition */
export interface MaterializedView {
  id: string;
  name: string;
  query: string;
  sourceTables: string[];
  refreshPolicy: ViewRefreshPolicy;
  dependencies: ViewDependency[];
  lastRefreshedAt: number | null;
  status: ViewStatus;
  rowCount: number;
  sizeBytes: number;
}

/** View refresh policy */
export interface ViewRefreshPolicy {
  type: RefreshType;
  schedule?: CronSchedule;
  triggerTables?: string[];
  staleness: number;
}

/** Refresh type */
export type RefreshType = 'incremental' | 'full' | 'on_demand' | 'on_change' | 'periodic';

/** View dependency */
export interface ViewDependency {
  sourceTable: string;
  columns: string[];
  type: 'read' | 'aggregate' | 'join';
}

/** View status */
export type ViewStatus = 'fresh' | 'stale' | 'refreshing' | 'error' | 'disabled';

// ---------------------------------------------------------------------------
// User Behavior Types
// ---------------------------------------------------------------------------

/** User session definition */
export interface UserSession {
  sessionId: string;
  userId: string;
  events: SessionEvent[];
  startedAt: number;
  endedAt: number;
  duration: number;
  deviceType: string;
  referrer: string;
  landingPage: string;
}

/** Event within a session */
export interface SessionEvent {
  id: string;
  type: string;
  name: string;
  properties: Record<string, unknown>;
  timestamp: number;
  page: string;
  elementId?: string;
}

/** Funnel definition for conversion analysis */
export interface FunnelDefinition {
  name: string;
  steps: FunnelStep[];
  timeWindow: number;
  strictOrdering: boolean;
}

/** Individual funnel step */
export interface FunnelStep {
  name: string;
  eventType: string;
  conditions?: Record<string, unknown>;
}

/** Funnel analysis result */
export interface FunnelResult {
  funnelName: string;
  totalUsers: number;
  steps: FunnelStepResult[];
  overallConversionRate: number;
  averageTimeToComplete: number;
}

/** Result for individual funnel step */
export interface FunnelStepResult {
  stepName: string;
  usersEntered: number;
  usersCompleted: number;
  conversionRate: number;
  dropOffRate: number;
  averageTimeInStep: number;
}

/** Node in path analysis */
export interface PathNode {
  page: string;
  visits: number;
  nextPages: PathTransition[];
  previousPages: PathTransition[];
  exitRate: number;
  averageDuration: number;
}

/** Transition between path nodes */
export interface PathTransition {
  targetPage: string;
  count: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Growth Metrics Types
// ---------------------------------------------------------------------------

/** Growth metrics snapshot */
export interface GrowthMetrics {
  dau: number;
  wau: number;
  mau: number;
  dauWauRatio: number;
  dauMauRatio: number;
  growthRate: number;
  activationRate: number;
  date: number;
}

/** Retention cohort data */
export interface RetentionCohort {
  cohortDate: string;
  cohortSize: number;
  retentionByDay: Record<number, number>;
  retentionByWeek: Record<number, number>;
  averageRetention: number;
}

/** Churn prediction output */
export interface ChurnPrediction {
  userId: string;
  churnProbability: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: ChurnFactor[];
  predictedChurnDate: number | null;
  lastActivityAt: number;
}

/** Factors contributing to churn */
export interface ChurnFactor {
  name: string;
  weight: number;
  description: string;
}

/** Active user metrics */
export interface ActiveUserMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  returningUsers: number;
  reactivatedUsers: number;
  churned: number;
  powerUsers: number;
  casualUsers: number;
}

// ---------------------------------------------------------------------------
// Revenue Metrics Types
// ---------------------------------------------------------------------------

/** Revenue metrics snapshot */
export interface RevenueMetrics {
  mrr: number;
  arr: number;
  arpu: number;
  arppu: number;
  ltv: number;
  cac: number;
  ltvCacRatio: number;
  quickRatio: number;
  date: number;
}

/** MRR movement tracking */
export interface MRRMovement {
  period: string;
  newMRR: number;
  expansionMRR: number;
  contractionMRR: number;
  churnMRR: number;
  reactivationMRR: number;
  netNewMRR: number;
  totalMRR: number;
}

/** Lifetime value estimate */
export interface LTVEstimate {
  segment: string;
  averageLTV: number;
  medianLTV: number;
  averageLifespan: number;
  averageMonthlyRevenue: number;
  churnRate: number;
  confidenceInterval: [number, number];
}

/** Customer acquisition cost metrics */
export interface CACMetrics {
  channel: string;
  totalSpend: number;
  customersAcquired: number;
  cac: number;
  paybackPeriod: number;
  roi: number;
}

/** Quick ratio for SaaS health */
export interface QuickRatio {
  period: string;
  newMRR: number;
  expansionMRR: number;
  contractionMRR: number;
  churnMRR: number;
  ratio: number;
  healthy: boolean;
}
