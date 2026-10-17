// @vitest-environment node
// ============================================================================
// RepoMigrationService.importRepository — real-clone honesty tests.
// P1 fix (2026-10-17): importRepository FABRICATED branch names
// (['main', 'develop', 'release/v1.0']), a random commit count, and a
// randomUUID-derived pseudo-SHA (not even valid 40-hex), then persisted those
// invented SHAs into the branch table — with no clone and no provisioning.
//
// The service now performs a real `git clone --bare` and derives branches,
// SHAs, commit counts, workflow files, and env examples from the cloned
// objects. Failures are honest coded errors. These tests pin that behavior:
//  - stub-MigrationGitOps tests: discovered data flows through EXACTLY —
//    nothing invented, nothing dropped;
//  - real-git tests: defaultMigrationGitOps against a local file:// fixture
//    repo (no network) — the actual git code path, end to end;
//  - mapMigrationCloneError tests: every clone failure maps to an honest,
//    coded error — never fake data.
// ============================================================================

import { execFile } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RepoMigrationService,
  memoryMigratedReposStore,
  defaultMigrationGitOps,
  mapMigrationCloneError,
  type DiscoveredSourceRepo,
  type MigrationGitOps,
} from '../services/repo-migration.service';
import { RepoStorageService } from '../modules/code/services/git-transport/repo-storage.service';

const execFileAsync = promisify(execFile);

const INPUT = {
  sourceUrl: 'https://github.com/example/source-repo.git',
  provider: 'github' as const,
  targetRepoName: 'imported-repo',
  targetOwner: 'user_real123',
};

const SHA_MAIN = 'c'.repeat(40);
const SHA_FEATURE = 'd'.repeat(40);

function baseDiscovery(overrides: Partial<DiscoveredSourceRepo> = {}): DiscoveredSourceRepo {
  return {
    branches: [
      { name: 'main', sha: SHA_MAIN, commitCount: 128 },
      { name: 'feature', sha: SHA_FEATURE, commitCount: 12 },
    ],
    defaultBranch: 'main',
    workflowFiles: [],
    envExampleContent: null,
    ...overrides,
  };
}

describe('importRepository real-discovery honesty (stubbed git)', () => {
  let storageBase: string;
  let cloneCalls: number;

  beforeEach(async () => {
    memoryMigratedReposStore.clear();
    storageBase = await mkdtemp(join(tmpdir(), 'qm-migration-real-test-'));
    cloneCalls = 0;
  });

  afterEach(async () => {
    await rm(storageBase, { recursive: true, force: true });
  });

  function makeService(discovery: DiscoveredSourceRepo | Error, prisma?: any) {
    const storage = new RepoStorageService(storageBase);
    const gitOps: MigrationGitOps = {
      cloneAndDiscover: async (_url: string, stagingDir: string) => {
        cloneCalls += 1;
        if (discovery instanceof Error) throw discovery;
        // Simulate what a real clone leaves behind: a bare repo at stagingDir.
        await execFileAsync('git', ['init', '--bare', stagingDir]);
        return discovery;
      },
    };
    return { service: new RepoMigrationService(prisma, gitOps, storage), storage };
  }

  it('branches, SHAs, and commit counts come from discovery — never invented', async () => {
    const { service } = makeService(baseDiscovery());

    const result = await service.importRepository(INPUT);

    expect(result.repo.branches).toEqual(['main', 'feature']);
    expect(result.repo.defaultBranch).toBe('main');
    // Real commit count of the default branch — not Math.random()*45+35.
    expect(result.repo.commitCount).toBe(128);
    expect(result.importedCommits).toBe(128);
    expect(cloneCalls).toBe(1);
  });

  it('does NOT emit the old hardcoded branch list', async () => {
    const { service } = makeService(
      baseDiscovery({
        branches: [{ name: 'trunk', sha: 'e'.repeat(40), commitCount: 5 }],
        defaultBranch: 'trunk',
      }),
    );

    const result = await service.importRepository(INPUT);

    expect(result.repo.branches).toEqual(['trunk']);
    expect(result.repo.branches).not.toContain('develop');
    expect(result.repo.branches).not.toContain('release/v1.0');
    expect(result.repo.defaultBranch).toBe('trunk');
  });

  it('converts REAL workflow files from the source — no sample pipelines', async () => {
    const fixtureYaml = [
      'name: Fixture Unique Workflow 9f3a',
      'on: [push]',
      'jobs:',
      '  fixture_unique_job:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: echo hello-migration-fixture-9f3a',
      '',
    ].join('\n');
    const { service } = makeService(
      baseDiscovery({
        workflowFiles: [{ path: '.github/workflows/fixture.yml', content: fixtureYaml }],
      }),
    );

    const result = await service.importRepository(INPUT);

    expect(result.convertedPipelines).toHaveLength(1);
    const pipeline = result.convertedPipelines[0];
    expect(pipeline.sourceFile).toBe('.github/workflows/fixture.yml');
    expect(pipeline.sourceType).toBe('github-actions');
    // Converted FROM the fixture content...
    expect(pipeline.workflowYaml).toContain('hello-migration-fixture-9f3a');
    // ...and NOT from the old hardcoded sample yaml.
    expect(pipeline.workflowYaml).not.toContain('Continuous Integration');
    expect(pipeline.workflow.name).toContain('Fixture Unique Workflow 9f3a');
  });

  it('converts a real .gitlab-ci.yml via the GitLab converter', async () => {
    const fixtureGitlab = ['stages: [build]', '', 'fixture_build_job:', '  stage: build', '  script:', '    - echo gitlab-fixture-7q2z', ''].join(
      '\n',
    );
    const { service } = makeService(
      baseDiscovery({ workflowFiles: [{ path: '.gitlab-ci.yml', content: fixtureGitlab }] }),
    );

    const result = await service.importRepository(INPUT);

    expect(result.convertedPipelines).toHaveLength(1);
    expect(result.convertedPipelines[0].sourceType).toBe('gitlab-ci');
    expect(result.convertedPipelines[0].workflowYaml).toContain('gitlab-fixture-7q2z');
  });

  it('no workflow files in source → no converted pipelines (honest empty)', async () => {
    const { service } = makeService(baseDiscovery({ workflowFiles: [] }));

    const result = await service.importRepository(INPUT);

    expect(result.convertedPipelines).toEqual([]);
  });

  it('imports env vars from the REAL .env.example — no sample secrets', async () => {
    const fixtureEnv = [
      '# fixture env',
      'FI_MIGRATION_API_HOST=https://api.example.test',
      'FI_MIGRATION_SECRET_TOKEN=hunter2',
      'PORT=8080',
      '',
    ].join('\n');
    const { service } = makeService(baseDiscovery({ envExampleContent: fixtureEnv }));

    const result = await service.importRepository(INPUT);

    const byKey = Object.fromEntries(result.importedEnvVars.map((v) => [v.key, v]));
    expect(byKey['FI_MIGRATION_API_HOST'].source).toBe('env-example');
    expect(byKey['FI_MIGRATION_API_HOST'].maskedValue).toBe('https://api.example.test');
    // Secrets stay masked, never echoed.
    expect(byKey['FI_MIGRATION_SECRET_TOKEN'].maskedValue).toContain('••••');
    expect(byKey['FI_MIGRATION_SECRET_TOKEN'].maskedValue).not.toContain('hunter2');
    // No invented fallback defaults.
    expect(result.importedEnvVars.every((v) => v.source !== 'detected')).toBe(true);
    expect(byKey['DATABASE_URL']).toBeUndefined();
  });

  it('no .env.example in source → no imported env vars (honest empty)', async () => {
    const { service } = makeService(baseDiscovery({ envExampleContent: null }));

    const result = await service.importRepository(INPUT);

    expect(result.importedEnvVars).toEqual([]);
  });

  it('clone failure → honest coded error, nothing minted, staging cleaned up', async () => {
    const honest = Object.assign(new Error('nope'), { statusCode: 404, code: 'MIGRATION_SOURCE_NOT_FOUND' });
    const { service, storage } = makeService(honest);

    const err = await service.importRepository(INPUT).then(
      () => null,
      (e) => e,
    );

    expect(err?.code).toBe('MIGRATION_SOURCE_NOT_FOUND');
    expect(err?.statusCode).toBe(404);
    expect(memoryMigratedReposStore.size).toBe(0);
    // No half-provisioned storage left behind.
    expect(await storage.repoExists(INPUT.targetOwner, INPUT.targetRepoName)).toBe(false);
  });

  it('zero discovered branches → honest MIGRATION_NO_BRANCHES, nothing minted', async () => {
    const { service } = makeService(baseDiscovery({ branches: [], defaultBranch: '' }));

    const err = await service.importRepository(INPUT).then(
      () => null,
      (e) => e,
    );

    expect(err?.code).toBe('MIGRATION_NO_BRANCHES');
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('existing repo → 409 REPO_ALREADY_EXISTS before any clone', async () => {
    const prisma = {
      repository: {
        findFirst: async () => ({ id: 'repo-existing' }),
        create: async () => {
          throw new Error('create must not be called');
        },
      },
    };
    const { service } = makeService(baseDiscovery(), prisma);

    const err = await service.importRepository(INPUT).then(
      () => null,
      (e) => e,
    );

    expect(err?.code).toBe('REPO_ALREADY_EXISTS');
    expect(err?.statusCode).toBe(409);
    expect(cloneCalls).toBe(0);
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('storage conflict → 409 REPOSITORY_STORAGE_CONFLICT before any clone', async () => {
    const storage = new RepoStorageService(storageBase);
    await storage.initBareRepo(INPUT.targetOwner, INPUT.targetRepoName);
    const gitOps: MigrationGitOps = {
      cloneAndDiscover: async () => {
        cloneCalls += 1;
        return baseDiscovery();
      },
    };
    const service = new RepoMigrationService(undefined, gitOps, storage);

    const err = await service.importRepository(INPUT).then(
      () => null,
      (e) => e,
    );

    expect(err?.code).toBe('REPOSITORY_STORAGE_CONFLICT');
    expect(cloneCalls).toBe(0);
    expect(memoryMigratedReposStore.size).toBe(0);
  });

  it('provisions REAL storage: the cloned bare repo lands at the servable path', async () => {
    const gitOps: MigrationGitOps = {
      cloneAndDiscover: async (_url: string, stagingDir: string) => {
        cloneCalls += 1;
        // Simulate a real clone: an actual bare repo at the staging dir.
        await execFileAsync('git', ['init', '--bare', stagingDir]);
        return baseDiscovery();
      },
    };
    const storage = new RepoStorageService(storageBase);
    const service = new RepoMigrationService(undefined, gitOps, storage);

    await service.importRepository(INPUT);

    // The provisioned path is a real git repo the gitd transport can serve.
    expect(await storage.repoExists(INPUT.targetOwner, INPUT.targetRepoName)).toBe(true);
  });

  it('persists the storage path + real default branch on the repository row', async () => {
    let createdData: any = null;
    const prisma = {
      repository: {
        findFirst: async () => null,
        create: async (args: any) => {
          createdData = args.data;
          return { id: args.data.id, ...args.data };
        },
      },
      branch: { create: async (args: any) => args.data },
    };
    const { service, storage } = makeService(baseDiscovery(), prisma);

    await service.importRepository(INPUT);

    expect(createdData.defaultBranch).toBe('main');
    expect(createdData.storagePathUrl).toBe(storage.getRepoPath(INPUT.targetOwner, INPUT.targetRepoName));
  });
});

describe('defaultMigrationGitOps — real git against a local fixture repo (no network)', () => {
  let fixtureRepoDir: string;
  let workDir: string;

  async function git(args: string[], cwd?: string) {
    return execFileAsync(
      'git',
      ['-c', 'user.name=qm-test', '-c', 'user.email=qm@test.local', '-c', 'init.defaultBranch=main', ...args],
      { cwd },
    );
  }

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'qm-migration-e2e-'));
    fixtureRepoDir = join(workDir, 'source');
    await git(['init', '-b', 'main', fixtureRepoDir]);
    await writeFile(join(fixtureRepoDir, 'README.md'), '# fixture\n');
    await git(['add', 'README.md'], fixtureRepoDir);
    await git(['commit', '-m', 'initial'], fixtureRepoDir);
    // Real workflow file + real env example on main.
    await mkdir(join(fixtureRepoDir, '.github', 'workflows'), { recursive: true });
    await writeFile(
      join(fixtureRepoDir, '.github', 'workflows', 'ci.yml'),
      'name: e2e-fixture-ci-4x8k\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo e2e-real-workflow-content-4x8k\n',
    );
    await writeFile(join(fixtureRepoDir, '.env.example'), 'E2E_FIXTURE_HOST=https://e2e.example.test\n');
    await git(['add', '.'], fixtureRepoDir);
    await git(['commit', '-m', 'add ci + env'], fixtureRepoDir);
    // Second branch with one extra commit.
    await git(['checkout', '-b', 'feature'], fixtureRepoDir);
    await writeFile(join(fixtureRepoDir, 'feature.txt'), 'feature\n');
    await git(['add', 'feature.txt'], fixtureRepoDir);
    await git(['commit', '-m', 'feature work'], fixtureRepoDir);
    await git(['checkout', 'main'], fixtureRepoDir);
  }, 60_000);

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('discovers real branches, SHAs, counts, workflows, and env from the clone', async () => {
    const stagingDir = join(workDir, 'staging.git');
    const discovered = await defaultMigrationGitOps.cloneAndDiscover(`file://${fixtureRepoDir}`, stagingDir);

    const names = discovered.branches.map((b) => b.name).sort();
    expect(names).toEqual(['feature', 'main']);
    expect(discovered.defaultBranch).toBe('main');

    // SHAs match the fixture repo's actual refs.
    const { stdout: mainSha } = await git(['rev-parse', 'main'], fixtureRepoDir);
    const { stdout: featureSha } = await git(['rev-parse', 'feature'], fixtureRepoDir);
    const byName = Object.fromEntries(discovered.branches.map((b) => [b.name, b]));
    expect(byName['main'].sha).toBe(mainSha.trim());
    expect(byName['feature'].sha).toBe(featureSha.trim());
    for (const b of discovered.branches) {
      expect(b.sha).toMatch(/^[0-9a-f]{40}$/);
    }

    // Real commit counts: main has 2 commits, feature has 3 (2 + 1).
    expect(byName['main'].commitCount).toBe(2);
    expect(byName['feature'].commitCount).toBe(3);

    // Real workflow file content read from the cloned objects.
    expect(discovered.workflowFiles).toHaveLength(1);
    expect(discovered.workflowFiles[0].path).toBe('.github/workflows/ci.yml');
    expect(discovered.workflowFiles[0].content).toContain('e2e-real-workflow-content-4x8k');

    // Real .env.example content.
    expect(discovered.envExampleContent).toContain('E2E_FIXTURE_HOST=https://e2e.example.test');

    // The staging dir is a real bare clone.
    const { stdout: bareCheck } = await execFileAsync('git', ['--git-dir', stagingDir, 'rev-parse', '--is-bare-repository']);
    expect(bareCheck.trim()).toBe('true');
  }, 60_000);

  it('unreachable source → honest MIGRATION_SOURCE_NOT_FOUND (never fake data)', async () => {
    const stagingDir = join(workDir, 'missing.git');
    const err = await defaultMigrationGitOps
      .cloneAndDiscover('file:///definitely/not/a/repo-9z9z', stagingDir)
      .then(() => null, mapMigrationCloneErrorSafe);

    expect(err?.code).toBe('MIGRATION_SOURCE_NOT_FOUND');
  }, 60_000);
});

function mapMigrationCloneErrorSafe(e: unknown): any {
  return mapMigrationCloneError(e, false);
}

describe('mapMigrationCloneError — honest error mapping', () => {
  it('killed (timeout) → 504 MIGRATION_CLONE_TIMEOUT', () => {
    const err = mapMigrationCloneError(Object.assign(new Error('command timed out'), { killed: true }), false);
    expect((err as any).statusCode).toBe(504);
    expect((err as any).code).toBe('MIGRATION_CLONE_TIMEOUT');
  });

  it('auth failure without token → 401 MIGRATION_SOURCE_AUTH_REQUIRED', () => {
    const err = mapMigrationCloneError(
      Object.assign(new Error('clone failed'), { stderr: "fatal: Authentication failed for 'https://github.com/x/y.git'" }),
      false,
    );
    expect((err as any).statusCode).toBe(401);
    expect((err as any).code).toBe('MIGRATION_SOURCE_AUTH_REQUIRED');
  });

  it('auth failure with token → 403 MIGRATION_SOURCE_FORBIDDEN', () => {
    const err = mapMigrationCloneError(
      Object.assign(new Error('clone failed'), { stderr: 'fatal: Authentication failed' }),
      true,
    );
    expect((err as any).statusCode).toBe(403);
    expect((err as any).code).toBe('MIGRATION_SOURCE_FORBIDDEN');
  });

  it('repository not found → 404 MIGRATION_SOURCE_NOT_FOUND', () => {
    const err = mapMigrationCloneError(
      Object.assign(new Error('clone failed'), {
        stderr: "fatal: repository 'https://github.com/x/nope.git/' not found",
      }),
      false,
    );
    expect((err as any).statusCode).toBe(404);
    expect((err as any).code).toBe('MIGRATION_SOURCE_NOT_FOUND');
  });

  it('generic git failure → 502 MIGRATION_CLONE_FAILED with sanitized detail', () => {
    const err = mapMigrationCloneError(
      Object.assign(new Error('clone failed'), { stderr: 'fatal: weird git exploded\nsecond line' }),
      false,
    );
    expect((err as any).statusCode).toBe(502);
    expect((err as any).code).toBe('MIGRATION_CLONE_FAILED');
    expect((err as any).message).toContain('weird git exploded');
    expect((err as any).message).not.toContain('\n');
  });
});
