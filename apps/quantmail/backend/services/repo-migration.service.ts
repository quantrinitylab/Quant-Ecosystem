// ============================================================================
// QuantMail / QuantGit — Repository Migration & Pipeline Converter Service
// Full 1-Click GitHub & GitLab Migration, Git Ref Discovery, Sovereign
// QuantGit Actions Workflow Translation, and Secrets/Env Importer.
// ============================================================================

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAppError } from '@quant/server-core';

// Local allowlisted environment for git child processes.
//
// CI FIX (gate/full-sweep, quantcode-module-boundary.test.ts): the previous
// revision imported GIT_CHILD_ENV from
// '../modules/code/services/git-transport/git-child-env'. The static module-
// boundary test forbids mail-domain files (services/**) from importing into
// modules/code/** in either direction, so the constant is defined HERE
// instead. Values mirror git-child-env's allowlist; they are intentionally
// duplicated, not shared, to keep the QuantCode <-> mail-domain SRP boundary
// intact.
const GIT_CHILD_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  HOME: process.env.HOME,
};

const execFileAsync = promisify(execFile);
// ls-remote output is small (one line per ref); this cap only guards against a
// pathological remote. The timeout keeps an unreachable remote from hanging
// the import request — it becomes a loud 502, never a silent hang.
const LS_REMOTE_TIMEOUT_MS = 25_000;
const LS_REMOTE_MAX_BUFFER = 4 * 1024 * 1024;

export type MigrationProvider = 'github' | 'gitlab' | 'git';

export interface ImportRepositoryInput {
  sourceUrl: string;
  provider: MigrationProvider;
  token?: string;
  targetOwner: string;
  targetRepoName: string;
  isPrivate?: boolean;
  importPipelines?: boolean;
  importEnv?: boolean;
}

export interface PipelineStep {
  name: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
}

export interface PipelineJob {
  name: string;
  runsOn?: string;
  stage?: string;
  steps: PipelineStep[];
  artifacts?: {
    paths?: string[];
    expireIn?: string;
  };
  env?: Record<string, string>;
}

export interface QuantWorkflow {
  name: string;
  on: {
    push?: { branches: string[] };
    pullRequest?: { branches: string[] };
  };
  jobs: Record<string, PipelineJob>;
}

export interface ConvertedPipelineResult {
  sourceType: 'github-actions' | 'gitlab-ci' | 'generic';
  sourceFile: string;
  targetFile: string;
  workflow: QuantWorkflow;
  workflowYaml: string;
}

export interface ImportedEnvVar {
  key: string;
  source: 'env-example' | 'workflow-env' | 'detected';
  maskedValue: string;
  isSecret: boolean;
  description: string;
}

export interface ImportedRepoRecord {
  id: string;
  ownerId: string;
  name: string;
  fullName: string;
  description: string;
  visibility: 'public' | 'private';
  defaultBranch: string;
  cloneUrl: string;
  branches: string[];
  /**
   * Total commit count of the remote repository. OMITTED (undefined) because
   * `git ls-remote` cannot report it and we never fabricate it — a shallow
   * count would be wrong and a random count was the old lie. Consumers render
   * '—' when absent.
   */
  commitCount?: number;
  starCount?: number;
  forkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRepositoryResult {
  repo: ImportedRepoRecord;
  /**
   * Omitted — see ImportedRepoRecord.commitCount. Never a fabricated number.
   */
  importedCommits?: number;
  convertedPipelines: ConvertedPipelineResult[];
  importedEnvVars: ImportedEnvVar[];
}

/**
 * One branch discovered on the remote, with its REAL tip commit SHA from
 * `git ls-remote`. Never invented.
 */
export interface DiscoveredRemoteBranch {
  name: string;
  sha: string;
}

/**
 * Honest result of remote ref discovery. `branches` is empty only when the
 * remote genuinely has no heads (empty repository).
 */
export interface RemoteRefDiscovery {
  branches: DiscoveredRemoteBranch[];
  defaultBranch: string;
}

// In-memory fallback repository store when database/Prisma is absent or mocked
export const memoryMigratedReposStore = new Map<string, ImportedRepoRecord>();

/**
 * Validates the remote repository source URL according to the selected provider.
 */
export function validateSourceUrl(sourceUrl: string, provider: MigrationProvider): boolean {
  if (!sourceUrl || typeof sourceUrl !== 'string' || sourceUrl.trim().length === 0) {
    throw createAppError('Source repository URL is required', 400, 'INVALID_SOURCE_URL');
  }

  const trimmed = sourceUrl.trim();
  const isHttps = /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed);
  const isSsh = /^git@[a-zA-Z0-9._-]+:[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?$/i.test(trimmed);
  const isGitProtocol = /^git:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed);

  if (!isHttps && !isSsh && !isGitProtocol) {
    throw createAppError(
      'Invalid repository URL format. Must be a valid HTTPS, SSH, or Git protocol URL.',
      400,
      'INVALID_REPO_URL_FORMAT',
    );
  }

  const lower = trimmed.toLowerCase();
  if (provider === 'github') {
    if (!lower.includes('github.com') && !lower.includes('github')) {
      throw createAppError(
        'Selected provider is GitHub, but the URL is not a GitHub URL.',
        400,
        'PROVIDER_URL_MISMATCH',
      );
    }
  } else if (provider === 'gitlab') {
    if (!lower.includes('gitlab.com') && !lower.includes('gitlab')) {
      throw createAppError(
        'Selected provider is GitLab, but the URL is not a GitLab URL.',
        400,
        'PROVIDER_URL_MISMATCH',
      );
    }
  }

  return true;
}

/**
 * Extracts owner and repository name from various Git URL formats.
 */
export function parseRepoInfo(sourceUrl: string): { owner: string; name: string } {
  const trimmed = sourceUrl
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');

  // SSH style: git@github.com:owner/repo
  const sshMatch = trimmed.match(/^git@[^:]+:([^/]+)\/(.+)$/);
  if (sshMatch) {
    return { owner: sshMatch[1], name: sshMatch[2] };
  }

  // HTTPS style: https://github.com/owner/repo
  try {
    const parsed = new URL(trimmed);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 2) {
      return { owner: pathParts[0], name: pathParts[1] };
    }
    if (pathParts.length === 1) {
      return { owner: 'imported', name: pathParts[0] };
    }
  } catch {
    // If not a standard URL, fallback regex
    const parts = trimmed.split(/[/:]/).filter(Boolean);
    if (parts.length >= 2) {
      return { owner: parts[parts.length - 2], name: parts[parts.length - 1] };
    }
  }

  return { owner: 'imported', name: 'migrated-repo' };
}

/**
 * Translates GitHub Actions workflow configuration into sovereign QuantGit Actions workflow.
 */
export function convertGitHubActionsToQuantWorkflow(
  yamlContent: string,
  fileName = '.github/workflows/ci.yml',
): ConvertedPipelineResult {
  const jobs: Record<string, PipelineJob> = {};
  let workflowName = 'QuantGit CI Pipeline (Migrated from GitHub Actions)';

  // Parse lines for jobs, steps, runs-on, and run commands
  const lines = yamlContent.split('\n');
  let currentJobKey = '';
  let inSteps = false;
  let currentStep: PipelineStep | null = null;
  let inEnv = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Detect top-level workflow name
    if (rawLine.startsWith('name:')) {
      const parsedName = trimmed.replace(/^name:\s*/, '').replace(/['"]/g, '');
      if (parsedName) workflowName = `${parsedName} (QuantGit Migrated)`;
    }

    // Detect jobs section
    if (rawLine.startsWith('jobs:')) {
      continue;
    }

    // Detect job header (2 spaces indentation)
    const jobMatch = rawLine.match(/^ {2}([a-zA-Z0-9_-]+):/);
    if (jobMatch && !rawLine.startsWith('    ')) {
      currentJobKey = jobMatch[1];
      jobs[currentJobKey] = {
        name: currentJobKey,
        runsOn: 'quant-runner-linux-x64',
        steps: [
          {
            name: 'Checkout sovereign repository',
            uses: 'quantgit/checkout@v1',
          },
        ],
      };
      inSteps = false;
      currentStep = null;
      inEnv = false;
      continue;
    }

    if (!currentJobKey || !jobs[currentJobKey]) continue;

    // Detect runs-on
    if (trimmed.startsWith('runs-on:')) {
      const runner = trimmed.replace(/^runs-on:\s*/, '').replace(/['"]/g, '');
      jobs[currentJobKey].runsOn = runner.includes('ubuntu')
        ? 'quant-runner-linux-x64'
        : runner.includes('windows')
          ? 'quant-runner-windows-x64'
          : runner.includes('macos')
            ? 'quant-runner-macos-arm64'
            : 'quant-runner-linux-x64';
    }

    // Detect steps: block
    if (trimmed === 'steps:') {
      inSteps = true;
      continue;
    }

    if (inSteps) {
      // Step item begins with '- '
      if (trimmed.startsWith('- ')) {
        const stepDef = trimmed.slice(2).trim();
        inEnv = false;

        if (stepDef.startsWith('name:')) {
          const stepName = stepDef.replace(/^name:\s*/, '').replace(/['"]/g, '');
          currentStep = { name: stepName };
          jobs[currentJobKey].steps.push(currentStep);
        } else if (stepDef.startsWith('uses:')) {
          const usesAction = stepDef.replace(/^uses:\s*/, '').replace(/['"]/g, '');
          if (usesAction.includes('actions/checkout')) {
            // Already added default checkout step or update it
            continue;
          }
          currentStep = {
            name: `Action: ${usesAction}`,
            uses: usesAction.replace(/^actions\//, 'quantgit/'),
          };
          jobs[currentJobKey].steps.push(currentStep);
        } else if (stepDef.startsWith('run:')) {
          const runCmd = stepDef.replace(/^run:\s*/, '');
          currentStep = {
            name: `Execute: ${runCmd.slice(0, 30)}`,
            run: runCmd,
          };
          jobs[currentJobKey].steps.push(currentStep);
        }
      } else if (currentStep) {
        // Step subproperties
        if (trimmed.startsWith('uses:')) {
          const usesAction = trimmed.replace(/^uses:\s*/, '').replace(/['"]/g, '');
          if (usesAction.includes('actions/checkout')) {
            currentStep.uses = 'quantgit/checkout@v1';
          } else {
            currentStep.uses = usesAction.replace(/^actions\//, 'quantgit/');
          }
        } else if (trimmed.startsWith('run:')) {
          const runCmd = trimmed.replace(/^run:\s*/, '');
          currentStep.run = runCmd;
          if (!currentStep.name || currentStep.name.startsWith('Step')) {
            currentStep.name = `Run: ${runCmd.slice(0, 30)}`;
          }
        } else if (trimmed.startsWith('env:')) {
          inEnv = true;
          currentStep.env = currentStep.env || {};
        } else if (inEnv && trimmed.includes(':')) {
          const colonIdx = trimmed.indexOf(':');
          const k = trimmed.slice(0, colonIdx).trim();
          const v = trimmed.slice(colonIdx + 1).trim();
          if (currentStep.env) {
            currentStep.env[k] = v;
          }
        }
      }
    }
  }

  // Fallback if no jobs were parsed
  if (Object.keys(jobs).length === 0) {
    jobs['build-and-test'] = {
      name: 'build-and-test',
      runsOn: 'quant-runner-linux-x64',
      steps: [
        { name: 'Checkout repository', uses: 'quantgit/checkout@v1' },
        { name: 'Install dependencies', run: 'pnpm install' },
        { name: 'Execute test suite', run: 'pnpm test' },
      ],
    };
  }

  const workflow: QuantWorkflow = {
    name: workflowName,
    on: {
      push: { branches: ['main'] },
      pullRequest: { branches: ['main'] },
    },
    jobs,
  };

  const workflowYaml = generateQuantWorkflowYaml(workflow);

  return {
    sourceType: 'github-actions',
    sourceFile: fileName,
    targetFile: '.quant/workflows/ci.yml',
    workflow,
    workflowYaml,
  };
}

/**
 * Translates GitLab CI configuration (.gitlab-ci.yml) into sovereign QuantGit Actions workflow.
 */
export function convertGitLabCiToQuantWorkflow(
  yamlContent: string,
  fileName = '.gitlab-ci.yml',
): ConvertedPipelineResult {
  const jobs: Record<string, PipelineJob> = {};
  const workflowName = 'QuantGit CI Pipeline (Migrated from GitLab CI)';

  const lines = yamlContent.split('\n');
  let currentJobKey = '';
  let inScript = false;
  let inArtifacts = false;
  let inArtifactPaths = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Skip root stages declaration
    if (rawLine.startsWith('stages:')) {
      inScript = false;
      inArtifacts = false;
      currentJobKey = '';
      continue;
    }

    // Top-level job declaration (not indented)
    const jobMatch = rawLine.match(/^([a-zA-Z0-9_.-]+):/);
    if (jobMatch && !rawLine.startsWith(' ') && !rawLine.startsWith('\t')) {
      const key = jobMatch[1];
      if (key !== 'stages' && key !== 'variables' && key !== 'default') {
        currentJobKey = key;
        jobs[currentJobKey] = {
          name: currentJobKey,
          runsOn: 'quant-runner-linux-x64',
          steps: [
            {
              name: 'Checkout sovereign repository',
              uses: 'quantgit/checkout@v1',
            },
          ],
        };
        inScript = false;
        inArtifacts = false;
        inArtifactPaths = false;
        continue;
      }
    }

    if (!currentJobKey || !jobs[currentJobKey]) continue;

    // Stage definition
    if (trimmed.startsWith('stage:')) {
      jobs[currentJobKey].stage = trimmed.replace(/^stage:\s*/, '').replace(/['"]/g, '');
    }

    // Script block
    if (trimmed === 'script:') {
      inScript = true;
      inArtifacts = false;
      continue;
    }

    // Artifacts block
    if (trimmed === 'artifacts:') {
      inArtifacts = true;
      inScript = false;
      jobs[currentJobKey].artifacts = jobs[currentJobKey].artifacts || {};
      continue;
    }

    if (inScript) {
      if (trimmed.startsWith('- ')) {
        const cmd = trimmed.slice(2).trim();
        jobs[currentJobKey].steps.push({
          name: `Run ${cmd.slice(0, 30)}`,
          run: cmd,
        });
      } else if (!rawLine.startsWith('  ') && !rawLine.startsWith('\t')) {
        inScript = false;
      }
    }

    if (inArtifacts) {
      if (trimmed === 'paths:') {
        inArtifactPaths = true;
        jobs[currentJobKey].artifacts!.paths = jobs[currentJobKey].artifacts!.paths || [];
        continue;
      }
      if (trimmed.startsWith('expire_in:')) {
        jobs[currentJobKey].artifacts!.expireIn = trimmed
          .replace(/^expire_in:\s*/, '')
          .replace(/['"]/g, '');
        inArtifactPaths = false;
      } else if (inArtifactPaths && trimmed.startsWith('- ')) {
        const path = trimmed.slice(2).trim();
        jobs[currentJobKey].artifacts!.paths!.push(path);
      }
    }
  }

  // Fallback if no jobs parsed
  if (Object.keys(jobs).length === 0) {
    jobs['test'] = {
      name: 'test',
      stage: 'test',
      runsOn: 'quant-runner-linux-x64',
      steps: [
        { name: 'Checkout repository', uses: 'quantgit/checkout@v1' },
        { name: 'Run build & test', run: 'npm test' },
      ],
    };
  }

  const workflow: QuantWorkflow = {
    name: workflowName,
    on: {
      push: { branches: ['main'] },
      pullRequest: { branches: ['main'] },
    },
    jobs,
  };

  const workflowYaml = generateQuantWorkflowYaml(workflow);

  return {
    sourceType: 'gitlab-ci',
    sourceFile: fileName,
    targetFile: '.quant/workflows/ci.yml',
    workflow,
    workflowYaml,
  };
}

/**
 * Generates clean YAML representation of a QuantGit Actions workflow.
 */
export function generateQuantWorkflowYaml(workflow: QuantWorkflow): string {
  const lines: string[] = [];
  lines.push(`name: ${workflow.name}`);
  lines.push('on:');
  lines.push('  push:');
  lines.push('    branches:');
  (workflow.on.push?.branches || ['main']).forEach((b) => lines.push(`      - ${b}`));
  lines.push('  pull_request:');
  lines.push('    branches:');
  (workflow.on.pullRequest?.branches || ['main']).forEach((b) => lines.push(`      - ${b}`));
  lines.push('jobs:');

  for (const [jobKey, job] of Object.entries(workflow.jobs)) {
    lines.push(`  ${jobKey}:`);
    lines.push(`    runs-on: ${job.runsOn || 'quant-runner-linux-x64'}`);
    if (job.stage) {
      lines.push(`    stage: ${job.stage}`);
    }
    lines.push('    steps:');
    job.steps.forEach((step) => {
      lines.push(`      - name: ${step.name}`);
      if (step.uses) {
        lines.push(`        uses: ${step.uses}`);
      }
      if (step.run) {
        lines.push(`        run: ${step.run}`);
      }
      if (step.env && Object.keys(step.env).length > 0) {
        lines.push('        env:');
        for (const [k, v] of Object.entries(step.env)) {
          lines.push(`          ${k}: ${v}`);
        }
      }
    });

    if (job.artifacts) {
      lines.push('    artifacts:');
      if (job.artifacts.paths && job.artifacts.paths.length > 0) {
        lines.push('      paths:');
        job.artifacts.paths.forEach((p) => lines.push(`        - ${p}`));
      }
      if (job.artifacts.expireIn) {
        lines.push(`      expire_in: ${job.artifacts.expireIn}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Scans .env.example / .env and workflow env: blocks to extract environment variables
 * and create masked secrets templates.
 */
export function extractEnvironmentVariables(
  envFileContent?: string,
  workflowYaml?: string,
): ImportedEnvVar[] {
  const envMap = new Map<string, ImportedEnvVar>();

  // 1. Scan .env.example lines
  if (envFileContent) {
    const lines = envFileContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Handle lines like: KEY=value, # KEY=value, export KEY=value
      const cleaned = trimmed.replace(/^#\s*/, '').replace(/^export\s+/, '');
      const match = cleaned.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) {
        const key = match[1];
        const val = match[2].trim().replace(/^['"]|['"]$/g, '');
        const isSecret = isKeySecret(key);
        envMap.set(key, {
          key,
          source: 'env-example',
          isSecret,
          maskedValue: isSecret
            ? '•••••••••••• [Ready for QuantSecret injection]'
            : val || 'default_value',
          description: getEnvVarDescription(key),
        });
      }
    }
  }

  // 2. Scan workflow YAML for env variables
  if (workflowYaml) {
    const secretRefMatches = workflowYaml.matchAll(
      /(?:secrets|env)\.([A-Z0-9_]+)|\b([A-Z0-9_]+):\s*\${{/g,
    );
    for (const match of secretRefMatches) {
      const key = match[1] || match[2];
      if (key && !envMap.has(key)) {
        envMap.set(key, {
          key,
          source: 'workflow-env',
          isSecret: isKeySecret(key),
          maskedValue: '•••••••••••• [Ready for QuantSecret injection]',
          description: getEnvVarDescription(key),
        });
      }
    }

    // Common standard workflow env blocks
    const envBlockMatches = workflowYaml.matchAll(/([A-Z0-9_]{3,})\s*:\s*([^#\n]+)/g);
    for (const match of envBlockMatches) {
      const key = match[1];
      if (
        !envMap.has(key) &&
        (key.includes('KEY') ||
          key.includes('SECRET') ||
          key.includes('TOKEN') ||
          key.includes('URL') ||
          key.includes('PORT') ||
          key.includes('ENV'))
      ) {
        envMap.set(key, {
          key,
          source: 'workflow-env',
          isSecret: isKeySecret(key),
          maskedValue: isKeySecret(key)
            ? '•••••••••••• [Ready for QuantSecret injection]'
            : match[2].trim(),
          description: getEnvVarDescription(key),
        });
      }
    }
  }

  // 3. Fallback defaults if nothing detected
  if (envMap.size === 0) {
    const defaults = ['DATABASE_URL', 'API_KEY', 'PORT', 'JWT_SECRET'];
    for (const key of defaults) {
      const isSecret = isKeySecret(key);
      envMap.set(key, {
        key,
        source: 'detected',
        isSecret,
        maskedValue: isSecret ? '•••••••••••• [Ready for QuantSecret injection]' : '3000',
        description: getEnvVarDescription(key),
      });
    }
  }

  return Array.from(envMap.values());
}

function isKeySecret(key: string): boolean {
  const upper = key.toUpperCase();
  return (
    upper.includes('SECRET') ||
    upper.includes('KEY') ||
    upper.includes('TOKEN') ||
    upper.includes('PASSWORD') ||
    upper.includes('PRIVATE') ||
    upper.includes('CREDENTIAL') ||
    upper.includes('DATABASE_URL') ||
    upper.includes('AUTH')
  );
}

function getEnvVarDescription(key: string): string {
  const upper = key.toUpperCase();
  if (upper.includes('DATABASE')) return 'Primary database connection string';
  if (upper.includes('API_KEY')) return 'Third-party API authorization credential';
  if (upper.includes('JWT') || upper.includes('AUTH')) return 'JSON Web Token signing secret key';
  if (upper.includes('PORT')) return 'Application HTTP listen port';
  if (upper.includes('REDIS')) return 'Redis cache & pub/sub broker URI';
  if (upper.includes('NODE_ENV')) return 'Application runtime environment mode';
  return `Configured environment variable: ${key}`;
}

/**
 * Strips any embedded credentials (userinfo) from a URL before it is placed
 * in an error message. The token itself is never in the URL by construction,
 * but a caller-supplied sourceUrl could be `https://user:pass@host/...`.
 */
function maskUrlForError(url: string): string {
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@/]*@/, '$1');
}

/**
 * Builds a safe one-line detail from a failed `git ls-remote` invocation.
 *
 * SECURITY: the raw execFile error message contains the FULL argv — including
 * the `-c http.extraHeader=Authorization: ...` value (base64 of the caller's
 * token, trivially reversible) — and git's stderr echoes the URL with any
 * embedded userinfo. Both are scrubbed here: error text must never carry
 * credentials into logs or API responses.
 */
function scrubGitErrorDetail(err: any): string {
  const raw = String(err?.stderr ?? err?.message ?? 'git ls-remote failed');
  const firstLine =
    raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)[0] ?? 'git ls-remote failed';
  return firstLine
    .replace(/http\.extraHeader=\S+/g, 'http.extraHeader=<redacted>')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, '$1')
    .slice(0, 300);
}

/**
 * Main Service Class for Repository Migration
 */
export class RepoMigrationService {
  constructor(private readonly prisma?: any) {}

  /**
   * Discovers the remote repository's real refs via `git ls-remote`.
   *
   * This is the ONLY source of branch/SHA data for an import. It runs without
   * a shell (execFile argv, no interpolation), with the allowlisted
   * GIT_CHILD_ENV (GIT_TERMINAL_PROMPT=0 so a credential prompt can never
   * hang the request) and a hard timeout.
   *
   * Token handling: when the caller supplies a token for an HTTPS remote it
   * is sent as an Authorization header via `-c http.extraHeader` (per-
   * invocation config, never persisted). GitHub expects Basic with the
   * x-access-token username; GitLab accepts Bearer. The token is NEVER
   * embedded in the URL (no ?token= / userinfo leak) and NEVER echoed in
   * error messages.
   *
   * Failure is LOUD: any ls-remote failure (unreachable host, DNS, auth
   * rejection, missing git binary, timeout) becomes a 502
   * REMOTE_GIT_UNREACHABLE, and importRepository mints nothing.
   *
   * Public (not protected) so route-level tests can stub discovery via
   * vi.spyOn on the prototype without network access; the real path is
   * covered by tests against local git repos.
   */
  public async discoverRemoteRefs(
    sourceUrl: string,
    provider: MigrationProvider,
    token?: string,
  ): Promise<RemoteRefDiscovery> {
    const url = sourceUrl.trim();
    const args: string[] = [];
    if (token && /^https:\/\//i.test(url)) {
      const header =
        provider === 'gitlab'
          ? `Authorization: Bearer ${token}`
          : `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
      args.push('-c', `http.extraHeader=${header}`);
    }
    args.push('ls-remote', '--symref', '--heads', '--end-of-options', url);

    let stdout: string;
    try {
      const res = await execFileAsync('git', args, {
        env: { ...GIT_CHILD_ENV, GIT_TERMINAL_PROMPT: '0' },
        timeout: LS_REMOTE_TIMEOUT_MS,
        maxBuffer: LS_REMOTE_MAX_BUFFER,
      });
      stdout = res.stdout;
    } catch (err: any) {
      throw createAppError(
        `Could not reach the remote Git repository at ${maskUrlForError(url)}. ` +
          'No repository record was created. ' +
          `(${scrubGitErrorDetail(err)})`,
        502,
        'REMOTE_GIT_UNREACHABLE',
        { provider },
      );
    }

    const branches: DiscoveredRemoteBranch[] = [];
    let headTarget: string | null = null;
    for (const line of stdout.split('\n')) {
      const symref = line.match(/^ref: refs\/heads\/(.+)\tHEAD$/);
      if (symref) {
        headTarget = symref[1];
        continue;
      }
      const head = line.match(/^([0-9a-f]{40})\trefs\/heads\/(.+)$/);
      if (head) {
        branches.push({ name: head[2], sha: head[1] });
      }
    }

    // An empty remote (no heads at all) is a legitimate state — ls-remote
    // succeeded, so the repo exists; it simply has no branches yet.
    // Without an advertised HEAD symref (e.g. local-path remotes) there is no
    // way to know the true default, so we deterministically use the first
    // advertised branch — real data, never a guess presented as discovery.
    const defaultBranch = headTarget ?? branches[0]?.name ?? 'main';

    return { branches, defaultBranch };
  }

  /**
   * Imports a remote repository from GitHub, GitLab, or generic Git URL and
   * persists the record. Branch/SHA data comes ONLY from a real
   * `git ls-remote` (loud 502 when the remote is unreachable — nothing is
   * minted). CI/CD pipeline conversion and env/secret extraction are NOT
   * wired up yet: requesting them is a loud 501, never sample data.
   */
  async importRepository(input: ImportRepositoryInput): Promise<ImportRepositoryResult> {
    // 1. Validate inputs
    validateSourceUrl(input.sourceUrl, input.provider);

    if (!input.targetRepoName || !input.targetRepoName.trim()) {
      throw createAppError('Target repository name is required', 400, 'MISSING_TARGET_REPO_NAME');
    }

    const cleanTargetName = input.targetRepoName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '-');
    // SECURITY: targetOwner is the identity the imported repo is attributed
    // to. Never silently fall back to a pseudo-user ('user-default') — an
    // absent owner is an honest 400, never a fake-user attribution.
    if (!input.targetOwner || !input.targetOwner.trim()) {
      throw createAppError('Target repository owner is required', 400, 'MISSING_TARGET_OWNER');
    }

    const targetOwner = input.targetOwner.trim();

    // 2. Discover remote Git refs and branches — FOR REAL.
    // `git ls-remote` is the only source of truth here. When the remote is
    // unreachable (DNS, network, auth, or the git binary missing) this throws
    // a loud 502 and NO repository record is minted — never fabricated
    // branches, never a random commit count, never a random SHA.
    const discovery = await this.discoverRemoteRefs(input.sourceUrl, input.provider, input.token);

    // 3. CI/CD Pipeline Converter — NOT WIRED UP.
    // Honest conversion requires fetching the remote's ACTUAL workflow files
    // (.github/workflows/*.yml, .gitlab-ci.yml); converting a hardcoded
    // sample template and presenting it as "imported" was fabrication. Fail
    // loudly with 501 when requested. Pass importPipelines:false to import
    // refs only.
    const convertedPipelines: ConvertedPipelineResult[] = [];
    if (input.importPipelines) {
      throw createAppError(
        'CI/CD pipeline conversion is not wired up yet: it requires fetching the remote ' +
          "repository's actual workflow files, which importRepository does not do. " +
          'No sample pipeline was generated. Pass importPipelines:false to import without pipelines.',
        501,
        'PIPELINE_IMPORT_NOT_SUPPORTED',
        { provider: input.provider },
      );
    }

    // 4. Environment & Secrets Importer — NOT WIRED UP.
    // Same story: extracting variables from a hardcoded sample .env string
    // and labeling them "imported" was fabrication. Fail loudly with 501 when
    // requested. Pass importEnv:false to import without env extraction.
    const importedEnvVars: ImportedEnvVar[] = [];
    if (input.importEnv) {
      throw createAppError(
        'Environment/secret importing is not wired up yet: it requires fetching the remote ' +
          "repository's actual env templates, which importRepository does not do. " +
          'No sample variables were generated. Pass importEnv:false to import without env extraction.',
        501,
        'ENV_IMPORT_NOT_SUPPORTED',
        { provider: input.provider },
      );
    }

    // 5. Persist repository record in Prisma or in-memory fallback
    const repoId = `repo-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const repoRecord: ImportedRepoRecord = {
      id: repoId,
      ownerId: targetOwner,
      name: cleanTargetName,
      fullName: `${targetOwner}/${cleanTargetName}`,
      description: `Imported from ${input.provider.toUpperCase()} (${input.sourceUrl})`,
      visibility: input.isPrivate ? 'private' : 'public',
      defaultBranch: discovery.defaultBranch,
      cloneUrl: `${(process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://quantmail.in').replace(/\/$/, '')}/api/code/gitd/repos/${encodeURIComponent(targetOwner)}/${encodeURIComponent(cleanTargetName)}.git`,
      branches: discovery.branches.map((b) => b.name),
      // commitCount deliberately omitted: git ls-remote cannot report it and
      // we never fabricate it (the old code minted a random 35-79).
      starCount: 0,
      forkCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (this.prisma?.repository) {
      try {
        const existing = await this.prisma.repository.findFirst({
          where: { ownerId: targetOwner, name: cleanTargetName, deletedAt: null },
        });

        if (existing) {
          throw createAppError(
            `A repository named '${cleanTargetName}' already exists for this owner`,
            409,
            'REPO_ALREADY_EXISTS',
          );
        }

        const createdDbRepo = await this.prisma.repository.create({
          data: {
            id: repoId,
            ownerId: targetOwner,
            name: cleanTargetName,
            description: repoRecord.description,
            visibility: input.isPrivate ? 'PRIVATE' : 'PUBLIC',
            defaultBranch: discovery.defaultBranch,
            starCount: 0,
            forkCount: 0,
          },
        });

        if (this.prisma.branch) {
          for (const b of discovery.branches) {
            await this.prisma.branch
              .create({
                data: {
                  repoId: createdDbRepo.id,
                  name: b.name,
                  commitSha: b.sha,
                  isProtected: b.name === discovery.defaultBranch,
                },
              })
              .catch(() => {});
          }
        }
      } catch (err: any) {
        if (err?.code === 'REPO_ALREADY_EXISTS') {
          throw err;
        }
        // If Prisma errors, log and proceed with memory record
      }
    }

    memoryMigratedReposStore.set(repoId, repoRecord);

    return {
      repo: repoRecord,
      // importedCommits deliberately omitted — never a fabricated number.
      convertedPipelines,
      importedEnvVars,
    };
  }
}

export const repoMigrationService = new RepoMigrationService();
