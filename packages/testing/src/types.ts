// ============================================================================
// Quant Ecosystem - Testing Framework Types
// Complete type definitions for testing infrastructure
// ============================================================================

// === Test Runner Types ===

export interface TestSuite {
  name: string;
  tests: TestCase[];
  suites: TestSuite[];
  beforeAll: TestHook[];
  afterAll: TestHook[];
  beforeEach: TestHook[];
  afterEach: TestHook[];
  only: boolean;
  skip: boolean;
  timeout: number;
  parent: TestSuite | null;
}

export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
  timeout: number;
  skip: boolean;
  only: boolean;
  todo: boolean;
  suite: TestSuite;
  retries: number;
}

export interface TestResult {
  testName: string;
  suiteName: string;
  status: 'passed' | 'failed' | 'skipped' | 'todo';
  duration: number;
  error: TestError | null;
  retries: number;
  timestamp: number;
}

export interface TestError {
  message: string;
  stack: string;
  expected?: unknown;
  actual?: unknown;
  operator?: string;
}

export interface TestHook {
  fn: () => void | Promise<void>;
  timeout: number;
}

export interface TestReporter {
  onSuiteStart(suite: TestSuite): void;
  onSuiteEnd(suite: TestSuite, results: TestResult[]): void;
  onTestPass(result: TestResult): void;
  onTestFail(result: TestResult): void;
  onTestSkip(result: TestResult): void;
  onComplete(results: TestRunSummary): void;
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  duration: number;
  suites: number;
  results: TestResult[];
}

export interface TestRunnerConfig {
  timeout: number;
  parallel: boolean;
  maxConcurrency: number;
  bail: boolean;
  reporter: TestReporter | null;
  retries: number;
}

// === Assertion Types ===

export interface Assertion<T = unknown> {
  value: T;
  negated: boolean;
  toBe(expected: T): void;
  toEqual(expected: T): void;
  toDeepEqual(expected: T): void;
  toThrow(message?: string | RegExp): void;
  toThrowError(message?: string | RegExp): void;
  toBeNull(): void;
  toBeUndefined(): void;
  toBeDefined(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toContain(item: unknown): void;
  toMatch(pattern: RegExp | string): void;
  toBeGreaterThan(n: number): void;
  toBeLessThan(n: number): void;
  toBeCloseTo(n: number, precision?: number): void;
  toHaveLength(length: number): void;
  toHaveProperty(path: string, value?: unknown): void;
  toBeInstanceOf(constructor: Function): void;
  toMatchObject(partial: Record<string, unknown>): void;
  not: Assertion<T>;
}

export interface Matcher {
  name: string;
  fn: (received: unknown, ...args: unknown[]) => MatcherResult;
}

export interface MatcherResult {
  pass: boolean;
  message: string;
}

// === Mock System Types ===

export interface MockFn<TArgs extends unknown[] = unknown[], TReturn = unknown> {
  (...args: TArgs): TReturn;
  calls: TArgs[];
  lastCall: TArgs | undefined;
  callCount: number;
  results: MockResult<TReturn>[];
  mockReturnValue(value: TReturn): MockFn<TArgs, TReturn>;
  mockReturnValueOnce(value: TReturn): MockFn<TArgs, TReturn>;
  mockImplementation(fn: (...args: TArgs) => TReturn): MockFn<TArgs, TReturn>;
  mockImplementationOnce(fn: (...args: TArgs) => TReturn): MockFn<TArgs, TReturn>;
  mockReset(): void;
  mockClear(): void;
  mockRestore(): void;
  mockName(name: string): MockFn<TArgs, TReturn>;
  getMockName(): string;
}

export interface MockResult<T> {
  type: 'return' | 'throw';
  value: T;
}

export interface SpyInstance {
  object: Record<string, unknown>;
  method: string;
  original: Function;
  mock: MockFn;
  restore(): void;
}

export interface MockTimerConfig {
  now: number;
  toFake: ('setTimeout' | 'setInterval' | 'Date')[];
}

// === Component Tester Types ===

export interface ComponentRenderResult {
  container: DOMNode;
  getByText(text: string): DOMNode;
  getByRole(role: string): DOMNode;
  getByTestId(testId: string): DOMNode;
  queryByText(text: string): DOMNode | null;
  queryByRole(role: string): DOMNode | null;
  queryByTestId(testId: string): DOMNode | null;
  queryAllByText(text: string): DOMNode[];
  queryAllByRole(role: string): DOMNode[];
  rerender(props: Record<string, unknown>): void;
  unmount(): void;
  debug(): string;
}

export interface DOMNode {
  tag: string;
  props: Record<string, unknown>;
  children: (DOMNode | string)[];
  textContent: string;
  role?: string;
  testId?: string;
  events: Map<string, Function[]>;
  parent: DOMNode | null;
}

export interface FireEventConfig {
  bubbles: boolean;
  cancelable: boolean;
  target?: Record<string, unknown>;
}

export interface ComponentDefinition {
  render: (props: Record<string, unknown>) => DOMNode;
  state?: Record<string, unknown>;
  effects?: Function[];
}

// === Snapshot Types ===

export interface SnapshotData {
  key: string;
  value: string;
  timestamp: number;
  counter: number;
}

export interface SnapshotFile {
  path: string;
  snapshots: Map<string, SnapshotData>;
  obsolete: string[];
}

export interface SnapshotDiff {
  expected: string;
  received: string;
  diff: string;
  pass: boolean;
}

// === Mock Factory Types ===

export interface MockEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockUser extends MockEntity {
  name: string;
  email: string;
  avatar: string;
  age: number;
  role: 'admin' | 'user' | 'moderator';
  verified: boolean;
}

export interface MockPost extends MockEntity {
  title: string;
  content: string;
  authorId: string;
  likes: number;
  comments: number;
  tags: string[];
  published: boolean;
}

export interface MockMessage extends MockEntity {
  senderId: string;
  recipientId: string;
  content: string;
  read: boolean;
  type: 'text' | 'image' | 'video' | 'file';
}

export interface MockEmail extends MockEntity {
  from: string;
  to: string[];
  subject: string;
  body: string;
  attachments: string[];
  read: boolean;
  starred: boolean;
}

// === API Mocker Types ===

export interface APIRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  handler: (req: APIRequest) => APIResponse;
  delay: number;
  calls: APIRequest[];
}

export interface APIRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface APIResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  delay?: number;
}

// === WebSocket Types ===

export interface WSMessage {
  type: string;
  payload: unknown;
  timestamp: number;
  id: string;
}

export interface WSConnection {
  id: string;
  state: 'connecting' | 'open' | 'closing' | 'closed';
  messages: WSMessage[];
  latency: number;
}

export interface WSTestConfig {
  url: string;
  protocols: string[];
  autoReconnect: boolean;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  latencyMs: number;
}

// === Load Test Types ===

export interface LoadTestConfig {
  targetUrl: string;
  virtualUsers: number;
  duration: number;
  rampUp: RampUpConfig;
  thinkTime: number;
  requestsPerSecond: number;
  timeout: number;
  scenarios: LoadScenario[];
}

export interface RampUpConfig {
  pattern: 'linear' | 'step' | 'spike';
  duration: number;
  steps?: number;
}

export interface LoadScenario {
  name: string;
  weight: number;
  steps: LoadStep[];
}

export interface LoadStep {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  duration: number;
  throughput: number;
  latency: LatencyStats;
  errorRate: number;
  saturationPoint: number | null;
}

export interface LatencyStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  buckets: LatencyBucket[];
}

export interface LatencyBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
  percentage: number;
}

// === E2E Types ===

export interface E2EConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  parallel: boolean;
  screenshots: boolean;
  headless: boolean;
}

export interface E2EStep {
  type: 'given' | 'when' | 'then';
  action: string;
  selector?: string;
  value?: string;
  timeout?: number;
}

export interface E2EScenario {
  name: string;
  steps: E2EStep[];
  tags: string[];
  retries: number;
}

export interface E2EResult {
  scenario: string;
  status: 'passed' | 'failed' | 'skipped';
  steps: E2EStepResult[];
  duration: number;
  screenshots: string[];
  error?: string;
}

export interface E2EStepResult {
  step: E2EStep;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

// === Coverage Types ===

export interface CoverageData {
  files: Map<string, FileCoverage>;
  summary: CoverageSummary;
  timestamp: number;
}

export interface FileCoverage {
  path: string;
  lines: LinesCoverage;
  branches: BranchCoverage;
  functions: FunctionCoverage;
}

export interface LinesCoverage {
  total: number;
  covered: number;
  uncovered: number[];
  percentage: number;
}

export interface BranchCoverage {
  total: number;
  covered: number;
  uncoveredBranches: BranchInfo[];
  percentage: number;
}

export interface BranchInfo {
  line: number;
  type: 'if' | 'else' | 'ternary' | 'switch-case';
  taken: boolean;
}

export interface FunctionCoverage {
  total: number;
  covered: number;
  uncoveredFunctions: string[];
  percentage: number;
}

export interface CoverageSummary {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

export interface CoverageThresholds {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

// === Fixture Types ===

export interface Fixture<T = unknown> {
  name: string;
  factory: () => T | Promise<T>;
  teardown?: (value: T) => void | Promise<void>;
  shared: boolean;
  lazy: boolean;
  parent?: string;
  params?: Record<string, unknown>;
}

export interface FixtureInstance<T = unknown> {
  name: string;
  value: T;
  initialized: boolean;
  dependencies: string[];
}

// === Database Seeder Types ===

export interface SeedDefinition {
  table: string;
  records: Record<string, unknown>[];
  dependencies: string[];
  truncateFirst: boolean;
}

export interface SeedResult {
  table: string;
  inserted: number;
  duration: number;
}

// === Time Controller Types ===

export interface TimeState {
  frozen: boolean;
  currentTime: number;
  timers: MockTimer[];
  intervals: MockInterval[];
  originalDate: DateConstructor;
}

export interface MockTimer {
  id: number;
  callback: Function;
  delay: number;
  scheduledAt: number;
  cancelled: boolean;
}

export interface MockInterval {
  id: number;
  callback: Function;
  interval: number;
  lastRun: number;
  cancelled: boolean;
}

// === Network Interceptor Types ===

export interface InterceptedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  timestamp: number;
}

export interface InterceptRule {
  urlPattern: string | RegExp;
  method?: string;
  headers?: Record<string, string>;
  response: InterceptResponse;
}

export interface InterceptResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  delay?: number;
  error?: 'timeout' | 'dns' | 'connection_refused' | 'network_error';
}

export interface RecordedExchange {
  request: InterceptedRequest;
  response: InterceptResponse;
  duration: number;
}

// === Coverage Gate Types ===

export interface CoverageGateConfig {
  threshold: number;
  criticalPackages: string[];
  coverageDir: string;
}

export interface CoverageGateResult {
  pass: boolean;
  results: PackageCoverageResult[];
  summary: string;
}

export interface PackageCoverageResult {
  packageName: string;
  lineCoverage: number;
  threshold: number;
  pass: boolean;
}

// === Mutation Gate Types ===

export interface MutationGateConfig {
  threshold: number;
  targetPackages: string[];
  reporters: string[];
  incremental: boolean;
}

export interface MutationGateResult {
  pass: boolean;
  mutationScore: number;
  threshold: number;
  killed: number;
  survived: number;
  noCoverage: number;
  totalMutants: number;
}
