import { describe, it, expect, beforeEach } from 'vitest';
import { GitHooksService } from '../services/hooks.js';
import type { RefUpdate } from '../services/hooks.js';

describe('GitHooksService', () => {
  let service: GitHooksService;

  beforeEach(() => {
    service = new GitHooksService();
  });

  describe('preReceive', () => {
    it('allows push when no protection rules exist', async () => {
      const refs: RefUpdate[] = [
        { oldSha: 'abc123', newSha: 'def456', refName: 'refs/heads/main' },
      ];

      const result = await service.preReceive('repo-1', refs);
      expect(result.allowed).toBe(true);
    });

    it('denies deletion of a protected branch', async () => {
      service.setProtectionRules('repo-1', [
        { branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: true },
      ]);

      const refs: RefUpdate[] = [
        {
          oldSha: 'abc123',
          newSha: '0000000000000000000000000000000000000000',
          refName: 'refs/heads/main',
        },
      ];

      const result = await service.preReceive('repo-1', refs);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cannot delete protected branch');
    });

    it('allows normal push to protected branch', async () => {
      service.setProtectionRules('repo-1', [
        { branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: true },
      ]);

      const refs: RefUpdate[] = [
        { oldSha: 'abc123', newSha: 'def456', refName: 'refs/heads/main' },
      ];

      const result = await service.preReceive('repo-1', refs);
      expect(result.allowed).toBe(true);
    });

    it('matches wildcard branch patterns', async () => {
      service.setProtectionRules('repo-1', [
        { branchPattern: 'release/*', requiredApprovals: 2, requireStatusChecks: true },
      ]);

      const refs: RefUpdate[] = [
        {
          oldSha: 'abc123',
          newSha: '0000000000000000000000000000000000000000',
          refName: 'refs/heads/release/v1.0',
        },
      ];

      const result = await service.preReceive('repo-1', refs);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('release/*');
    });

    it('allows push to non-protected branches', async () => {
      service.setProtectionRules('repo-1', [
        { branchPattern: 'main', requiredApprovals: 1, requireStatusChecks: true },
      ]);

      const refs: RefUpdate[] = [
        {
          oldSha: 'abc123',
          newSha: '0000000000000000000000000000000000000000',
          refName: 'refs/heads/feature/test',
        },
      ];

      const result = await service.preReceive('repo-1', refs);
      expect(result.allowed).toBe(true);
    });
  });

  describe('postReceive', () => {
    it('executes without error', async () => {
      const refs: RefUpdate[] = [
        { oldSha: 'abc123', newSha: 'def456', refName: 'refs/heads/main' },
      ];

      await expect(service.postReceive('repo-1', refs)).resolves.toBeUndefined();
    });
  });

  describe('setProtectionRules', () => {
    it('sets and applies protection rules for a repo', async () => {
      service.setProtectionRules('repo-1', [
        { branchPattern: '*', requiredApprovals: 0, requireStatusChecks: false },
      ]);

      const refs: RefUpdate[] = [
        {
          oldSha: 'abc123',
          newSha: '0000000000000000000000000000000000000000',
          refName: 'refs/heads/any-branch',
        },
      ];

      const result = await service.preReceive('repo-1', refs);
      expect(result.allowed).toBe(false);
    });
  });
});
