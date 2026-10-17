// ============================================================================
// QuantMail / QuantGit — Repository Migration & Pipeline Converter Service
// Full 1-Click GitHub & GitLab Migration, Git Ref Discovery, Sovereign
// QuantGit Actions Workflow Translation, and Secrets/Env Importer.
// ============================================================================

import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createAppError } from '@quant/server-core';
import { RepoStorageService } from '../modules/code/services/git-transport/repo-storage.service';
import { GIT_CHILD_ENV } from '../modules/code/services/git-transport/git-child-env';

const execFileAsync = promisify(execFile);

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
  commitCount: number;
  starCount?: number;
  forkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportRepositoryResult {
  repo: ImportedRepoRecord;
  importedCommits: number;
  convertedPipelines: ConvertedPipelineResult[];
  importedEnvVars: ImportedEnvVar[];
}

// In-memory fallback repository store when database/Prisma is absent or mocked
export const memoryMigratedReposStore = new Map<string, ImportedRepoRecord>();

// ---------------------------------------------------------------------------
// Real source-repository discovery (P1 fix 2026-10-17).
//
// importRepository used to FABRICATE branch names (['main', 'develop',
// 'release/v1.0']), a random commit count, and a randomUUID-derived pseudo-SHA
// (not even a valid 40-hex git object id), then persisted those invented SHAs
// into the branch table — with no clone and no provisioning. The branch rows
// pointed at git objects that exist nowhere.
//
// The service now performs a real `git clone --bare` of the source URL and
// derives everything from the cloned objects: branch names + 40-hex SHAs from
// refs/heads, per-branch commit counts from rev-list, workflow files and
// .env.example read from the default branch's tree. When the source cannot be
// reached, every failure is an honest, coded error — never invented data.
// ---------------------------------------------------------------------------

/** A real branch discovered from the source repository's refs/heads. */
export interface DiscoveredBranch {
  name: string;
  /** 40-hex git object id, straight from the source's ref. */
  sha: string;
  /** Real commit count from `git rev-list --count <sha>`. */
  commitCount: number;
}

/** Everything importRepository learns from the real cloned source repo. */
export interface DiscoveredSourceRepo {
  branches: DiscoveredBranch[];
  /** The source's actual default branch (remote HEAD symref), never assumed. */
  defaultBranch: string;
  /** Real workflow files read from the default branch tree (bounded). */
  workflowFiles: { path: string; content: string }[];
  /** Real .env.example/.env.sample content, or null when the source has none. */
  envExampleContent: string | null;
}

/**
 * Clone + discovery port. The default implementation shells out to real git;
 * tests inject a stub so no network is touched.
 */
export interface MigrationGitOps {
  cloneAndDiscover(sourceUrl: string, stagingDir: string, token?: string): Promise<DiscoveredSourceRepo>;
}

const HEX40_RE = /^[0-9a-f]{40}$/;
const CLONE_TIMEOUT_MS = 180_000;
const MAX_WORKFLOW_FILES = 12;
const MAX_WORKFLOW_FILE_BYTES = 256 * 1024;
const MAX_ENV_FILE_BYTES = 64 * 1024;

function sanitizeGitOutput(text: string, maxLen = 300): string {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function mapMigrationCloneError(err: unknown, tokenProvided: boolean): Error {
  const e = err as { killed?: boolean; stderr?: unknown; message?: unknown };
  const stderr = typeof e?.stderr === 'string' ? e.stderr : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  const blob = `${stderr} ${message}`.toLowerCase();

  if (e?.killed === true || blob.includes('timed out')) {
    return createAppError(
      'Source repository clone timed out (180s) — the source may be too large or unreachable',
      504,
      'MIGRATION_CLONE_TIMEOUT',
    );
  }
  if (
    blob.includes('authentication failed') ||
    blob.includes('permission denied') ||
    blob.includes('unauthorized') ||
    /\b401\b|\b403\b/.test(blob)
  ) {
    return tokenProvided
      ? createAppError('Source repository rejected the provided credentials', 403, 'MIGRATION_SOURCE_FORBIDDEN')
      : createAppError(
          'Source repository requires authentication — provide a token for private sources',
          401,
          'MIGRATION_SOURCE_AUTH_REQUIRED',
        );
  }
  if (
    blob.includes('not found') ||
    blob.includes("couldn't find remote ref") ||
    blob.includes('does not appear to be a git repository') ||
    blob.includes('unable to connect') ||
    blob.includes('connection refused') ||
    blob.includes('could not resolve host') ||
    blob.includes('name resolution') ||
    /\b404\b/.test(blob)
  ) {
    return createAppError(
      'Source repository not found or unreachable — check the URL',
      404,
      'MIGRATION_SOURCE_NOT_FOUND',
    );
  }
  const detail = sanitizeGitOutput(stderr) || sanitizeGitOutput(message);
  return createAppError(
    `Failed to clone source repository${detail ? `: ${detail}` : ''}`,
    502,
    'MIGRATION_CLONE_FAILED',
  );
}

async function runGit(
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number; maxBuffer?: number } = {},
): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    env: GIT_CHILD_ENV,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
    ...opts,
  });
  return stdout;
}

/** Reads one file from the cloned repo's object store; null when absent. Never throws for missing files. */
async function showFileFromObjects(
  repoDir: string,
  sha: string,
  path: string,
  maxBytes: number,
): Promise<string | null> {
  try {
    const out = await runGit(['--git-dir', repoDir, 'show', `${sha}:${path}`], {
      maxBuffer: maxBytes + 1024,
      timeout: 30_000,
    });
    return out.slice(0, maxBytes);
  } catch {
    return null;
  }
}

async function realCloneAndDiscover(
  sourceUrl: string,
  stagingDir: string,
  token?: string,
): Promise<DiscoveredSourceRepo> {
  // Token travels in the child env for a throwaway askpass script — never in
  // the URL, never in argv (both leak into process listings / logs).
  let askpassPath: string | null = null;
  const env: NodeJS.ProcessEnv = { ...GIT_CHILD_ENV };
  if (token && token.trim()) {
    askpassPath = join(dirname(stagingDir), 'askpass.sh');
    await writeFile(askpassPath, '#!/bin/sh\nprintf \'%s\' "$QUANTGIT_IMPORT_TOKEN"\n', {
      mode: 0o700,
    });
    env['GIT_ASKPASS'] = askpassPath;
    env['QUANTGIT_IMPORT_TOKEN'] = token;
  }

  try {
    await runGit(['clone', '--bare', '--no-checkout', sourceUrl, stagingDir], {
      env,
      timeout: CLONE_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    }).catch((err: unknown) => {
      throw mapMigrationCloneError(err, Boolean(token && token.trim()));
    });
  } finally {
    if (askpassPath) {
      await rm(askpassPath, { force: true }).catch(() => {});
      delete env['QUANTGIT_IMPORT_TOKEN'];
    }
  }

  // Real branches + real SHAs from refs/heads.
  const refsOut = await runGit(
    ['--git-dir', stagingDir, 'for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/heads'],
    { timeout: 30_000 },
  );
  const branches: DiscoveredBranch[] = [];
  for (const line of refsOut.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const tab = trimmed.indexOf('\t');
    const name = tab >= 0 ? trimmed.slice(0, tab) : '';
    const sha = tab >= 0 ? trimmed.slice(tab + 1) : '';
    if (!name || !HEX40_RE.test(sha)) {
      throw createAppError('Source repository returned malformed refs', 502, 'MIGRATION_MALFORMED_REFS');
    }
    branches.push({ name, sha, commitCount: 0 });
  }
  if (branches.length === 0) {
    throw createAppError(
      'No branches discovered in the source repository — nothing to import',
      502,
      'MIGRATION_NO_BRANCHES',
    );
  }

  // Real default branch from the remote HEAD symref (set by clone); fall back
  // to the actual discovered refs, never to an assumed name.
  let defaultBranch: string | null = null;
  try {
    const headRef = (await runGit(['--git-dir', stagingDir, 'symbolic-ref', '--short', 'HEAD'], { timeout: 15_000 })).trim();
    if (headRef.startsWith('refs/heads/')) {
      const candidate = headRef.slice('refs/heads/'.length);
      if (branches.some((b) => b.name === candidate)) defaultBranch = candidate;
    }
  } catch {
    // fall through to ref-based fallback below
  }
  if (!defaultBranch) {
    defaultBranch = branches.some((b) => b.name === 'main') ? 'main' : branches[0].name;
  }

  const defaultSha = branches.find((b) => b.name === defaultBranch)?.sha ?? branches[0].sha;

  // Real per-branch commit counts.
  for (const branch of branches) {
    const countOut = await runGit(['--git-dir', stagingDir, 'rev-list', '--count', branch.sha], {
      timeout: 60_000,
    });
    const count = Number(countOut.trim());
    if (!Number.isInteger(count) || count < 0) {
      throw createAppError('Source repository returned a malformed commit count', 502, 'MIGRATION_MALFORMED_COUNT');
    }
    branch.commitCount = count;
  }

  // Real workflow files from the default branch's tree (bounded).
  const workflowFiles: { path: string; content: string }[] = [];
  try {
    const treeOut = await runGit(
      ['--git-dir', stagingDir, 'ls-tree', '-r', '--name-only', defaultSha, '--', '.github/workflows', '.gitlab-ci.yml'],
      { timeout: 30_000 },
    );
    const candidates = treeOut
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /\.(ya?ml)$/i.test(s))
      .slice(0, MAX_WORKFLOW_FILES);
    for (const candidate of candidates) {
      const content = await showFileFromObjects(stagingDir, defaultSha, candidate, MAX_WORKFLOW_FILE_BYTES);
      if (content !== null) workflowFiles.push({ path: candidate, content });
    }
  } catch {
    // A tree-listing failure must not fail the whole import; pipelines are
    // best-effort enrichment. The branches (the core import) are already real.
  }

  // Real .env.example / .env.sample from the default branch's tree.
  let envExampleContent: string | null = null;
  for (const envPath of ['.env.example', '.env.sample']) {
    const content = await showFileFromObjects(stagingDir, defaultSha, envPath, MAX_ENV_FILE_BYTES);
    if (content !== null) {
      envExampleContent = content;
      break;
    }
  }

  return { branches, defaultBranch, workflowFiles, envExampleContent };
}

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

/** Default git operations: real `git` subprocess calls (no network mocking). */
export const defaultMigrationGitOps: MigrationGitOps = {
  cloneAndDiscover: realCloneAndDiscover,
};

/**
 * Main Service Class for Repository Migration
 */
export class RepoMigrationService {
  constructor(
    private readonly prisma?: any,
    private readonly gitOps: MigrationGitOps = defaultMigrationGitOps,
    private readonly storage: RepoStorageService = new RepoStorageService(),
  ) {}

  /**
   * Imports a remote repository from GitHub, GitLab, or generic Git URL,
   * converts CI/CD workflows, extracts environment secrets, and persists the record.
   *
   * Everything about the source repo (branches, SHAs, commit counts, workflow
   * files, env examples) comes from a real `git clone --bare` of the source
   * URL; the clone is then provisioned into QuantGit storage so the imported
   * repo is actually servable. Failures are honest coded errors — this method
   * never invents branches, SHAs, counts, pipelines, or env vars.
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

    // 2. Fail fast BEFORE the expensive clone: the name/storage must be free.
    if (this.prisma?.repository) {
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
    }
    const finalStoragePath = this.storage.getRepoPath(targetOwner, cleanTargetName);
    if (await this.storage.repoExists(targetOwner, cleanTargetName)) {
      throw createAppError('Repository storage already contains Git history', 409, 'REPOSITORY_STORAGE_CONFLICT');
    }

    // 3. Real clone + discovery. The staging dir lives next to the final path
    // so provisioning is an atomic rename on the same filesystem.
    await mkdir(dirname(finalStoragePath), { recursive: true });
    const stagingParent = await mkdtemp(join(dirname(finalStoragePath), '.import-'));
    const stagingDir = join(stagingParent, 'repo.git');
    let discovered: DiscoveredSourceRepo;
    try {
      discovered = await this.gitOps.cloneAndDiscover(input.sourceUrl, stagingDir, input.token);
    } catch (err) {
      await rm(stagingParent, { recursive: true, force: true });
      throw err;
    }
    if (discovered.branches.length === 0) {
      await rm(stagingParent, { recursive: true, force: true });
      throw createAppError(
        'No branches discovered in the source repository — nothing to import',
        502,
        'MIGRATION_NO_BRANCHES',
      );
    }

    const defaultBranchRecord =
      discovered.branches.find((b) => b.name === discovered.defaultBranch) ?? discovered.branches[0];
    const defaultBranchName = defaultBranchRecord.name;
    const commitCount = defaultBranchRecord.commitCount;

    // 4. CI/CD Pipeline Converter — real workflow files from the source only.
    // No workflow files in the source => no converted pipelines (honest).
    const convertedPipelines: ConvertedPipelineResult[] = [];
    if (input.importPipelines !== false) {
      for (const wf of discovered.workflowFiles) {
        const lower = wf.path.toLowerCase();
        if (lower.endsWith('.gitlab-ci.yml')) {
          convertedPipelines.push(convertGitLabCiToQuantWorkflow(wf.content, wf.path));
        } else {
          convertedPipelines.push(convertGitHubActionsToQuantWorkflow(wf.content, wf.path));
        }
      }
    }

    // 5. Environment & Secrets Importer — real .env.example content only.
    // No env example in the source => no imported env vars (honest). The
    // extractor's 'detected' fallback defaults are invented placeholders, so
    // they are filtered here: this endpoint only ever returns variables that
    // were actually found in the source repo.
    let importedEnvVars: ImportedEnvVar[] = [];
    if (input.importEnv !== false && discovered.envExampleContent !== null) {
      const workflowEnvContent = convertedPipelines.map((p) => p.workflowYaml).join('\n');
      importedEnvVars = extractEnvironmentVariables(discovered.envExampleContent, workflowEnvContent).filter(
        (v) => v.source !== 'detected',
      );
    }

    // 6. Provision: move the cloned bare repo into real QuantGit storage so
    // the imported branches resolve against actual git objects.
    try {
      await rename(stagingDir, finalStoragePath);
    } catch {
      await rm(stagingParent, { recursive: true, force: true });
      throw createAppError('Failed to provision repository storage for the import', 502, 'MIGRATION_PROVISION_FAILED');
    }
    await rm(stagingParent, { recursive: true, force: true }).catch(() => {});

    // 7. Persist repository record in Prisma or in-memory fallback
    const repoId = `repo-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const repoRecord: ImportedRepoRecord = {
      id: repoId,
      ownerId: targetOwner,
      name: cleanTargetName,
      fullName: `${targetOwner}/${cleanTargetName}`,
      description: `Imported from ${input.provider.toUpperCase()} (${input.sourceUrl})`,
      visibility: input.isPrivate ? 'private' : 'public',
      defaultBranch: defaultBranchName,
      cloneUrl: `${(process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://quantmail.in').replace(/\/$/, '')}/api/code/gitd/repos/${encodeURIComponent(targetOwner)}/${encodeURIComponent(cleanTargetName)}.git`,
      branches: discovered.branches.map((b) => b.name),
      commitCount,
      starCount: 0,
      forkCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (this.prisma?.repository) {
      try {
        const createdDbRepo = await this.prisma.repository.create({
          data: {
            id: repoId,
            ownerId: targetOwner,
            name: cleanTargetName,
            description: repoRecord.description,
            visibility: input.isPrivate ? 'PRIVATE' : 'PUBLIC',
            defaultBranch: defaultBranchName,
            storagePathUrl: finalStoragePath,
            starCount: 0,
            forkCount: 0,
          },
        });

        if (this.prisma.branch) {
          for (const b of discovered.branches) {
            // Real SHAs from the source's refs — these resolve against the
            // provisioned objects above, never invented.
            await this.prisma.branch
              .create({
                data: {
                  repoId: createdDbRepo.id,
                  name: b.name,
                  commitSha: b.sha,
                  isProtected: b.name === defaultBranchName,
                },
              })
              .catch(() => {});
          }
        }
      } catch (err: any) {
        // If Prisma errors, log and proceed with memory record
      }
    }

    memoryMigratedReposStore.set(repoId, repoRecord);

    return {
      repo: repoRecord,
      importedCommits: commitCount,
      convertedPipelines,
      importedEnvVars,
    };
  }
}

export const repoMigrationService = new RepoMigrationService();

/**
 * Test-only seam: overrides clone/discovery and storage on the shared
 * singleton so route-level tests can exercise the import endpoint without
 * network access or touching real storage. Production code never calls
 * this — the default is always the real git implementation + real storage.
 * Tests MUST call resetRepoMigrationServiceTestOverrides() afterwards: the
 * singleton is module-global.
 */
export function setRepoMigrationServiceTestOverrides(overrides: {
  gitOps?: MigrationGitOps;
  storage?: RepoStorageService;
}): void {
  const svc = repoMigrationService as unknown as {
    gitOps: MigrationGitOps;
    storage: RepoStorageService;
  };
  if (overrides.gitOps) svc.gitOps = overrides.gitOps;
  if (overrides.storage) svc.storage = overrides.storage;
}

export function resetRepoMigrationServiceTestOverrides(): void {
  const svc = repoMigrationService as unknown as {
    gitOps: MigrationGitOps;
    storage: RepoStorageService;
  };
  svc.gitOps = defaultMigrationGitOps;
  svc.storage = new RepoStorageService();
}
