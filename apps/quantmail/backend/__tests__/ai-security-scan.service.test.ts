import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AISecurityScanService } from '../services/ai-security-scan.service';

function createMockAIEngine() {
  return {
    infer: vi.fn(),
  };
}

describe('AISecurityScanService', () => {
  let service: AISecurityScanService;
  let aiEngine: ReturnType<typeof createMockAIEngine>;

  beforeEach(() => {
    aiEngine = createMockAIEngine();
    service = new AISecurityScanService(aiEngine as never);
  });

  describe('scanDiff', () => {
    it('detects security vulnerabilities in a diff', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          vulnerabilities: [
            {
              type: 'hardcoded_credential',
              severity: 'critical',
              filePath: 'src/config.ts',
              line: 5,
              description: 'API key hardcoded in source code',
              recommendation: 'Use environment variables',
            },
            {
              type: 'sql_injection',
              severity: 'high',
              filePath: 'src/db.ts',
              line: 20,
              description: 'User input concatenated in SQL query',
              recommendation: 'Use parameterized queries',
            },
          ],
          riskScore: 85,
          summary: 'Critical: hardcoded credentials and SQL injection',
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350, estimatedCost: 0.005 },
        latencyMs: 500,
        cached: false,
      });

      const result = await service.scanDiff(
        {
          diff: '+const API_KEY = "sk-abc123";\n+db.query(`SELECT * FROM users WHERE id = ${userId}`)',
          language: 'typescript',
        },
        'user-1',
      );

      expect(result.vulnerabilities).toHaveLength(2);
      expect(result.vulnerabilities[0]!.type).toBe('hardcoded_credential');
      expect(result.vulnerabilities[0]!.severity).toBe('critical');
      expect(result.vulnerabilities[1]!.type).toBe('sql_injection');
      expect(result.riskScore).toBe(85);
      expect(result.summary).toContain('Critical');
    });

    it('returns clean scan for safe code', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          vulnerabilities: [],
          riskScore: 0,
          summary: 'No security issues detected',
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 150, completionTokens: 50, totalTokens: 200, estimatedCost: 0.002 },
        latencyMs: 300,
        cached: false,
      });

      const result = await service.scanDiff(
        { diff: '+export function add(a: number, b: number) { return a + b; }' },
        'user-2',
      );

      expect(result.vulnerabilities).toHaveLength(0);
      expect(result.riskScore).toBe(0);
    });

    it('calls AIEngine.infer with correct parameters', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({
          vulnerabilities: [],
          riskScore: 0,
          summary: 'clean',
        }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 30, totalTokens: 130, estimatedCost: 0.001 },
        latencyMs: 200,
        cached: false,
      });

      await service.scanDiff({ diff: '+test' }, 'user-3');

      expect(aiEngine.infer).toHaveBeenCalledWith(
        expect.objectContaining({
          app: 'quantmail',
          feature: 'security-scan',
          userId: 'user-3',
          temperature: 0.1,
        }),
      );
    });

    it('throws on invalid JSON from AI', async () => {
      aiEngine.infer.mockResolvedValue({
        content: 'not json',
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.scanDiff({ diff: '+test' }, 'user-1')).rejects.toThrow(
        'Failed to parse AI security scan response',
      );
    });

    it('throws on invalid schema from AI', async () => {
      aiEngine.infer.mockResolvedValue({
        content: JSON.stringify({ vulnerabilities: 'not array', riskScore: 'high' }),
        model: 'gpt-4o',
        usage: { promptTokens: 100, completionTokens: 10, totalTokens: 110, estimatedCost: 0.001 },
        latencyMs: 100,
        cached: false,
      });

      await expect(service.scanDiff({ diff: '+test' }, 'user-1')).rejects.toThrow(
        'AI returned invalid security scan result',
      );
    });
  });
});
