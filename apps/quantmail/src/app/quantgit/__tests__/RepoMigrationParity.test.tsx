import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  RepoMigrationService,
  repoMigrationService,
  validateSourceUrl,
  parseRepoInfo,
  convertGitHubActionsToQuantWorkflow,
  convertGitLabCiToQuantWorkflow,
  extractEnvironmentVariables,
} from '../../../../backend/services/repo-migration.service';
import { RepoImportModal, MIGRATION_STEPS } from '../components/RepoImportModal';

describe('QuantGit Repository Migration & Pipeline Converter Suite', () => {
  describe('1. Git URL Validation & Parsing', () => {
    it('validates GitHub URLs for github provider', () => {
      expect(validateSourceUrl('https://github.com/facebook/react.git', 'github')).toBe(true);
      expect(validateSourceUrl('git@github.com:torvalds/linux.git', 'github')).toBe(true);
    });

    it('validates GitLab URLs for gitlab provider', () => {
      expect(validateSourceUrl('https://gitlab.com/gitlab-org/gitlab.git', 'gitlab')).toBe(true);
      expect(validateSourceUrl('git@gitlab.com:org/project.git', 'gitlab')).toBe(true);
    });

    it('rejects provider mismatch or invalid URLs', () => {
      expect(() => validateSourceUrl('https://gitlab.com/org/repo', 'github')).toThrowError(
        /Selected provider is GitHub, but the URL is not a GitHub URL/,
      );

      expect(() => validateSourceUrl('not-a-url', 'github')).toThrowError(
        /Invalid repository URL format/,
      );
    });

    it('extracts owner and repository name correctly', () => {
      const info1 = parseRepoInfo('https://github.com/google/guava.git');
      expect(info1.owner).toBe('google');
      expect(info1.name).toBe('guava');

      const info2 = parseRepoInfo('git@github.com:quant/quantmail.git');
      expect(info2.owner).toBe('quant');
      expect(info2.name).toBe('quantmail');
    });
  });

  describe('2. CI/CD Pipeline Converter', () => {
    it('translates GitHub Actions jobs, steps, runs-on, and secrets into QuantGit Actions', () => {
      const githubYaml = `
name: Node CI
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run Test Suite
        run: pnpm test
        env:
          DATABASE_URL: \${{ secrets.DATABASE_URL }}
          API_KEY: \${{ secrets.API_KEY }}
`;

      const result = convertGitHubActionsToQuantWorkflow(githubYaml, '.github/workflows/ci.yml');

      expect(result.sourceType).toBe('github-actions');
      expect(result.targetFile).toBe('.quant/workflows/ci.yml');
      expect(result.workflow.jobs['test']).toBeDefined();
      expect(result.workflow.jobs['test'].runsOn).toBe('quant-runner-linux-x64');

      // Verifies step translation
      const steps = result.workflow.jobs['test'].steps;
      expect(steps.some((s) => s.uses === 'quantgit/checkout@v1')).toBe(true);
      expect(steps.some((s) => s.name?.includes('Install dependencies'))).toBe(true);
      expect(steps.some((s) => s.run?.includes('pnpm test'))).toBe(true);

      // Verifies generated QuantGit workflow YAML content
      expect(result.workflowYaml).toContain('name: Node CI (QuantGit Migrated)');
      expect(result.workflowYaml).toContain('runs-on: quant-runner-linux-x64');
      expect(result.workflowYaml).toContain('uses: quantgit/checkout@v1');
      expect(result.workflowYaml).toContain('run: pnpm test');
    });

    it('translates GitLab CI stages, scripts, and artifacts into QuantGit Actions', () => {
      const gitlabYaml = `
stages:
  - build
  - test

compile_app:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

unit_tests:
  stage: test
  script:
    - npm test
`;

      const result = convertGitLabCiToQuantWorkflow(gitlabYaml, '.gitlab-ci.yml');

      expect(result.sourceType).toBe('gitlab-ci');
      expect(result.targetFile).toBe('.quant/workflows/ci.yml');
      expect(result.workflow.jobs['compile_app']).toBeDefined();
      expect(result.workflow.jobs['compile_app'].stage).toBe('build');
      expect(
        result.workflow.jobs['compile_app'].steps.some((s) => s.uses === 'quantgit/checkout@v1'),
      ).toBe(true);
      expect(result.workflow.jobs['compile_app'].steps.some((s) => s.run === 'npm run build')).toBe(
        true,
      );
      expect(result.workflow.jobs['compile_app'].artifacts?.paths).toContain('dist/');
      expect(result.workflow.jobs['compile_app'].artifacts?.expireIn).toBe('1 week');

      expect(result.workflowYaml).toContain('name: QuantGit CI Pipeline (Migrated from GitLab CI)');
      expect(result.workflowYaml).toContain('stage: build');
      expect(result.workflowYaml).toContain('expire_in: 1 week');
    });
  });

  describe('3. Environment & Secrets Extractor', () => {
    it('scans .env.example and workflow env blocks to detect variables and mask secrets', () => {
      const sampleEnv = `
# Core config
DATABASE_URL=postgresql://quant:secret@localhost:5432/quant_db
PORT=8080
NODE_ENV=production
API_KEY=sk_live_dummy12345
JWT_SECRET=super_secret_quant_key_123
`;
      const sampleWorkflow = `
env:
  DATABASE_URL: \${{ secrets.DATABASE_URL }}
  CUSTOM_EXTERNAL_TOKEN: \${{ secrets.CUSTOM_EXTERNAL_TOKEN }}
  CACHE_TTL: 3600
`;

      const envVars = extractEnvironmentVariables(sampleEnv, sampleWorkflow);

      // Verify detection
      const keys = envVars.map((v) => v.key);
      expect(keys).toContain('DATABASE_URL');
      expect(keys).toContain('PORT');
      expect(keys).toContain('API_KEY');
      expect(keys).toContain('JWT_SECRET');
      expect(keys).toContain('CUSTOM_EXTERNAL_TOKEN');

      // Verify secret masking
      const dbVar = envVars.find((v) => v.key === 'DATABASE_URL');
      expect(dbVar?.isSecret).toBe(true);
      expect(dbVar?.maskedValue).toContain('Ready for QuantSecret injection');

      const portVar = envVars.find((v) => v.key === 'PORT');
      expect(portVar?.isSecret).toBe(false);
      expect(portVar?.maskedValue).toBe('8080');

      const jwtVar = envVars.find((v) => v.key === 'JWT_SECRET');
      expect(jwtVar?.isSecret).toBe(true);
      expect(jwtVar?.description).toContain('JSON Web Token');
    });
  });

  describe('4. Backend RepoMigrationService Integration', () => {
    it('executes full repository migration pipeline with mock-resilient refs and commit tree', async () => {
      const service = new RepoMigrationService();

      const result = await service.importRepository({
        sourceUrl: 'https://github.com/torvalds/linux.git',
        provider: 'github',
        targetOwner: 'kundan',
        targetRepoName: 'linux-sovereign',
        isPrivate: false,
        importPipelines: true,
        importEnv: true,
      });

      expect(result.repo).toBeDefined();
      expect(result.repo.name).toBe('linux-sovereign');
      expect(result.repo.ownerId).toBe('kundan');
      expect(result.repo.visibility).toBe('public');
      expect(result.repo.branches).toContain('main');
      expect(result.importedCommits).toBeGreaterThan(0);
      expect(result.convertedPipelines.length).toBeGreaterThan(0);
      expect(result.importedEnvVars.length).toBeGreaterThan(0);
      expect(result.repo.cloneUrl).toContain('/git/kundan/linux-sovereign.git');
      expect(result.repo.sshUrl).toContain('git@quantmail.in:kundan/linux-sovereign.git');
    });
  });

  describe('5. Frontend RepoImportModal Component', () => {
    it('renders modal title, provider tabs, clone URL input, visibility radios, and conversion checkboxes', () => {
      const html = renderToStaticMarkup(
        <RepoImportModal
          isOpen={true}
          onClose={vi.fn()}
          currentUsername="developer"
          onImportSuccess={vi.fn()}
          showToast={vi.fn()}
        />,
      );

      // Title & subtitle
      expect(html).toContain('Import repository from GitHub / GitLab');
      expect(html).toContain('Migrate Git refs, commit trees, CI/CD actions workflows');

      // Provider tabs
      expect(html).toContain('GitHub');
      expect(html).toContain('GitLab');
      expect(html).toContain('Generic Git URL');

      // Inputs & labels
      expect(html).toContain('Source Repository Clone URL');
      expect(html).toContain('Personal Access Token (PAT)');
      expect(html).toContain('Target Repository Name');
      expect(html).toContain('Public');
      expect(html).toContain('Private');

      // Conversion checkboxes
      expect(html).toContain(
        'Convert CI/CD pipelines (.github/workflows / .gitlab-ci.yml to QuantGit Actions)',
      );
      expect(html).toContain('Extract environment variables &amp; secrets templates');

      // Action buttons
      expect(html).toContain('Begin Migration');
      expect(html).toContain('Cancel');
    });

    it('defines all 5 migration steps correctly in MIGRATION_STEPS', () => {
      expect(MIGRATION_STEPS).toHaveLength(5);
      expect(MIGRATION_STEPS[0].title).toBe(
        'Connecting to remote provider & verifying credentials',
      );
      expect(MIGRATION_STEPS[1].title).toBe('Ingesting Git commit trees, branches, and tags');
      expect(MIGRATION_STEPS[2].title).toBe('Converting CI/CD pipelines to QuantGit Actions');
      expect(MIGRATION_STEPS[3].title).toBe(
        'Registering environment variables & security policies',
      );
      expect(MIGRATION_STEPS[4].title).toBe('Migration Complete!');
    });

    it('returns empty string when isOpen is false', () => {
      const html = renderToStaticMarkup(
        <RepoImportModal isOpen={false} onClose={vi.fn()} currentUsername="developer" />,
      );

      expect(html).toBe('');
    });
  });
});
