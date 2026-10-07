// ============================================================================
// Observability Package - Barrel Export
// ============================================================================

export { DistributedTracer } from './core/distributed-tracer';
export { StructuredLogger } from './core/structured-logger';
export { MetricsCollector } from './core/metrics-collector';
export { HealthChecker } from './core/health-checker';
export { CircuitBreaker } from './core/circuit-breaker';
export { RetryHandler } from './core/retry-handler';
export { Bulkhead } from './core/bulkhead';
export { TimeoutManager, TimeoutError } from './core/timeout-manager';
export { ErrorTracker } from './core/error-tracker';
export { PerformanceProfiler } from './core/performance-profiler';
export { SLOTracker } from './core/slo-tracker';
export { ChaosEngine } from './core/chaos-engineering';
export { CanaryAnalyzer } from './core/canary-analyzer';

export { instrument } from './instrument';
export { OTelSetup } from './otel-setup';
export { ServiceSLODefinitions } from './slo-definitions';
export { BurnRateCalculator } from './slo-burn-rate';
export { ChaosExperimentRunner } from './chaos-experiments';
export { RunbookGenerator } from './runbook-generator';
export { SyntheticMonitor, type HttpClientFn } from './synthetic-monitor';
export { DashboardConfigGenerator } from './dashboard-config';
export { PagerDutyIntegration } from './pagerduty-integration';
export { BrowserRUM } from './browser-rum';
export { PIIScrubber } from './pii-scrubber';
export { AlertRuleGenerator } from './alert-rules';
export { DisasterRecovery } from './disaster-recovery';
export { GameDayRunner } from './game-day';

export type {
  TraceContext,
  Span,
  SpanKind,
  SpanStatus,
  SpanStatusCode,
  SpanEvent,
  SpanLink,
  TraceExport,
  SamplingConfig,
  LogEntry,
  LogLevel,
  LoggerConfig,
  LogContext,
  RedactionPattern,
  MetricType,
  MetricLabels,
  Counter,
  Gauge,
  Histogram,
  HistogramBucket,
  Summary,
  SummaryQuantile,
  MetricExport,
  TimerResult,
  HealthStatus,
  HealthStatusType,
  HealthCheck,
  HealthCheckRegistration,
  HealthCheckResult,
  HealthHistory,
  CircuitState,
  CircuitBreakerConfig,
  CircuitBreakerMetrics,
  CircuitBreakerEvent,
  BackoffStrategy,
  JitterType,
  RetryConfig,
  RetryMetrics,
  RetryResult,
  BulkheadConfig,
  BulkheadMetrics,
  BulkheadPriority,
  BulkheadQueueItem,
  TimeoutConfig,
  TimeoutContext,
  TimeoutResult,
  ErrorContext,
  Breadcrumb,
  ErrorGroup,
  StackFrame,
  TrackedError,
  ProfileSample,
  CallTreeNode,
  FlameGraphEntry,
  ProfilingSession,
  MemorySnapshot,
  PerformanceBudget,
  SLODefinition,
  SLOStatus,
  SLOEvent,
  SLOReport,
  BurnRateAlert,
  BurnRateThreshold,
  FaultType,
  ChaosExperiment,
  FaultConfig,
  SteadyStateHypothesis,
  ExperimentResult,
  CanaryMetrics,
  CanaryVerdict,
  CanaryConfig,
  CanaryReport,
  CanaryWindow,
  InstrumentOptions,
  OTelConfig,
  ServiceSLO,
  SLOServiceConfig,
  ProbeConfig,
  ProbeResult,
  JourneyStep,
  JourneyResult,
  DashboardPanel,
  DashboardConfig,
  PagerDutySeverity,
  PagerDutyIncident,
  PagerDutyPayload,
  RunbookTemplate,
  ChaosTemplate,
  WebVitalMetric,
  UserJourneyStep,
  UserJourneyRecord,
  RUMError,
  InteractionMeasurement,
  RUMConfig,
  PIIPattern,
  RedactionStats,
  AlertRule,
  AlertRuleGroup,
  SLOAlertConfig,
  BackupSchedule,
  BackupVerification,
  DrillScenario,
  DrillResult,
  RTOEstimate,
  GameDayPlan,
  GameDayScenario,
  GameDayResult,
  Postmortem,
} from './types';

// OpenTelemetry SDK integration
export {
  initTracing,
  getActiveTraceContext,
  trace,
  context,
  SpanStatusCode as OTelSpanStatusCode,
  initMetrics,
  getMeter,
  createHttpMetrics,
} from './sdk/index';
export type {
  TracingConfig,
  OTelSpan,
  Tracer,
  MetricsConfig,
  Counter as OTelCounter,
  Histogram as OTelHistogram,
  Meter as OTelMeter,
  LoggerConfig as OTelLoggerConfig,
} from './sdk/index';
