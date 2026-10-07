import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AICIFixService } from '../services/ai-ci-fix.service.js';
import ciHealingRoutes from '../routes/ci-healing.js';
import type { AIEngine } from '@quant/ai';

describe('AICIFixService & Autonomous CI Healing', () => {
  let mockAi: any;
  let service: AICIFixService;
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockAi = {
      infer: vi.fn(),
    };

    service = new AICIFixService(mockAi as unknown as AIEngine);

    app = Fastify({ logger: false });

    // Mock authentication middleware
    app.addHook('onRequest', async (req: any) => {
      if (req.headers.authorization === 'Bearer valid-user-token') {
        req.user = { id: 'usr-101', email: 'dev@quantmail.in' };
      }
    });

    await app.register(ciHealingRoutes, {
      aiFixService: service,
    });
    await app.ready();
  });

  describe('AICIFixService.suggestFix', () => {
    it('parses valid AI JSON response and returns diagnosis and fix', async () => {
      mockAi.infer.mockResolvedValueOnce({
        content: JSON.stringify({
          diagnosis: 'Type error: Property "status" is missing in interface',
          rootCause: 'Commit 82f1bc modified Task interface without updating all callers',
          suggestedFix: 'Add optional flag status?: string to Task interface in types.ts',
          confidence: 0.95,
        }),
      });

      const result = await service.suggestFix(
        {
          logs: 'src/types.ts:42:5 error TS2741: Property status is missing',
          jobName: 'typecheck',
        },
        'usr-101',
      );

      expect(result.diagnosis).toContain('Type error');
      expect(result.rootCause).toContain('Commit 82f1bc');
      expect(result.suggestedFix).toContain('Add optional flag');
      expect(result.confidence).toBe(0.95);
      expect(mockAi.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: 'ci-fix',
          userId: 'usr-101',
        }),
      );
    });

    it('extracts JSON when wrapped in markdown code fences', async () => {
      mockAi.infer.mockResolvedValueOnce({
        content: `\`\`\`json
{
  "diagnosis": "Missing dependency @xterm/addon-fit",
  "rootCause": "pnpm install omitted addon",
  "suggestedFix": "pnpm add @xterm/addon-fit",
  "confidence": 0.88
}
\`\`\``,
      });

      const result = await service.suggestFix(
        { logs: 'Cannot find module @xterm/addon-fit' },
        'usr-101',
      );

      expect(result.diagnosis).toBe('Missing dependency @xterm/addon-fit');
      expect(result.confidence).toBe(0.88);
    });

    it('throws AI_PARSE_ERROR when AI returns non-JSON content', async () => {
      mockAi.infer.mockResolvedValueOnce({
        content: 'I could not understand the failure logs, sorry!',
      });

      await expect(service.suggestFix({ logs: 'unknown error' }, 'usr-101')).rejects.toThrow(
        'Failed to parse AI CI fix response',
      );
    });

    it('throws AI_VALIDATION_ERROR when required fields are missing in AI response', async () => {
      mockAi.infer.mockResolvedValueOnce({
        content: JSON.stringify({
          diagnosis: 'Something broke',
          // missing rootCause, suggestedFix, confidence
        }),
      });

      await expect(service.suggestFix({ logs: 'syntax error' }, 'usr-101')).rejects.toThrow(
        'AI returned invalid CI fix result',
      );
    });
  });

  describe('AICIFixService.autoGenerateFixBranchAndPr', () => {
    it('generates fix branch, unified git patch diff, and PR body with CI badge', async () => {
      mockAi.infer.mockResolvedValueOnce({
        content: JSON.stringify({
          diagnosis: 'Bitwise shift bug in IP mask comparison',
          rootCause: 'num << 8 signed 32-bit overflow on high IP octets',
          patchDiff: `diff --git a/services/ci-runner/src/proxy.ts b/services/ci-runner/src/proxy.ts
--- a/services/ci-runner/src/proxy.ts
+++ b/services/ci-runner/src/proxy.ts
@@ -10,1 +10,1 @@
-const isBlocked = (num & mask) === hex;
+const isBlocked = ((num & mask) >>> 0) === hex;`,
          prTitle: 'fix(proxy): resolve signed 32-bit integer overflow in CIDR check',
          testPlan: 'Run vitest on network-sandbox.test.ts to verify all 46 tests pass',
          confidence: 0.99,
        }),
      });

      const result = await service.autoGenerateFixBranchAndPr(
        {
          buildId: 'build-994',
          repoOwner: 'quant',
          repoName: 'ci-runner',
          commitSha: 'commit-abc1234',
          logs: 'FAIL src/__tests__/network-sandbox.test.ts',
          targetBranch: 'main',
        },
        'usr-101',
      );

      expect(result.branch).toBe('fix/ci-auto-build-994');
      expect(result.prTitle).toBe(
        'fix(proxy): resolve signed 32-bit integer overflow in CIDR check',
      );
      expect(result.patchDiff).toContain('diff --git');
      expect(result.prBody).toContain(
        '![CI Auto-Fix](https://img.shields.io/badge/CI-Auto--Fix-success)',
      );
      expect(result.prBody).toContain('build-994');
      expect(result.prBody).toContain('commit-abc1234');
      expect(result.confidence).toBe(0.99);
    });
  });

  describe('ci-healing Fastify Routes', () => {
    it('POST /api/ci/healing/suggest returns 200 with suggested fix when authenticated', async () => {
      mockAi.infer.mockResolvedValueOnce({
        content: JSON.stringify({
          diagnosis: 'Vitest timeout in network probe',
          rootCause: 'Socket connection hanging without timeout',
          suggestedFix: 'Add socket.setTimeout(2000)',
          confidence: 0.92,
        }),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ci/healing/suggest',
        headers: {
          authorization: 'Bearer valid-user-token',
        },
        payload: {
          logs: 'Timeout of 5000ms exceeded in test',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.suggestedFix).toBe('Add socket.setTimeout(2000)');
    });

    it('POST /api/ci/healing/auto-fix returns 200 with fix branch and PR details', async () => {
      mockAi.infer.mockResolvedValueOnce({
        content: JSON.stringify({
          diagnosis: 'Fastify route registration conflict',
          rootCause: 'Duplicate prefix registered twice',
          patchDiff: 'diff --git a/app.ts b/app.ts',
          prTitle: 'fix(routes): eliminate duplicate prefix',
          testPlan: 'Run app test suite',
          confidence: 0.96,
        }),
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/ci/healing/auto-fix',
        headers: {
          authorization: 'Bearer valid-user-token',
        },
        payload: {
          buildId: 'build-777',
          repoOwner: 'alice',
          repoName: 'quantmail',
          commitSha: 'sha-777',
          logs: 'Error: fastify route already registered',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.branch).toBe('fix/ci-auto-build-777');
      expect(body.data.prBody).toContain('CI Auto-Fix');
    });

    it('returns 401 Unauthorized when no user session token is present', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/ci/healing/suggest',
        payload: {
          logs: 'some error',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('GET /api/ci/healing/status/:buildId returns healing status for build', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/ci/healing/status/build-555',
        headers: {
          authorization: 'Bearer valid-user-token',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.buildId).toBe('build-555');
      expect(body.data.available).toBe(true);
    });
  });
});
