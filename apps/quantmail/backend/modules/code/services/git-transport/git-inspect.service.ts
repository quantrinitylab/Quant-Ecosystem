import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAppError } from '@quant/server-core';
import { RepoStorageService } from './repo-storage.service';

const execFileAsync = promisify(execFile);
const MAX_GIT_OUTPUT_BUFFER = 50 * 1024 * 1024;
const VALID_REF = /^[a-zA-Z0-9_.\-/]+$/;
const GIT_CHILD_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};

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
}

export interface GitBlob {
  path: string;
  content: string;
  size: number;
  sha: string;
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
      return stdout
        .split('\n')
        .filter(Boolean)
        .flatMap((line): GitTreeEntry[] => {
          const match = line.match(/^(\d+)\s+(blob|tree)\s+([0-9a-f]+)\s+(\d+|-)\t(.+)$/);
          if (!match) return [];
          const [, mode, type, sha, rawSize, path] = match;
          const pathParts = path.split('/');
          return [{
            mode,
            type: type as 'blob' | 'tree',
            sha,
            size: rawSize === '-' ? 0 : Number.parseInt(rawSize, 10),
            path,
            name: pathParts[pathParts.length - 1] ?? path,
          }];
        });
    } catch {
      return [];
    }
  }

  async getBlob(owner: string, name: string, ref: string, filePath: string): Promise<GitBlob> {
    validateRef(ref);
    if (!(await this.repoStorage.repoExists(owner, name))) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    const repoPath = this.repoStorage.getRepoPath(owner, name);
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
      };
    } catch {
      throw createAppError('File not found in ref', 404, 'FILE_NOT_FOUND');
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
  ): Promise<{ patch: string; stat: string; base: string; head: string }> {
    validateRef(base);
    validateRef(head);
    const repoPath = this.repoStorage.getRepoPath(owner, name);
    const range = `${base}..${head}`;
    const options = {
      cwd: repoPath,
      maxBuffer: MAX_GIT_OUTPUT_BUFFER,
      env: GIT_CHILD_ENV,
    };

    const [{ stdout: patch }, { stdout: stat }] = await Promise.all([
      execFileAsync('git', ['diff', '-p', '--end-of-options', range, '--'], options),
      execFileAsync('git', ['diff', '--stat', '--end-of-options', range, '--'], options),
    ]);
    return { patch, stat, base, head };
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
}
