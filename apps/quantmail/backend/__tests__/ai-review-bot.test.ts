import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiReviewBotService } from '../modules/code/services/ai-review-bot.service';
// Real minter for proof: the scanner pattern must match the actual minted
// PAT format (packages/auth), not a hand-rolled guess.
import { generatePersonalAccessToken } from '../../../../packages/auth/src/services/personal-access-token.service';

describe('AiReviewBotService (Task CH-05)', () => {
  let bot: AiReviewBotService;
  let mockPrisma: any;
  let mockReviewService: any;
  let mockGitInspect: any;
  let mockRepoStorage: any;

  beforeEach(() => {
    mockPrisma = {
      pullRequest: {
        findUnique: vi.fn(),
      },
    };
    mockReviewService = {
      submitReview: vi.fn().mockResolvedValue({ id: 'review-1', status: 'COMMENTED' }),
      addComment: vi.fn().mockResolvedValue({ id: 'comment-1' }),
    };
    mockGitInspect = {
      getDiff: vi.fn().mockResolvedValue({
        patch: '',
        stat: '1 file changed',
        filesChanged: 1,
        insertions: 5,
        deletions: 0,
      }),
    };
    mockRepoStorage = {
      repoPath: vi.fn().mockReturnValue('/mock/repo/path'),
    };

    bot = new AiReviewBotService(mockPrisma, mockReviewService, mockGitInspect, mockRepoStorage);
  });

  describe('analyzePatch', () => {
    it('detects leaked secrets and tokens', () => {
      const patch = [
        'diff --git a/config.ts b/config.ts',
        '@@ -1,3 +1,4 @@',
        // Real minted PAT format: qcp_<24 hex tokenId>_<43 base64url secret>
        '+const token = "qcp_0123456789abcdef01234567_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq";',
        '+const awsKey = "AKIAIOSFODNN7EXAMPLE";',
      ].join('\n');

      const findings = bot.analyzePatch(patch);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some((f) => f.ruleId === 'security/no-hardcoded-secrets')).toBe(true);
      expect(findings[0]?.severity).toBe('ERROR');
    });

    it('flags a PAT produced by the real minter (qcp_<24hex>_<43 base64url>)', () => {
      // End-to-end proof against the actual mint format in
      // packages/auth/src/services/personal-access-token.service.ts —
      // not a hand-rolled string.
      const { token } = generatePersonalAccessToken();
      expect(token).toMatch(/^qcp_[0-9a-f]{24}_[A-Za-z0-9_-]{43}$/);
      const patch = [
        'diff --git a/seed.ts b/seed.ts',
        '@@ -1,1 +1,2 @@',
        `+const leaked = "${token}";`,
      ].join('\n');

      const findings = bot.analyzePatch(patch);
      expect(findings.some((f) => f.ruleId === 'security/no-hardcoded-secrets')).toBe(true);
    });

    it('no longer mis-fires on the old qcp_<32 hex> shape (never a real token)', () => {
      // The pre-fix pattern required 32 hex chars after qcp_, which the
      // minter can never produce; after the fix it must not flag.
      const patch = [
        'diff --git a/config.ts b/config.ts',
        '@@ -1,1 +1,2 @@',
        '+const token = "qcp_1234567890abcdef1234567890abcdef";',
      ].join('\n');

      const findings = bot.analyzePatch(patch);
      expect(findings.some((f) => f.ruleId === 'security/no-hardcoded-secrets')).toBe(false);
    });

    it('detects debugger statements and console.log', () => {
      const patch = [
        'diff --git a/service.ts b/service.ts',
        '@@ -10,2 +10,4 @@',
        '+  debugger;',
        '+  console.log("debug data", obj);',
      ].join('\n');

      const findings = bot.analyzePatch(patch);
      expect(findings.some((f) => f.ruleId === 'lint/no-debugger')).toBe(true);
      expect(findings.some((f) => f.ruleId === 'lint/no-console-log')).toBe(true);
    });

    it('ignores console.log in test files', () => {
      const patch = [
        'diff --git a/service.test.ts b/service.test.ts',
        '@@ -5,2 +5,3 @@',
        '+  console.log("test output");',
      ].join('\n');

      const findings = bot.analyzePatch(patch);
      expect(findings.some((f) => f.ruleId === 'lint/no-console-log')).toBe(false);
    });

    it('detects empty catch blocks', () => {
      const patch = [
        'diff --git a/handler.ts b/handler.ts',
        '@@ -20,2 +20,3 @@',
        '+  try { doSomething(); } catch (err) {}',
      ].join('\n');

      const findings = bot.analyzePatch(patch);
      expect(findings.some((f) => f.ruleId === 'quality/no-empty-catch')).toBe(true);
    });

    it('returns empty array on clean patch', () => {
      const patch = [
        'diff --git a/clean.ts b/clean.ts',
        '@@ -1,2 +1,3 @@',
        '+export function add(a: number, b: number): number {',
        '+  return a + b;',
        '+}',
      ].join('\n');

      const findings = bot.analyzePatch(patch);
      expect(findings).toHaveLength(0);
    });
  });

  describe('reviewPullRequest', () => {
    it('generates a clean review when no issues are found', async () => {
      mockPrisma.pullRequest.findUnique.mockResolvedValue({
        id: 'pr-123',
        number: 42,
        title: 'feat: add clean feature',
        sourceBranch: 'feat/clean',
        targetBranch: 'main',
        repo: { ownerId: 'alice', name: 'my-project' },
      });

      mockGitInspect.getDiff.mockResolvedValue({
        patch: [
          'diff --git a/math.ts b/math.ts',
          '@@ -1,1 +1,2 @@',
          '+export const PI = 3.14159;',
        ].join('\n'),
        stat: '1 file changed, 1 insertion(+)',
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
      });

      const report = await bot.reviewPullRequest('repo-1', 42);

      expect(report.filesChanged).toBe(1);
      expect(report.findings).toHaveLength(0);
      expect(report.summary).toContain('CodeHub AI Review Bot Report');
      expect(report.summary).toContain('Clean check!');
      expect(mockReviewService.submitReview).toHaveBeenCalledWith({
        prId: 'pr-123',
        reviewerId: 'system:codehub-ai-bot',
        status: 'COMMENTED',
        body: expect.stringContaining('Clean check!'),
      });
    });

    it('requests changes and posts comments when critical security issues are detected', async () => {
      mockPrisma.pullRequest.findUnique.mockResolvedValue({
        id: 'pr-456',
        number: 10,
        title: 'feat: add config',
        sourceBranch: 'feat/leak',
        targetBranch: 'main',
        repo: { ownerId: 'bob', name: 'leaky-repo' },
      });

      mockGitInspect.getDiff.mockResolvedValue({
        patch: [
          'diff --git a/secrets.ts b/secrets.ts',
          '@@ -1,1 +1,2 @@',
          '+const secret = "AKIA1234567890ABCDEF";',
        ].join('\n'),
        stat: '1 file changed, 1 insertion(+)',
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
      });

      const report = await bot.reviewPullRequest('repo-2', 10);

      expect(report.findings.length).toBeGreaterThan(0);
      expect(mockReviewService.submitReview).toHaveBeenCalledWith({
        prId: 'pr-456',
        reviewerId: 'system:codehub-ai-bot',
        status: 'CHANGES_REQUESTED',
        body: expect.stringContaining('Key Suggestions:'),
      });
      expect(mockReviewService.addComment).toHaveBeenCalledWith({
        prId: 'pr-456',
        authorId: 'system:codehub-ai-bot',
        filePath: 'secrets.ts',
        line: 1,
        body: expect.stringContaining('Potential hardcoded secret'),
      });
    });

    it('throws 404 error when pull request is missing', async () => {
      mockPrisma.pullRequest.findUnique.mockResolvedValue(null);

      await expect(bot.reviewPullRequest('repo-missing', 99)).rejects.toThrow(
        'Pull request not found',
      );
    });
  });
});
