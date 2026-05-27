// ============================================================================
// Observability Package - Type Definitions
// ============================================================================

// --- Distributed Tracing Types ---

export type SpanKind = 'client' | 'server' | 'internal' | 'producer' | 'consumer';

export type SpanStatusCode = 'ok' | 'error' | 'unset';

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes: Record<string, string | number | boolean>;
}

export interface SpanLink {
  traceId: string;
  spanId: string;
  attributes: Record<string, string | number | boolean>;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  sampled: boolean;
  baggage: Record<string, string>;
}

export interface Span {
  id: string;
  traceId: string;
  parentId: string | null;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime: number | null;
  status: SpanStatus;
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  links: SpanLink[];
}

export interface TraceExport {
  traceId: string;
  spans: Span[];
  rootSpan: Span | null;
  duration: number;
  spanCount: number;
}

export interface SamplingConfig {
  headSamplingRate: number;
  tailSamplingEnabled: boolean;
  tailSamplingDurationThreshold: number;
  tailSamplingErrorOnly: boolean;
}

// --- Structured Logging Types ---

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  context: Record<string, unknown>;
  correlationId: string | null;
  traceId: string | null;
  spanId: string | null;
  attributes: Record<string, string | number | boolean>;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  serviceName: string;
  hostname: string;
  samplingRate: number;
  bufferSize: number;
  redactionPatterns: RedactionPattern[];
}

export interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  service?: string;
  hostname?: string;
  [key: string]: unknown;
}

// --- Metrics Types ---

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricLabels {
  [key: string]: string;
}

export interface Counter {
  name: string;
  value: number;
  labels: MetricLabels;
  type: 'counter';
  createdAt: number;
}

export interface Gauge {
  name: string;
  value: number;
  labels: MetricLabels;
  type: 'gauge';
  lastUpdated: number;
}

export interface HistogramBucket {
  upperBound: number;
  count: number;
}

export interface Histogram {
  name: string;
  buckets: HistogramBucket[];
  count: number;
  sum: number;
  labels: MetricLabels;
  type: 'histogram';
  min: number;
  max: number;
}

export interface SummaryQuantile {
  quantile: number;
  value: number;
}

export interface Summary {
  name: string;
  quantiles: SummaryQuantile[];
  count: number;
  sum: number;
  labels: MetricLabels;
  type: 'summary';
  window: number;
}

export interface MetricExport {
  name: string;
  type: MetricType;
  help: string;
  values: Array<{ labels: MetricLabels; value: number; timestamp: number }>;
}

export interface TimerResult {
  duration: number;
  startTime: number;
  endTime: number;
}

// --- Health Check Types ---

export type HealthStatusType = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheck {
  name: string;
  status: HealthStatusType;
  latency: number;
  message: string;
  critical: boolean;
  lastChecked: number;
}

export interface HealthStatus {
  status: HealthStatusType;
  checks: HealthCheck[];
  timestamp: number;
  uptime: number;
  version: string;
}

export interface HealthCheckRegistration {
  name: string;
  checkFn: () => Promise<HealthCheckResult>;
  timeout: number;
  critical: boolean;
  cooldown: number;
}

export interface HealthCheckResult {
  status: HealthStatusType;
  message: string;
}

export interface HealthHistory {
  timestamp: number;
  status: HealthStatusType;
  checks: HealthCheck[];
}

// --- Circuit Breaker Types ---

export type CircuitState = 'closed' | 'open' | 'halfOpen';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  halfOpenRequests: number;
  windowSize: number;
  volumeThreshold: number;
}

export interface CircuitBreakerMetrics {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  rejectedCount: number;
  stateTransitions: number;
  lastFailure: number | null;
  lastSuccess: number | null;
}

export interface CircuitBreakerEvent {
  type: 'stateChange' | 'success' | 'failure' | 'rejected';
  timestamp: number;
  state: CircuitState;
  previousState?: CircuitState;
  error?: string;
}

// --- Retry Types ---

export type BackoffStrategy = 'exponential' | 'linear' | 'constant';
export type JitterType = 'full' | 'equal' | 'decorrelated';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffStrategy: BackoffStrategy;
  jitterType: JitterType;
  retryableErrors: string[];
  nonRetryableErrors: string[];
  deadline: number | null;
}

export interface RetryMetrics {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  totalDelay: number;
  lastAttempt: number | null;
}

export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

// --- Bulkhead Types ---

export type BulkheadPriority = 'critical' | 'high' | 'normal' | 'low';

export interface BulkheadConfig {
  maxConcurrent: number;
  maxQueue: number;
  queueTimeout: number;
  priority: BulkheadPriority;
  adaptiveSizing: boolean;
}

export interface BulkheadMetrics {
  activeCount: number;
  queueDepth: number;
  totalExecuted: number;
  totalRejected: number;
  totalTimedOut: number;
  averageExecutionTime: number;
  averageQueueTime: number;
}

export interface BulkheadQueueItem<T> {
  fn: () => Promise<T>;
  priority: BulkheadPriority;
  enqueuedAt: number;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

// --- Timeout Types ---

export interface TimeoutConfig {
  defaultTimeout: number;
  deadline: number | null;
  propagate: boolean;
  adaptiveEnabled: boolean;
  adaptiveMultiplier: number;
}

export interface TimeoutContext {
  startTime: number;
  deadline: number;
  remaining: number;
  operation: string;
  parent: TimeoutContext | null;
}

export interface TimeoutResult<T> {
  value?: T;
  timedOut: boolean;
  elapsed: number;
  operation: string;
}

// --- Error Tracking Types ---

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  url?: string;
  method?: string;
  environment: string;
  release?: string;
  tags: Record<string, string>;
}

export interface Breadcrumb {
  timestamp: number;
  category: string;
  message: string;
  level: LogLevel;
  data?: Record<string, unknown>;
}

export interface ErrorGroup {
  fingerprint: string;
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  context: ErrorContext[];
  resolved: boolean;
  priority: number;
}

export interface StackFrame {
  functionName: string;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  source?: string;
}

export interface TrackedError {
  id: string;
  fingerprint: string;
  name: string;
  message: string;
  stack: StackFrame[];
  context: ErrorContext;
  breadcrumbs: Breadcrumb[];
  timestamp: number;
}

// --- Performance Profiling Types ---

export interface ProfileSample {
  functionName: string;
  duration: number;
  memory: number;
  callStack: string[];
  timestamp: number;
}

export interface CallTreeNode {
  functionName: string;
  totalTime: number;
  selfTime: number;
  callCount: number;
  children: CallTreeNode[];
  parent: string | null;
}

export interface FlameGraphEntry {
  name: string;
  value: number;
  children: FlameGraphEntry[];
  depth: number;
}

export interface ProfilingSession {
  id: string;
  startTime: number;
  endTime: number | null;
  samples: ProfileSample[];
  memorySnapshots: MemorySnapshot[];
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  allocations: number;
}

export interface PerformanceBudget {
  functionName: string;
  maxDuration: number;
  maxMemory: number;
}

// --- SLO Types ---

export interface SLODefinition {
  name: string;
  target: number;
  metric: string;
  window: number;
  burnRateThresholds: BurnRateThreshold[];
  description: string;
}

export interface BurnRateThreshold {
  severity: 'critical' | 'warning' | 'info';
  shortWindow: number;
  longWindow: number;
  burnRate: number;
}

export interface SLOStatus {
  slo: SLODefinition;
  currentValue: number;
  errorBudgetRemaining: number;
  burnRate: number;
  status: 'met' | 'at_risk' | 'violated';
  windowStart: number;
  windowEnd: number;
}

export interface SLOEvent {
  timestamp: number;
  success: boolean;
  latency?: number;
  metadata?: Record<string, string>;
}

export interface SLOReport {
  sloName: string;
  status: SLOStatus;
  burnRateAlerts: BurnRateAlert[];
  timeToExhaustion: number | null;
  recommendation: string;
}

export interface BurnRateAlert {
  severity: 'critical' | 'warning' | 'info';
  burnRate: number;
  threshold: number;
  triggered: boolean;
  window: string;
}

// --- Chaos Engineering Types ---

export type FaultType = 'error' | 'latency' | 'kill' | 'partition' | 'resource';

export interface ChaosExperiment {
  id: string;
  name: string;
  type: FaultType;
  config: FaultConfig;
  blastRadius: number;
  duration: number;
  active: boolean;
  startTime: number | null;
  endTime: number | null;
}

export interface FaultConfig {
  errorMessage?: string;
  errorRate?: number;
  latencyMs?: number;
  latencyDistribution?: 'fixed' | 'uniform' | 'normal';
  targetServices?: string[];
  resourceType?: 'memory' | 'cpu';
  resourceAmount?: number;
}

export interface SteadyStateHypothesis {
  name: string;
  metric: string;
  operator: 'lt' | 'gt' | 'eq' | 'between';
  value: number;
  tolerance: number;
}

export interface ExperimentResult {
  experimentId: string;
  startTime: number;
  endTime: number;
  hypothesisValid: boolean;
  observations: string[];
  metrics: Record<string, number>;
}

// --- Canary Analysis Types ---

export interface CanaryMetrics {
  metricName: string;
  baseline: number[];
  canary: number[];
  pValue: number;
  significant: boolean;
}

export type CanaryVerdict = 'pass' | 'fail' | 'inconclusive';

export interface CanaryConfig {
  confidenceLevel: number;
  minimumSampleSize: number;
  metrics: string[];
  analysisInterval: number;
  maxDuration: number;
}

export interface CanaryReport {
  verdict: CanaryVerdict;
  metrics: CanaryMetrics[];
  sampleSize: number;
  duration: number;
  timestamp: number;
  recommendation: string;
}

export interface CanaryWindow {
  startTime: number;
  endTime: number;
  baselineData: Record<string, number[]>;
  canaryData: Record<string, number[]>;
}

// --- Instrument Decorator Types ---

export interface InstrumentOptions {
  name?: string;
  recordArgs?: boolean;
}

// --- OTel Setup Types ---

export interface OTelConfig {
  serviceName: string;
  environment: string;
  samplingRate?: number;
  enableMetrics?: boolean;
  enableLogs?: boolean;
}

// --- Service SLO Types ---

export interface ServiceSLO {
  serviceName: string;
  availability: SLODefinition;
  latencyP95: SLODefinition;
  latencyP99: SLODefinition;
}

export interface SLOServiceConfig {
  services: ServiceSLO[];
}

// --- Synthetic Monitor Types ---

export interface ProbeConfig {
  url: string;
  interval: number;
  timeout: number;
  expectedStatus?: number;
  headers?: Record<string, string>;
}

export interface ProbeResult {
  name: string;
  success: boolean;
  latency: number;
  statusCode: number;
  timestamp: number;
  error?: string;
}

export interface JourneyStep {
  name: string;
  execute: () => Promise<boolean>;
  timeout?: number;
}

export interface JourneyResult {
  name: string;
  steps: Array<{ name: string; success: boolean; latency: number; error?: string }>;
  totalLatency: number;
  success: boolean;
}

// --- Dashboard Config Types ---

export interface DashboardPanel {
  title: string;
  type: 'graph' | 'stat' | 'gauge' | 'table';
  gridPos: { x: number; y: number; w: number; h: number };
  targets: Array<{ expr: string; legendFormat?: string }>;
}

export interface DashboardConfig {
  title: string;
  uid: string;
  panels: DashboardPanel[];
  tags: string[];
  editable: boolean;
  refresh: string;
}

// --- PagerDuty Types ---

export type PagerDutySeverity = 'critical' | 'error' | 'warning' | 'info';

export interface PagerDutyIncident {
  id: string;
  severity: PagerDutySeverity;
  title: string;
  description: string;
  service: string;
  status: 'triggered' | 'acknowledged' | 'resolved';
  createdAt: number;
  updatedAt: number;
  notes: string[];
}

export interface PagerDutyPayload {
  routing_key: string;
  event_action: 'trigger' | 'acknowledge' | 'resolve';
  dedup_key: string;
  payload: {
    summary: string;
    severity: PagerDutySeverity;
    source: string;
    component: string;
    custom_details: Record<string, unknown>;
  };
}

// --- Runbook Types ---

export interface RunbookTemplate {
  serviceName: string;
  alertType: string;
  content: string;
}

// --- Chaos Template Types ---

export interface ChaosTemplate {
  name: string;
  type: FaultType;
  defaultConfig: FaultConfig;
  defaultDuration: number;
  defaultBlastRadius: number;
}

// --- Browser RUM Types ---

export interface WebVitalMetric {
  name: 'CLS' | 'FID' | 'LCP' | 'TTFB' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

export interface UserJourneyStep {
  name: string;
  startTime: number;
  endTime: number;
  success: boolean;
  metadata?: Record<string, string>;
}

export interface UserJourneyRecord {
  id: string;
  name: string;
  steps: UserJourneyStep[];
  totalDuration: number;
  success: boolean;
  timestamp: number;
}

export interface RUMError {
  message: string;
  stack?: string;
  context: Record<string, unknown>;
  timestamp: number;
  url?: string;
  userAgent?: string;
}

export interface InteractionMeasurement {
  name: string;
  duration: number;
  timestamp: number;
}

export interface RUMConfig {
  endpoint: string;
  batchSize: number;
  flushInterval: number;
  sampleRate: number;
}

// --- PII Scrubber Types ---

export interface PIIPattern {
  name: string;
  regex: RegExp;
  replacement: string;
}

export interface RedactionStats {
  [patternName: string]: number;
}

// --- Alert Rule Generator Types ---

export interface AlertRule {
  name: string;
  expr: string;
  forDuration: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  runbook_url: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface AlertRuleGroup {
  name: string;
  rules: AlertRule[];
}

export interface SLOAlertConfig {
  target: number;
  metric: string;
  window: string;
  burnRateThresholds: Array<{
    severity: 'critical' | 'warning' | 'info';
    burnRate: number;
    shortWindow: string;
    longWindow: string;
  }>;
}

// --- Disaster Recovery Types ---

export interface BackupSchedule {
  id: string;
  service: string;
  rpo: number;
  frequency: string;
  retentionDays: number;
  type: 'full' | 'incremental' | 'differential';
  createdAt: number;
}

export interface BackupVerification {
  backupId: string;
  verified: boolean;
  integrityHash: string;
  sizeBytes: number;
  verifiedAt: number;
  issues: string[];
}

export interface DrillScenario {
  name: string;
  type: 'failover' | 'restore' | 'switchover' | 'data-loss';
  targetService: string;
  description: string;
}

export interface DrillResult {
  scenario: DrillScenario;
  success: boolean;
  actualRTO: number;
  targetRTO: number;
  steps: Array<{ name: string; duration: number; success: boolean }>;
  issues: string[];
  timestamp: number;
}

export interface RTOEstimate {
  service: string;
  estimatedRTO: number;
  factors: Array<{ name: string; duration: number }>;
  confidence: 'high' | 'medium' | 'low';
}

// --- Game Day Types ---

export interface GameDayPlan {
  id: string;
  name: string;
  scenarios: GameDayScenario[];
  team: string[];
  scheduledAt: number;
  status: 'planned' | 'in_progress' | 'completed';
}

export interface GameDayScenario {
  name: string;
  description: string;
  targetService: string;
  faultType: FaultType;
  duration: number;
  expectedImpact: string;
}

export interface GameDayResult {
  scenarioName: string;
  success: boolean;
  startTime: number;
  endTime: number;
  observations: string[];
  metrics: Record<string, number>;
}

export interface Postmortem {
  title: string;
  date: number;
  duration: number;
  impact: string;
  timeline: Array<{ time: number; event: string }>;
  rootCause: string;
  actionItems: Array<{ description: string; owner: string; dueDate: number }>;
  lessonsLearned: string[];
}
