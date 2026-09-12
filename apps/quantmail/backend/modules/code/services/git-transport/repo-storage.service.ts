import { execFile } from 'node:child_process';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { createAppError } from '@quant/server-core';
import { GIT_CHILD_ENV } from './git-child-env';

const execFileAsync = promisify(execFile);

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export class RepoStorageService {
  private readonly basePath: string;

  constructor(
    basePath: string = process.env['GIT_REPOS_PATH'] ?? join(process.cwd(), 'data', 'git-repos'),
  ) {
    this.basePath = basePath;
  }

  getRepoPath(owner: string, name: string): string {
    if (!owner || !name) {
      throw new Error('Invalid repository path: owner and name must not be empty');
    }
    if (owner.includes('..') || owner.includes('/') || owner.includes('\\')) {
      throw new Error('Invalid repository path: owner contains path traversal characters');
    }
    if (name.includes('..') || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid repository path: name contains path traversal characters');
    }

    const repoName = name.endsWith('.git') ? name : `${name}.git`;
    const repoPath = join(this.basePath, owner, repoName);
    const resolvedBase = resolve(this.basePath);
    const resolvedRepo = resolve(repoPath);
    if (!resolvedRepo.startsWith(resolvedBase + sep) && resolvedRepo !== resolvedBase) {
      throw new Error('Invalid repository path: path traversal detected');
    }
    return repoPath;
  }

  async initBareRepo(owner: string, name: string): Promise<string> {
    const repoPath = this.getRepoPath(owner, name);
    if (await this.repoExists(owner, name)) {
      throw createAppError(
        'Repository storage already contains Git history',
        409,
        'REPOSITORY_STORAGE_CONFLICT',
      );
    }

    const existedBeforeInit = await pathExists(repoPath);
    await mkdir(repoPath, { recursive: true });
    try {
      await execFileAsync('git', ['init', '--bare', repoPath], { env: GIT_CHILD_ENV });
      await access(join(repoPath, 'HEAD'));
      return repoPath;
    } catch (error) {
      // GZ-01: rollback owns only storage created by this invocation.
      if (!existedBeforeInit) {
        await rm(repoPath, { recursive: true, force: true });
      }
      throw error;
    }
  }

  async archiveRepo(owner: string, name: string, tombstoneName: string): Promise<string | null> {
    const sourcePath = this.getRepoPath(owner, name);
    const tombstonePath = this.getRepoPath(owner, tombstoneName);
    if (!(await pathExists(sourcePath))) return null;
    if (await pathExists(tombstonePath)) {
      throw createAppError(
        'Repository tombstone storage already exists',
        409,
        'REPOSITORY_STORAGE_CONFLICT',
      );
    }

    await rename(sourcePath, tombstonePath);
    return tombstonePath;
  }

  async deleteRepo(owner: string, name: string): Promise<void> {
    await rm(this.getRepoPath(owner, name), { recursive: true, force: true });
  }

  async repoExists(owner: string, name: string): Promise<boolean> {
    return pathExists(join(this.getRepoPath(owner, name), 'HEAD'));
  }
}
