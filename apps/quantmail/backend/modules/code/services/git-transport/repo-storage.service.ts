import { execFile } from 'node:child_process';
import { access, mkdir, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const GIT_CHILD_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};

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
    await mkdir(repoPath, { recursive: true });
    try {
      await execFileAsync('git', ['init', '--bare', repoPath], { env: GIT_CHILD_ENV });
      await access(join(repoPath, 'HEAD'));
      return repoPath;
    } catch (error) {
      await rm(repoPath, { recursive: true, force: true });
      throw error;
    }
  }

  async deleteRepo(owner: string, name: string): Promise<void> {
    await rm(this.getRepoPath(owner, name), { recursive: true, force: true });
  }

  async repoExists(owner: string, name: string): Promise<boolean> {
    try {
      await access(join(this.getRepoPath(owner, name), 'HEAD'));
      return true;
    } catch {
      return false;
    }
  }
}
