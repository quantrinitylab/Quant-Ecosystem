import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAppError } from '@quant/server-core';
import { RepoStorageService } from './repo-storage.service';
import { GIT_CHILD_ENV } from './git-child-env';

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BUFFER = 50 * 1024 * 1024;
const VALID_REF = /^[a-zA-Z0-9_.\-/]+$/;

function validateRef(ref: string): void {
  if (!ref || ref.startsWith('-') || !VALID_REF.test(ref)) {
    throw createAppError('Invalid Git ref', 400, 'INVALID_GIT_REF');
  }
}

export interface GitTreeEntry {
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size: number;
  path: string;
  name: string;
  /**
   * Real last-commit message subject touching this path (`git log -1` on the
   * listed ref). Absent when the ref does not resolve or git cannot determine
   * one (empty repo, unborn branch, enrichment failure) — callers must render
   * an honest empty state and never fabricate a message in its place.
   */
  lastCommit?: string;
  /**
   * ISO 8601 committer date of `lastCommit`. Absent whenever `lastCommit`
   * is absent.
   */
  lastCommitDate?: string;
}

/**
 * Upper bound on per-path `git log -1` calls for a single tree listing.
 * Bounds latency on huge directory roots; entries beyond the cap keep
 * `lastCommit` absent (honest empty) instead of slowing the response.
 */
const MAX_TREE_RECENCY_ENTRIES = 200;

export interface GitBlob {
  path: string;
  content: string;
  size: number;
  /**
   * Echo of the raw ref the blob was read at (e.g. "main"). Kept for
   * display compatibility; NOT a commit id.
   */
  sha: string;
  /**
   * The commit SHA the requested ref resolved to at read time
   * (`git rev-parse <ref>^{commit}`). This is the optimistic-concurrency
   * token the blob editor must send back as `parentSha` when committing.
   * Empty when the ref does not resolve (e.g. an unborn branch).
   */
  headSha: string;
}

export interface GitCommit {
  sha: string;
  parents: string[];
  author: { name: string; email: string };
  timestamp: number;
  message: string;
}

export class GitInspectService {
  constructor(private readonly repoStorage: RepoStorageService = new RepoStorageService()) {}

  async getTree(
    owner: string,
    name: string,
    ref: string,
    treePath?: string,
  ): Promise<GitTreeEntry[]> {
    validateRef(ref);
    if (!(await this.repoStorage.repoExists(owner, name))) return [];

    const repoPath = this.repoStorage.getRepoPath(owner, name);
    const args = ['ls-tree', '-l', '--end-of-options', ref];
    if (treePath) args.push('--', `${treePath.replace(/\/$/, '')}/`);

    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: repoPath,
        maxBuffer: MAX_GIT_OUTPUT_BUFFER,
        env: GIT_CHILD_ENV,
      });

      if (!stdout.trim()) return [];
      const entries = stdout
        .split('\n')
        .filter(Boolean)
        .flatMap((line): GitTreeEntry[] => {
          const match = line.match(/^(\d+)\s+(blob|tree)\s+([0-9a-f]+)\s+(\d+|-)\t(.+)$/);
          if (!match) return [];
          const [, mode, type, sha, rawSize, path] = match;
          const pathParts = path.split('/');
          return [
            {
              mode,
              type: type as 'blob' | 'tree',
              sha,
              size: rawSize === '-' ? 0 : Number.parseInt(rawSize, 10),
              path,
              name: pathParts[pathParts.length - 1] ?? path,
            },
          ];
        });

      await this.enrichTreeWithLastCommits(repoPath, ref, entries);
      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Real per-file last-commit lookup: the newest commit touching `path` on
   * `ref` (subject + ISO 8601 committer date), or null when unknowable.
   * The pathspec comes from `git ls-tree` output (repo content, not user
   * input), but it is still passed after `--` with `--end-of-options` on the
   * ref, so a leading `-` in a filename can never become a git flag.
   */
  private async getLastCommitForPath(
    repoPath: string,
    ref: string,
    path: string,
  ): Promise<{ message: string; date: string } | null> {
    const safePath = path.startsWith('-') ? `./${path}` : path;
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['log', '-1', '--format=%s%x1f%cI', '--end-of-options', ref, '--', safePath],
        { cwd: repoPath, maxBuffer: MAX_GIT_OUTPUT_BUFFER, env: GIT_CHILD_ENV },
      );
      const line = stdout.trim();
      if (!line) return null;
      const sep = line.indexOf('\x1f');
      if (sep === -1) return null;
      const message = line.slice(0, sep).trim();
      const date = line.slice(sep + 1).trim();
      if (!message || !date) return null;
      return { message, date };
    } catch {
      return null;
    }
  }

  /**
   * Attaches real last-commit data to tree entries in place (same enrichment
   * pattern as the branch-head recency fix). Failures stay silent: an entry
   * that cannot be resolved keeps `lastCommit` absent so the UI can render an
   * honest empty state instead of a fabricated "Update file".
   */
  private async enrichTreeWithLastCommits(
    repoPath: string,
    ref: string,
    entries: GitTreeEntry[],
  ): Promise<void> {
    const targets = entries.slice(0, MAX_TREE_RECENCY_ENTRIES);
    await Promise.all(
      targets.map(async (entry) => {
        const last = await this.getLastCommitForPath(repoPath, ref, entry.path);
        if (last) {
          entry.lastCommit = last.message;
          entry.lastCommitDate = last.date;
        }
      }),
    );
  }

  async getBlob(owner: string, name: string, ref: string, filePath: string): Promise<GitBlob> {
    validateRef(ref);
    if (!(await this.repoStorage.repoExists(owner, name))) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    const repoPath = this.repoStorage.getRepoPath(owner, name);

    /*
     * Resolve the requested ref to its commit SHA up front. The blob editor
     * needs the branch HEAD sha as the optimistic-concurrency token
     * (parentSha) for commits; `sha` below echoes the raw ref for display
     * compatibility, so `headSha` is the authoritative commit id. Resolving
     * before the read also lets the 404 path report the head, so creating a
     * NEW file on a non-empty branch can still send a valid parentSha.
     */
    let headSha = '';
    try {
      const { stdout } = await execFileAsync(
        'git',
        ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
        { cwd: repoPath, maxBuffer: MAX_GIT_OUTPUT_BUFFER, env: GIT_CHILD_ENV },
      );
      headSha = stdout.trim();
    } catch {
      headSha = '';
    }

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['show', '--end-of-options', `${ref}:${filePath}`, '--'],
        { cwd: repoPath, maxBuffer: MAX_GIT_OUTPUT_BUFFER, env: GIT_CHILD_ENV },
      );
      return {
        path: filePath,
        content: stdout,
        size: Buffer.byteLength(stdout),
        sha: ref,
        headSha,
      };
    } catch {
      throw createAppError('File not found in ref', 404, 'FILE_NOT_FOUND', { headSha });
    }
  }

  async getCommits(
    owner: string,
    name: string,
    ref = 'HEAD',
    options: { limit?: number; skip?: number } = {},
  ): Promise<GitCommit[]> {
    validateRef(ref);
    if (!(await this.repoStorage.repoExists(owner, name))) return [];

    const repoPath = this.repoStorage.getRepoPath(owner, name);
    const limit = options.limit || 30;
    const skip = options.skip || 0;
    try {
      const { stdout } = await execFileAsync(
        'git',
        [
          'log',
          '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s',
          '-n',
          String(limit),
          '--skip',
          String(skip),
          '--end-of-options',
          ref,
        ],
        { cwd: repoPath, maxBuffer: MAX_GIT_OUTPUT_BUFFER, env: GIT_CHILD_ENV },
      );

      if (!stdout.trim()) return [];
      return stdout
        .trimEnd()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [sha, rawParents, authorName, authorEmail, rawTimestamp, message] =
            line.split('\x1f');
          return {
            sha,
            parents: rawParents ? rawParents.split(' ').filter(Boolean) : [],
            author: { name: authorName, email: authorEmail },
            timestamp: Number.parseInt(rawTimestamp, 10),
            message,
          };
        });
    } catch {
      return [];
    }
  }

  async getDiff(
    owner: string,
    name: string,
    base: string,
    head: string,
  ): Promise<{
    patch: string;
    stat: string;
    base: string;
    head: string;
    additions: number;
    deletions: number;
    changedFiles: number;
  }> {
    validateRef(base);
    validateRef(head);
    const repoPath = this.repoStorage.getRepoPath(owner, name);
    const range = `${base}..${head}`;
    const options = {
      cwd: repoPath,
      maxBuffer: MAX_GIT_OUTPUT_BUFFER,
      env: GIT_CHILD_ENV,
    };

    const [{ stdout: patch }, { stdout: stat }, { stdout: numstat }] = await Promise.all([
      execFileAsync('git', ['diff', '-p', '--end-of-options', range, '--'], options),
      execFileAsync('git', ['diff', '--stat', '--end-of-options', range, '--'], options),
      execFileAsync('git', ['diff', '--numstat', '--end-of-options', range, '--'], options),
    ]);

    let additions = 0;
    let deletions = 0;
    let changedFiles = 0;

    for (const line of numstat.split('\n')) {
      if (!line.trim()) continue;
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const add = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10) || 0;
        const del = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10) || 0;
        additions += add;
        deletions += del;
        changedFiles += 1;
      }
    }

    return { patch, stat, base, head, additions, deletions, changedFiles };
  }

  async checkMerge(
    owner: string,
    name: string,
    base: string,
    head: string,
  ): Promise<{ clean: boolean; output: string }> {
    validateRef(base);
    validateRef(head);
    const repoPath = this.repoStorage.getRepoPath(owner, name);
    const { stdout } = await execFileAsync('git', ['merge-tree', base, head], {
      cwd: repoPath,
      maxBuffer: MAX_GIT_OUTPUT_BUFFER,
      env: GIT_CHILD_ENV,
    });
    return { clean: !stdout.includes('<<<<<<<'), output: stdout };
  }

  async searchCode(
    owner: string,
    name: string,
    ref: string,
    query: string,
    pathFilter?: string,
  ): Promise<GitCodeSearchMatch[]> {
    validateRef(ref);
    if (!(await this.repoStorage.repoExists(owner, name))) return [];

    const repoPath = this.repoStorage.getRepoPath(owner, name);
    const args = ['grep', '-n', '-I', '--ignore-case', '-m', '100', '-e', query, ref];
    if (pathFilter) {
      args.push('--', pathFilter);
    }

    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: repoPath,
        maxBuffer: MAX_GIT_OUTPUT_BUFFER,
        env: GIT_CHILD_ENV,
        timeout: 5000,
      });

      if (!stdout.trim()) return [];
      const matches: GitCodeSearchMatch[] = [];
      const lines = stdout.split('\n');
      for (const rawLine of lines) {
        if (!rawLine.trim()) continue;
        let stripped = rawLine;
        if (stripped.startsWith(`${ref}:`)) {
          stripped = stripped.slice(ref.length + 1);
        }
        const firstColon = stripped.indexOf(':');
        if (firstColon === -1) continue;
        const secondColon = stripped.indexOf(':', firstColon + 1);
        if (secondColon === -1) continue;

        const filePath = stripped.slice(0, firstColon);
        const lineNumStr = stripped.slice(firstColon + 1, secondColon);
        const lineContent = stripped.slice(secondColon + 1);
        const lineNumber = parseInt(lineNumStr, 10);
        if (isNaN(lineNumber)) continue;

        matches.push({
          path: filePath,
          lineNumber,
          lineContent,
        });
        if (matches.length >= 100) break;
      }
      return matches;
    } catch (err: any) {
      // Git grep exits with code 1 when no matches are found — standard expected behavior
      if (err?.code === 1 || err?.status === 1) {
        return [];
      }
      return [];
    }
  }
}

export interface GitCodeSearchMatch {
  path: string;
  lineNumber: number;
  lineContent: string;
}
