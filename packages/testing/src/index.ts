// ============================================================================
// Quant Ecosystem - Testing Framework
// Complete testing infrastructure with 14 modules
// ============================================================================

// Types
export type {
  TestSuite,
  TestCase,
  TestResult,
  TestError,
  TestHook,
  TestReporter,
  TestRunSummary,
  TestRunnerConfig,
  Assertion,
  Matcher,
  MatcherResult,
  MockFn,
  MockResult,
  SpyInstance,
  MockTimerConfig,
  ComponentRenderResult,
  DOMNode,
  FireEventConfig,
  ComponentDefinition,
  SnapshotData,
  SnapshotFile,
  SnapshotDiff,
  MockEntity,
  MockUser,
  MockPost,
  MockMessage,
  MockEmail,
  APIRoute,
  APIRequest,
  APIResponse,
  WSMessage,
  WSConnection,
  WSTestConfig,
  LoadTestConfig,
  RampUpConfig,
  LoadScenario,
  LoadStep,
  LoadTestResult,
  LatencyStats,
  LatencyBucket,
  E2EConfig,
  E2EStep,
  E2EScenario,
  E2EResult,
  E2EStepResult,
  CoverageData,
  FileCoverage,
  LinesCoverage,
  BranchCoverage,
  BranchInfo,
  FunctionCoverage,
  CoverageSummary,
  CoverageThresholds,
  Fixture,
  FixtureInstance,
  SeedDefinition,
  SeedResult,
  TimeState,
  MockTimer,
  MockInterval,
  InterceptedRequest,
  InterceptRule,
  InterceptResponse,
  RecordedExchange,
  CoverageGateConfig,
  CoverageGateResult,
  PackageCoverageResult,
  MutationGateConfig,
  MutationGateResult,
} from './types';

// Core Modules
export { TestRunner } from './core/test-runner';
export { Expect, expect, registerMatcher, clearMatchers, deepEqual } from './core/assertions';
export { MockSystem, createMockFn, mockObject, createSequenceMock } from './core/mock-system';
export { ComponentTester, fireEvent, createScreen } from './core/component-tester';
export { SnapshotTester, serialize, generateDiff } from './core/snapshot-tester';
export { MockFactory } from './core/mock-factory';
export { APIMocker } from './core/api-mocker';
export { WSTestClient } from './core/websocket-client';
export { LoadTester } from './core/load-tester';
export { E2ERunner } from './core/e2e-runner';
export { CoverageReporter } from './core/coverage-reporter';
export { FixtureManager } from './core/fixture-manager';
export { DatabaseSeeder } from './core/database-seeder';
export { TimeController } from './core/time-controller';
export { NetworkInterceptor } from './core/network-interceptor';

// Quality Gates
export { CoverageGate, runCoverageGate } from './coverage-gate';
export { MutationGate, generateStrykerConfig, runMutationGate } from './mutation-gate';

// E2E Framework
export { journeys } from './e2e/journeys';
export {
  navigateTo,
  clickElement,
  typeText,
  assertVisible,
  assertText,
  assertUrl,
  waitFor,
  selectOption,
  createJourney,
} from './e2e/helpers';

// Load Testing
export * from './load/index';

// Security Scanning
export * from './security/index';

// Route Validation
export { RouteValidator } from './core/route-validator';
export type {
  RouteDefinition,
  RouteValidationResult,
  RouteError,
  RouteWarning,
} from './core/route-validator';
