import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export class RepoStorageService {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  getRepoPath(owner: string, name: string): string {
    return join(this.basePath, owner, `${name}.git`);
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
