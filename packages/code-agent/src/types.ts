export enum RepoProvider {
  github = 'github',
  gitlab = 'gitlab',
  bitbucket = 'bitbucket',
}
export enum PRState {
  open = 'open',
  closed = 'closed',
  merged = 'merged',
}
export enum CodeTaskType {
  implement = 'implement',
  fix = 'fix',
  refactor = 'refactor',
  test = 'test',
}
export enum TaskState {
  planning = 'planning',
  editing = 'editing',
  testing = 'testing',
  fixing = 'fixing',
  reviewing = 'reviewing',
  complete = 'complete',
  failed = 'failed',
}

export interface RepoConfig {
  provider: RepoProvider;
  owner: string;
  repo: string;
  token: string;
  baseUrl?: string;
}
export interface PRInfo {
  id: string;
  number: number;
  title: string;
  body: string;
  state: PRState;
  branch: string;
  baseBranch: string;
  url: string;
}
export interface FileTree {
  path: string;
  type: 'file' | 'dir';
  children?: FileTree[];
}
export interface RepoAnalysis {
  languages: string[];
  frameworks: string[];
  buildSystem: string | null;
  entryPoints: string[];
  testFiles: string[];
  configFiles: string[];
  summary: string;
}
export interface SandboxConfig {
  timeoutMs: number;
  memoryMb: number;
  cpuCores: number;
  diskMb: number;
  networkAccess: boolean;
}
export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}
export interface CodeTask {
  id: string;
  type: CodeTaskType;
  description: string;
  branch: string;
  state: TaskState;
  attempts: number;
  maxAttempts: number;
  tokenBudget: number;
  tokensUsed: number;
}
export interface CodeAuditEntry {
  id: string;
  timestamp: number;
  action: string;
  details: string;
  tokenCost?: number;
  filesChanged?: string[];
}

export type GitOperation =
  | { type: 'clone'; url: string }
  | { type: 'branch'; name: string }
  | { type: 'commit'; message: string; files: string[] }
  | { type: 'push'; branch: string; force?: boolean }
  | { type: 'diff'; base: string; head: string }
  | { type: 'log'; count: number };
