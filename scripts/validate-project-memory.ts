import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CANONICAL_FILES = [
  'docs/README.md',
  'docs/CURRENT_STATE.md',
  'docs/EXECUTION_QUEUE.md',
  'docs/adr/README.md',
  '.agents/README.md',
  '.kiro/steering/QUANT_CANONICAL_CONTEXT.md',
] as const;

const HISTORICAL_PROMPT = '.kiro/steering/PRODUCTION_READINESS_PROMPT.md';
const REQUIRED_METADATA = [
  'doc_id',
  'doc_type',
  'authority',
  'status',
  'owner',
  'last_verified',
  'verified_at_commit',
  'review_by',
  'supersedes',
  'superseded_by',
  'canonical_scope',
] as const;
const ADR_SECTIONS = ['Status', 'Date', 'Context', 'Decision', 'Consequences'] as const;
const ADR_STATUSES = ['PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED'] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/i;
const DAY_MS = 86_400_000;

export interface ProjectMemoryIssue {
  code: string;
  file: string;
  message: string;
}

export interface ParsedDocument {
  metadata: Record<string, string>;
  body: string;
}

export interface ValidationOptions {
  now?: Date;
  maxAgeDays?: number;
  verifyGit?: boolean;
}

interface ResolvedValidationOptions {
  now: Date;
  maxAgeDays: number;
  verifyGit: boolean;
}

function normalize(content: string): string {
  return content.replaceAll('\r\n', '\n');
}

export function parseFrontMatter(content: string): ParsedDocument | null {
  const match = normalize(content).match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match?.[1]) return null;

  const metadata: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) return null;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!key || key in metadata) return null;
    metadata[key] = value;
  }
  return { metadata, body: match[2] ?? '' };
}

function add(issues: ProjectMemoryIssue[], code: string, file: string, message: string): void {
  issues.push({ code, file: file.replaceAll('\\', '/'), message });
}

function dateValue(value: string | undefined): number | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return null;
  return parsed.getTime();
}

function localMarkdownLinks(body: string): string[] {
  const targets: string[] = [];
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of body.matchAll(pattern)) {
    const target = match[1]?.trim();
    if (!target || target.startsWith('#') || /^[a-z]+:/i.test(target)) continue;
    targets.push(target.split('#', 1)[0] ?? target);
  }
  return targets;
}

function isGitWorkTree(root: string): boolean {
  try {
    return (
      execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === 'true'
    );
  } catch {
    return false;
  }
}

function isGitTracked(root: string, absolutePath: string): boolean {
  const relativePath = path.relative(root, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return false;
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function validateLinks(
  root: string,
  relativePath: string,
  body: string,
  issues: ProjectMemoryIssue[],
  verifyGit: boolean,
): void {
  for (const target of localMarkdownLinks(body)) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      add(issues, 'malformed-reference', relativePath, `Malformed link target: ${target}`);
      continue;
    }
    const resolved = path.resolve(root, path.dirname(relativePath), decoded);
    const repositoryRelative = path.relative(root, resolved);
    if (repositoryRelative.startsWith('..') || path.isAbsolute(repositoryRelative)) {
      add(
        issues,
        'reference-outside-repository',
        relativePath,
        `Link leaves repository: ${target}`,
      );
      continue;
    }
    if (!existsSync(resolved)) {
      add(issues, 'broken-reference', relativePath, `Missing link target: ${target}`);
    } else if (verifyGit && !isGitTracked(root, resolved)) {
      add(
        issues,
        'untracked-reference',
        relativePath,
        `Local link target is not tracked by Git: ${target}`,
      );
    }
  }
}

function validateCommit(
  root: string,
  relativePath: string,
  commit: string | undefined,
  issues: ProjectMemoryIssue[],
): void {
  if (!COMMIT_SHA.test(commit ?? '')) {
    add(
      issues,
      'invalid-verified-commit',
      relativePath,
      'verified_at_commit must be a full 40-character SHA',
    );
    return;
  }
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {
      cwd: root,
      stdio: 'ignore',
    });
  } catch {
    add(
      issues,
      'unknown-verified-commit',
      relativePath,
      `${commit} does not resolve to a local commit`,
    );
    return;
  }
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', commit!, 'HEAD'], {
      cwd: root,
      stdio: 'ignore',
    });
  } catch {
    add(
      issues,
      'non-ancestor-verified-commit',
      relativePath,
      `${commit} is not an ancestor of HEAD`,
    );
  }
}

function validateCanonicalFiles(
  root: string,
  issues: ProjectMemoryIssue[],
  options: ResolvedValidationOptions,
): Map<string, ParsedDocument> {
  const documents = new Map<string, ParsedDocument>();
  const ids = new Map<string, string>();
  const scopes = new Map<string, string>();
  const activeMilestones: string[] = [];

  for (const relativePath of CANONICAL_FILES) {
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) {
      add(issues, 'missing-canonical-file', relativePath, 'Required canonical file does not exist');
      continue;
    }
    if (options.verifyGit && !isGitTracked(root, absolutePath)) {
      add(
        issues,
        'untracked-canonical-file',
        relativePath,
        'Canonical files must be tracked by Git',
      );
    }
    const parsed = parseFrontMatter(readFileSync(absolutePath, 'utf8'));
    if (!parsed) {
      add(issues, 'invalid-front-matter', relativePath, 'Expected simple YAML front matter');
      continue;
    }
    documents.set(relativePath, parsed);
    for (const key of REQUIRED_METADATA) {
      if (!(key in parsed.metadata))
        add(issues, 'missing-metadata', relativePath, `Missing ${key}`);
    }

    const id = parsed.metadata['doc_id'];
    if (id) {
      const prior = ids.get(id);
      if (prior)
        add(issues, 'duplicate-doc-id', relativePath, `${id} is already owned by ${prior}`);
      else ids.set(id, relativePath);
    }
    const scope = parsed.metadata['canonical_scope'];
    if (scope) {
      const prior = scopes.get(scope);
      if (prior)
        add(
          issues,
          'duplicate-canonical-scope',
          relativePath,
          `${scope} is already owned by ${prior}`,
        );
      else scopes.set(scope, relativePath);
    }

    const verified = dateValue(parsed.metadata['last_verified']);
    const reviewBy = dateValue(parsed.metadata['review_by']);
    if (verified === null)
      add(
        issues,
        'invalid-verification-date',
        relativePath,
        'last_verified must be a real YYYY-MM-DD date',
      );
    else if (options.now.getTime() - verified > options.maxAgeDays * DAY_MS) {
      add(
        issues,
        'stale-current-memory',
        relativePath,
        `last_verified is older than ${options.maxAgeDays} days`,
      );
    }
    if (reviewBy === null)
      add(issues, 'invalid-review-date', relativePath, 'review_by must be a real YYYY-MM-DD date');
    else if (reviewBy + DAY_MS <= options.now.getTime())
      add(issues, 'review-overdue', relativePath, 'review_by is in the past');
    if (options.verifyGit)
      validateCommit(root, relativePath, parsed.metadata['verified_at_commit'], issues);
    else if (!COMMIT_SHA.test(parsed.metadata['verified_at_commit'] ?? '')) {
      add(
        issues,
        'invalid-verified-commit',
        relativePath,
        'verified_at_commit must be a full 40-character SHA',
      );
    }

    if (parsed.metadata['doc_type'] === 'historical') {
      if (
        parsed.metadata['authority'] === 'canonical' ||
        parsed.metadata['execution_status'] === 'active'
      ) {
        add(
          issues,
          'historical-authority',
          relativePath,
          'Historical documents cannot claim current authority',
        );
      }
    }
    if (parsed.metadata['execution_status'] === 'active') {
      activeMilestones.push(relativePath);
      if (!parsed.metadata['milestone_id']) {
        add(issues, 'missing-milestone-id', relativePath, 'Active milestone requires milestone_id');
      }
    }
    validateLinks(root, relativePath, parsed.body, issues, options.verifyGit);
  }

  if (activeMilestones.length !== 1) {
    add(
      issues,
      'active-milestone-count',
      'docs/EXECUTION_QUEUE.md',
      `Expected exactly one active milestone; found ${activeMilestones.length}`,
    );
  }
  if (activeMilestones.length === 1 && activeMilestones[0] !== 'docs/EXECUTION_QUEUE.md') {
    add(
      issues,
      'active-milestone-owner',
      activeMilestones[0]!,
      'docs/EXECUTION_QUEUE.md must own the active milestone',
    );
  }
  const steering = documents.get('.kiro/steering/QUANT_CANONICAL_CONTEXT.md');
  if (steering && steering.metadata['inclusion'] !== 'always') {
    add(
      issues,
      'invalid-steering-inclusion',
      '.kiro/steering/QUANT_CANONICAL_CONTEXT.md',
      'inclusion must be always',
    );
  }
  return documents;
}

function validateHistoricalPrompt(root: string, issues: ProjectMemoryIssue[]): void {
  const absolutePath = path.join(root, HISTORICAL_PROMPT);
  if (!existsSync(absolutePath)) {
    add(
      issues,
      'missing-historical-prompt',
      HISTORICAL_PROMPT,
      'Historical production prompt must remain available',
    );
    return;
  }
  const parsed = parseFrontMatter(readFileSync(absolutePath, 'utf8'));
  if (!parsed) {
    add(
      issues,
      'invalid-historical-prompt-front-matter',
      HISTORICAL_PROMPT,
      'Prompt requires classification front matter',
    );
    return;
  }
  if (parsed.metadata['inclusion'] !== 'manual') {
    add(
      issues,
      'historical-prompt-not-manual',
      HISTORICAL_PROMPT,
      'Stale production prompt must use inclusion: manual',
    );
  }
  if (
    parsed.metadata['doc_type'] !== 'historical' ||
    parsed.metadata['authority'] !== 'non-authoritative'
  ) {
    add(
      issues,
      'historical-prompt-authority',
      HISTORICAL_PROMPT,
      'Prompt must be historical and non-authoritative',
    );
  }
}

function sectionBody(markdown: string, section: string): string | null {
  const lines = normalize(markdown).split('\n');
  const start = lines.findIndex((line) => line.trim() === `## ${section}`);
  if (start < 0) return null;
  const values: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (line.startsWith('## ')) break;
    values.push(line);
  }
  return values.join('\n').trim();
}

function validateAdrs(
  root: string,
  index: ParsedDocument | undefined,
  issues: ProjectMemoryIssue[],
): void {
  const adrDirectory = path.join(root, 'docs', 'adr');
  if (!existsSync(adrDirectory)) {
    add(issues, 'missing-adr-directory', 'docs/adr', 'ADR directory does not exist');
    return;
  }
  const indexedFiles = new Set(
    (index ? localMarkdownLinks(index.body) : [])
      .map((target) => path.basename(target))
      .filter((target) => /^\d{3}-.*\.md$/i.test(target)),
  );
  const ids = new Map<string, string>();
  const files = readdirSync(adrDirectory)
    .filter((file) => /^\d{3}-.*\.md$/i.test(file) && file !== '000-template.md')
    .sort();

  for (const file of files) {
    const relativePath = `docs/adr/${file}`;
    const body = readFileSync(path.join(adrDirectory, file), 'utf8');
    const title = normalize(body).match(/^# ADR-(\d{3}):\s+.+$/m);
    const filenameId = file.match(/^(\d{3})-/)?.[1];
    const adrId = title?.[1];
    if (!adrId) add(issues, 'missing-adr-title', relativePath, 'Expected # ADR-NNN: Title');
    else {
      if (filenameId !== adrId)
        add(
          issues,
          'adr-id-mismatch',
          relativePath,
          `Filename ${filenameId} does not match title ${adrId}`,
        );
      const prior = ids.get(adrId);
      if (prior)
        add(issues, 'duplicate-adr-id', relativePath, `ADR-${adrId} is already owned by ${prior}`);
      else ids.set(adrId, relativePath);
    }

    for (const section of ADR_SECTIONS) {
      const present =
        section === 'Decision'
          ? sectionBody(body, section) !== null ||
            /^## Decision\b/m.test(body) ||
            /^## \d+\./m.test(body)
          : sectionBody(body, section) !== null;
      if (!present) add(issues, 'missing-adr-section', relativePath, `Missing ## ${section}`);
    }
    const status = sectionBody(body, 'Status') ?? '';
    if (!ADR_STATUSES.some((candidate) => new RegExp(`^${candidate}\\b`).test(status))) {
      add(
        issues,
        'invalid-adr-status',
        relativePath,
        `Status must start with ${ADR_STATUSES.join(', ')}`,
      );
    }
    const rawDate = (sectionBody(body, 'Date') ?? '').split('\n')[0]?.trim() ?? '';
    const date = rawDate.match(/^(\d{4}-\d{2}-\d{2})(?:\s|$)/)?.[1];
    if (dateValue(date) === null)
      add(
        issues,
        'invalid-adr-date',
        relativePath,
        'ADR date must start with a real YYYY-MM-DD date',
      );
    if (!indexedFiles.has(file))
      add(issues, 'adr-not-indexed', relativePath, 'ADR is missing from docs/adr/README.md');
  }
}

export function validateProjectMemory(
  root: string,
  options: ValidationOptions = {},
): ProjectMemoryIssue[] {
  const resolved: ResolvedValidationOptions = {
    now: options.now ?? new Date(),
    maxAgeDays: options.maxAgeDays ?? 45,
    verifyGit: options.verifyGit ?? isGitWorkTree(root),
  };
  const issues: ProjectMemoryIssue[] = [];
  const documents = validateCanonicalFiles(root, issues, resolved);
  validateHistoricalPrompt(root, issues);
  validateAdrs(root, documents.get('docs/adr/README.md'), issues);
  return issues.sort(
    (left, right) => left.file.localeCompare(right.file) || left.code.localeCompare(right.code),
  );
}

function runCli(): void {
  const root = path.resolve(process.argv[2] ?? process.cwd());
  const issues = validateProjectMemory(root);
  if (issues.length === 0) {
    console.log('Project memory validation passed.');
    return;
  }
  console.error(`Project memory validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`- [${issue.code}] ${issue.file}: ${issue.message}`);
  }
  process.exitCode = 1;
}

const entrypoint = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entrypoint === fileURLToPath(import.meta.url)) runCli();
