import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseFrontMatter, validateProjectMemory } from '../validate-project-memory';

const tempRoots: string[] = [];

function frontMatter(fields: Record<string, string>, body: string): string {
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\n${body}\n`;
}

function metadata(
  id: string,
  type: string,
  authority: string,
  scope: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    doc_id: id,
    doc_type: type,
    authority,
    status: 'active',
    owner: 'test-owner',
    last_verified: '2026-07-22',
    verified_at_commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    review_by: '2099-01-01',
    supersedes: '[]',
    superseded_by: '[]',
    canonical_scope: scope,
    ...extra,
  };
}

function write(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function createFixture(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'quant-project-memory-'));
  tempRoots.push(root);
  write(
    root,
    'docs/README.md',
    frontMatter(metadata('index', 'authority-index', 'canonical', 'authority'), '# Index'),
  );
  write(
    root,
    'docs/CURRENT_STATE.md',
    frontMatter(metadata('state', 'current-state', 'canonical', 'state'), '# State'),
  );
  write(
    root,
    'docs/EXECUTION_QUEUE.md',
    frontMatter(
      metadata('queue', 'execution-queue', 'canonical', 'execution', {
        execution_status: 'active',
        milestone_id: 'M-test',
      }),
      '# Queue',
    ),
  );
  write(
    root,
    '.agents/README.md',
    frontMatter(
      metadata('agents', 'agent-artifacts-policy', 'non-authoritative', 'agents'),
      '# Agents',
    ),
  );
  write(
    root,
    '.kiro/steering/QUANT_CANONICAL_CONTEXT.md',
    frontMatter(
      {
        inclusion: 'always',
        ...metadata('steering', 'session-steering', 'canonical-pointer', 'steering'),
      },
      '# Steering',
    ),
  );
  write(
    root,
    '.kiro/steering/PRODUCTION_READINESS_PROMPT.md',
    frontMatter(
      { inclusion: 'manual', doc_type: 'historical', authority: 'non-authoritative' },
      '# Historical prompt',
    ),
  );
  write(
    root,
    'docs/adr/001-test.md',
    '# ADR-001: Test\n\n## Status\n\nACCEPTED\n\n## Date\n\n2026-07-22\n\n## Context\n\nC\n\n## Decision\n\nD\n\n## Consequences\n\nC\n',
  );
  write(
    root,
    'docs/adr/README.md',
    frontMatter(
      metadata('adrs', 'decision-index', 'canonical', 'decisions'),
      '# ADRs\n\n[001](./001-test.md)',
    ),
  );
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const NOW = new Date('2026-07-22T12:00:00.000Z');
const codes = (root: string): string[] =>
  validateProjectMemory(root, { now: NOW }).map((issue) => issue.code);

describe('parseFrontMatter', () => {
  it('parses scalar metadata and the document body', () => {
    expect(parseFrontMatter('---\ndoc_id: state\nstatus: active\n---\n# Body\n')).toEqual({
      metadata: { doc_id: 'state', status: 'active' },
      body: '# Body\n',
    });
  });
});

describe('validateProjectMemory', () => {
  it('accepts a complete fixture', () => {
    expect(validateProjectMemory(createFixture(), { now: NOW })).toEqual([]);
  });

  it('rejects canonical files and linked evidence that are not tracked by Git', () => {
    const root = createFixture();
    write(root, 'docs/untracked-evidence.md', '# Untracked evidence');
    write(
      root,
      'docs/README.md',
      frontMatter(
        metadata('index', 'authority-index', 'canonical', 'authority'),
        '# Index\n\n[evidence](./untracked-evidence.md)',
      ),
    );
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'memory-validator@example.invalid'], {
      cwd: root,
    });
    execFileSync('git', ['config', 'user.name', 'Memory Validator'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: root });
    execFileSync('git', ['rm', '--quiet', '--cached', '.agents/README.md'], { cwd: root });
    execFileSync('git', ['rm', '--quiet', '--cached', 'docs/untracked-evidence.md'], { cwd: root });

    expect(codes(root)).toEqual(
      expect.arrayContaining(['untracked-canonical-file', 'untracked-reference']),
    );
  });

  it('detects missing canonical files and metadata', () => {
    const root = createFixture();
    rmSync(path.join(root, '.agents/README.md'));
    write(root, 'docs/README.md', '---\ndoc_id: only\n---\n# Index\n');
    expect(codes(root)).toEqual(
      expect.arrayContaining(['missing-canonical-file', 'missing-metadata']),
    );
  });

  it('enforces one owner per canonical scope and one active milestone', () => {
    const root = createFixture();
    write(
      root,
      '.agents/README.md',
      frontMatter(
        metadata('agents', 'agent-artifacts-policy', 'non-authoritative', 'authority', {
          execution_status: 'active',
          milestone_id: 'M-other',
        }),
        '# Agents',
      ),
    );
    expect(codes(root)).toEqual(
      expect.arrayContaining(['duplicate-canonical-scope', 'active-milestone-count']),
    );
  });

  it('requires the execution queue to own the active milestone', () => {
    const root = createFixture();
    write(
      root,
      'docs/EXECUTION_QUEUE.md',
      frontMatter(metadata('queue', 'execution-queue', 'canonical', 'execution'), '# Queue'),
    );
    write(
      root,
      'docs/CURRENT_STATE.md',
      frontMatter(
        metadata('state', 'current-state', 'canonical', 'state', {
          execution_status: 'active',
          milestone_id: 'M-other',
        }),
        '# State',
      ),
    );
    expect(codes(root)).toContain('active-milestone-owner');
  });

  it('rejects current authority claimed by a historical document', () => {
    const root = createFixture();
    write(
      root,
      '.agents/README.md',
      frontMatter(metadata('agents', 'historical', 'canonical', 'agents'), '# Agents'),
    );
    expect(codes(root)).toContain('historical-authority');
  });

  it('detects broken local references and invalid steering inclusion', () => {
    const root = createFixture();
    write(
      root,
      '.kiro/steering/QUANT_CANONICAL_CONTEXT.md',
      frontMatter(
        {
          inclusion: 'manual',
          ...metadata('steering', 'session-steering', 'canonical-pointer', 'steering'),
        },
        '# Steering\n\n[missing](../../docs/DOES_NOT_EXIST.md)',
      ),
    );
    expect(codes(root)).toEqual(
      expect.arrayContaining(['broken-reference', 'invalid-steering-inclusion']),
    );
  });

  it('keeps the stale production prompt manual and non-authoritative', () => {
    const root = createFixture();
    write(
      root,
      '.kiro/steering/PRODUCTION_READINESS_PROMPT.md',
      frontMatter(
        { inclusion: 'always', doc_type: 'guidance', authority: 'canonical' },
        '# Prompt',
      ),
    );
    expect(codes(root)).toEqual(
      expect.arrayContaining(['historical-prompt-not-manual', 'historical-prompt-authority']),
    );
  });

  it('detects malformed and duplicate ADR identities', () => {
    const root = createFixture();
    write(
      root,
      'docs/adr/002-other.md',
      '# ADR-001: Duplicate\n\n## Status\n\nUNKNOWN\n\n## Date\n\nyesterday\n',
    );
    expect(codes(root)).toEqual(
      expect.arrayContaining([
        'adr-id-mismatch',
        'duplicate-adr-id',
        'invalid-adr-status',
        'invalid-adr-date',
        'missing-adr-section',
        'adr-not-indexed',
      ]),
    );
  });
});

describe('repository project memory', () => {
  it('accepts the checked-out canonical corpus', () => {
    const root = path.resolve(import.meta.dirname, '..', '..');
    expect(validateProjectMemory(root, { now: NOW })).toEqual([]);
  });
});
