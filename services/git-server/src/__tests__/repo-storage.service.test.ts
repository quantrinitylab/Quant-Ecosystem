import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RepoStorageService } from '../services/repo-storage.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(
    (
      _cmd: string,
      _args: string[],
      cb: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      cb(null, { stdout: '', stderr: '' });
    },
  ),
}));

vi.mock('node:fs/promises', () => ({
  access: vi.fn(),
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

import { access } from 'node:fs/promises';

describe('RepoStorageService', () => {
  let service: RepoStorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RepoStorageService('/tmp/git-repos');
  });

  describe('getRepoPath', () => {
    it('returns the correct path for a repo', () => {
      const path = service.getRepoPath('alice', 'my-project');
      expect(path).toBe('/tmp/git-repos/alice/my-project.git');
    });

    it('handles owner and name with special characters', () => {
      const path = service.getRepoPath('user-1', 'repo.name');
      expect(path).toBe('/tmp/git-repos/user-1/repo.name.git');
    });
  });

  describe('initBareRepo', () => {
    it('creates the repo directory and initializes a bare repo', async () => {
      const path = await service.initBareRepo('alice', 'my-project');
      expect(path).toBe('/tmp/git-repos/alice/my-project.git');
    });
  });

  describe('deleteRepo', () => {
    it('removes the repo directory', async () => {
      await expect(service.deleteRepo('alice', 'my-project')).resolves.toBeUndefined();
    });
  });

  describe('repoExists', () => {
    it('returns true when repo directory exists', async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      const exists = await service.repoExists('alice', 'my-project');
      expect(exists).toBe(true);
    });

    it('returns false when repo directory does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'));
      const exists = await service.repoExists('alice', 'my-project');
      expect(exists).toBe(false);
    });
  });
});
