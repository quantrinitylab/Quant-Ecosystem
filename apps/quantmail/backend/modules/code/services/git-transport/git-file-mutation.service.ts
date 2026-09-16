import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { promisify } from 'node:util';
import { RepositoryHeadConflictError, type RepositoryMutationPort } from '@quant/server-core';
import { GIT_CHILD_ENV } from './git-child-env';
import { RepoStorageService } from './repo-storage.service';

const execFileAsync = promisify(execFile);
const ZERO_SHA = '0000000000000000000000000000000000000000';

function normalizeFilePath(input: string): string {
  if (input.includes('\0') || input.includes('\\') || input.startsWith('/')) {
    throw new Error('Invalid repository-relative file path');
  }

  const originalSegments = input.split('/');
  const normalized = posix.normalize(input);
  const normalizedSegments = normalized.split('/');

  if (
    normalized === '.' ||
    normalized.startsWith('../') ||
    originalSegments.some((segment) => segment.length === 0) ||
    normalizedSegments.some(
      (segment) => segment === '..' || segment === '.git' || segment.length === 0,
    )
  ) {
    throw new Error('Invalid repository-relative file path');
  }

  return normalized;
}

function sanitizeAuthorName(value: string): string {
  const sanitized = value.replace(/[\r\n<>]/g, ' ').trim();
  return sanitized || 'QuantGit';
}

function sanitizeAuthorEmail(value: string, owner: string): string {
  const sanitized = value.replace(/[\r\n<>]/g, '').trim();

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sanitized)) {
    return sanitized;
  }

  const safeOwner = owner.replace(/[^A-Za-z0-9._-]/g, '') || 'author';
  return `${safeOwner}@quantgit.local`;
}

export class GitFileMutationService implements RepositoryMutationPort {
  constructor(private readonly storage: RepoStorageService = new RepoStorageService()) {}

  private async git(
    repoPath: string,
    args: string[],
    env: NodeJS.ProcessEnv = GIT_CHILD_ENV,
  ): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: repoPath,
      env,
      maxBuffer: 4 * 1024 * 1024,
    });

    return stdout.trim();
  }

  private async validateBranch(repoPath: string, branch: string): Promise<void> {
    await this.git(repoPath, ['check-ref-format', '--branch', branch]);
  }

  private async resolveFileMode(
    repoPath: string,
    parentSha: string | null,
    path: string,
  ): Promise<string> {
    if (!parentSha) {
      return '100644';
    }

    const treeEntry = await this.git(repoPath, ['ls-tree', parentSha, '--', path]);

    /*
     * ls-tree format:
     *   <mode> <type> <sha>\t<path>
     *
     * Preserve an existing regular-file or executable-file mode. Symlinks and
     * gitlinks are intentionally replaced with ordinary authored files.
     */
    const match = treeEntry.match(/^(100644|100755)\s+blob\s+[0-9a-f]{40}\t/);

    return match?.[1] ?? '100644';
  }

  async getBranchHead(
    input: Parameters<RepositoryMutationPort['getBranchHead']>[0],
  ): Promise<string | null> {
    if (!(await this.storage.repoExists(input.owner, input.name))) {
      throw new Error('Repository not found on disk');
    }

    const repoPath = this.storage.getRepoPath(input.owner, input.name);

    await this.validateBranch(repoPath, input.branch);

    try {
      return await this.git(repoPath, [
        'rev-parse',
        '--verify',
        `refs/heads/${input.branch}^{commit}`,
      ]);
    } catch (error) {
      const err = error as any;
      const code = err?.code ?? err?.status;

      if (code === 1 || code === 128 || code === '1' || code === '128') {
        return null;
      }

      throw error;
    }
  }

  async commitFile(
    input: Parameters<RepositoryMutationPort['commitFile']>[0],
  ): Promise<Awaited<ReturnType<RepositoryMutationPort['commitFile']>>> {
    if (!(await this.storage.repoExists(input.owner, input.name))) {
      throw new Error('Repository not found on disk');
    }

    const repoPath = this.storage.getRepoPath(input.owner, input.name);
    const path = normalizeFilePath(input.path);

    await this.validateBranch(repoPath, input.branch);

    /*
     * The bare repository is authoritative. Branch.commitSha is metadata and
     * must not be trusted over the actual ref.
     */
    const observedHead = await this.getBranchHead({
      owner: input.owner,
      name: input.name,
      branch: input.branch,
    });

    if (observedHead !== input.expectedHeadSha) {
      throw new RepositoryHeadConflictError(observedHead);
    }

    const workDirectory = await mkdtemp(join(tmpdir(), 'quantgit-commit-'));
    const contentFile = join(workDirectory, 'content');
    const messageFile = join(workDirectory, 'message');
    const indexFile = join(workDirectory, 'index');

    const authorName = sanitizeAuthorName(input.author.name);
    const authorEmail = sanitizeAuthorEmail(input.author.email, input.owner);

    const gitEnvironment: NodeJS.ProcessEnv = {
      ...GIT_CHILD_ENV,
      GIT_INDEX_FILE: indexFile,
      GIT_AUTHOR_NAME: authorName,
      GIT_AUTHOR_EMAIL: authorEmail,
      GIT_COMMITTER_NAME: authorName,
      GIT_COMMITTER_EMAIL: authorEmail,
    };

    try {
      await Promise.all([
        writeFile(contentFile, input.content, 'utf8'),
        writeFile(messageFile, `${input.message.trim()}\n`, 'utf8'),
      ]);

      /*
       * Write the raw file content to the bare repository object database.
       * --no-filters ensures editor content is committed exactly as provided.
       */
      const blobSha = await this.git(repoPath, ['hash-object', '-w', '--no-filters', contentFile]);

      /*
       * Build a temporary index from the parent commit's tree. For an unborn
       * branch, begin with an empty index.
       */
      if (observedHead) {
        await this.git(repoPath, ['read-tree', `${observedHead}^{tree}`], gitEnvironment);
      } else {
        await this.git(repoPath, ['read-tree', '--empty'], gitEnvironment);
      }

      const fileMode = await this.resolveFileMode(repoPath, observedHead, path);

      await this.git(
        repoPath,
        ['update-index', '--add', '--cacheinfo', `${fileMode},${blobSha},${path}`],
        gitEnvironment,
      );

      const treeSha = await this.git(repoPath, ['write-tree'], gitEnvironment);

      const commitArguments = ['commit-tree', treeSha];

      if (observedHead) {
        commitArguments.push('-p', observedHead);
      }

      commitArguments.push('-F', messageFile);

      const commitSha = await this.git(repoPath, commitArguments, gitEnvironment);

      /*
       * Atomic compare-and-swap:
       *
       * - Existing branch: update only if it still equals observedHead.
       * - Unborn branch: create only if it still does not exist.
       */
      try {
        await this.git(repoPath, [
          'update-ref',
          `refs/heads/${input.branch}`,
          commitSha,
          observedHead ?? ZERO_SHA,
        ]);
      } catch (error) {
        const currentHeadSha = await this.getBranchHead({
          owner: input.owner,
          name: input.name,
          branch: input.branch,
        });

        if (currentHeadSha !== observedHead) {
          throw new RepositoryHeadConflictError(currentHeadSha);
        }

        throw error;
      }

      return {
        commitSha,
        blobSha,
        previousHeadSha: observedHead,
        path,
        branch: input.branch,
      };
    } finally {
      await rm(workDirectory, {
        recursive: true,
        force: true,
      });
    }
  }

  async rollbackCommit(
    input: Parameters<RepositoryMutationPort['rollbackCommit']>[0],
  ): Promise<void> {
    if (!(await this.storage.repoExists(input.owner, input.name))) {
      throw new Error('Repository not found on disk');
    }

    const repoPath = this.storage.getRepoPath(input.owner, input.name);

    await this.validateBranch(repoPath, input.branch);

    const ref = `refs/heads/${input.branch}`;

    if (input.restoreHeadSha) {
      await this.git(repoPath, ['update-ref', ref, input.restoreHeadSha, input.expectedCurrentSha]);

      return;
    }

    /*
     * The committed ref created the first commit on an unborn branch.
     * Delete it only if it still points at the commit being compensated.
     */
    await this.git(repoPath, ['update-ref', '-d', ref, input.expectedCurrentSha]);
  }
}
