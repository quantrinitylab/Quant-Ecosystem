import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, rm, mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const execFileAsync = promisify(execFile);

export class RepoStorageService {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  getRepoPath(owner: string, name: string): string {
    if (!owner || !name) {
      throw new Error('Invalid repository path: owner and name must not be empty');
    }
    if (owner.includes(sep) || owner.includes('/') || owner.includes('\\')) {
      throw new Error('Invalid repository path: owner contains path separators');
    }
    if (name.includes(sep) || name.includes('/') || name.includes('\\')) {
      throw new Error('Invalid repository path: name contains path separators');
    }

    const repoPath = join(this.basePath, owner, `${name}.git`);
    const resolvedBase = resolve(this.basePath);
    const resolvedRepo = resolve(repoPath);

    if (!resolvedRepo.startsWith(resolvedBase + sep) && resolvedRepo !== resolvedBase) {
      throw new Error('Invalid repository path: path traversal detected');
    }

    return repoPath.replace(/\\/g, '/');
  }

  async initBareRepo(owner: string, name: string): Promise<string> {
    const repoPath = this.getRepoPath(owner, name);
    await mkdir(repoPath, { recursive: true });
    await execFileAsync('git', ['init', '--bare', repoPath]);
    return repoPath;
  }

  async deleteRepo(owner: string, name: string): Promise<void> {
    const repoPath = this.getRepoPath(owner, name);
    await rm(repoPath, { recursive: true, force: true });
  }

  async repoExists(owner: string, name: string): Promise<boolean> {
    const repoPath = this.getRepoPath(owner, name);
    try {
      await access(repoPath);
      return true;
    } catch {
      return false;
    }
  }
}
