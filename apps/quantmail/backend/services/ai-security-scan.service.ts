import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const SecurityScanInputSchema = z.object({
  diff: z.string().max(100000),
  language: z.string().optional(),
});

export type SecurityScanInput = z.infer<typeof SecurityScanInputSchema>;

export interface SecurityVulnerability {
  type:
    | 'secret_leak'
    | 'sql_injection'
    | 'xss'
    | 'path_traversal'
    | 'insecure_crypto'
    | 'hardcoded_credential';
  severity: 'critical' | 'high' | 'medium' | 'low';
  filePath: string;
  line: number;
  description: string;
  recommendation: string;
}

export interface SecurityScanResult {
  vulnerabilities: SecurityVulnerability[];
  riskScore: number;
  summary: string;
}

const SecurityScanResultSchema = z.object({
  vulnerabilities: z.array(
    z.object({
      type: z.enum([
        'secret_leak',
        'sql_injection',
        'xss',
        'path_traversal',
        'insecure_crypto',
        'hardcoded_credential',
      ]),
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      filePath: z.string(),
      line: z.number(),
      description: z.string(),
      recommendation: z.string(),
    }),
  ),
  riskScore: z.number().min(0).max(100),
  summary: z.string(),
});

export class AISecurityScanService {
  constructor(private readonly ai: AIEngine) {}

  async scanDiff(input: SecurityScanInput, userId: string): Promise<SecurityScanResult> {
    const validated = SecurityScanInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Scan the following code diff for security vulnerabilities.

${validated.language ? `Language: ${validated.language}` : ''}

Diff:
${validated.diff}

Look for: secret leaks, SQL injection, XSS, path traversal, insecure cryptography, hardcoded credentials.

Respond ONLY with valid JSON matching this schema:
{
  "vulnerabilities": [{ "type": "secret_leak"|"sql_injection"|"xss"|"path_traversal"|"insecure_crypto"|"hardcoded_credential", "severity": "critical"|"high"|"medium"|"low", "filePath": string, "line": number, "description": string, "recommendation": string }],
  "riskScore": 0-100,
  "summary": "overall security assessment"
}`,
      systemPrompt:
        'You are a security code scanner. Identify vulnerabilities in code changes including secrets, injection attacks, XSS, and other security issues. Be thorough but avoid false positives. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'security-scan',
      temperature: 0.1,
      maxTokens: 2048,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.content);
    } catch {
      throw createAppError('Failed to parse AI security scan response', 500, 'AI_PARSE_ERROR');
    }

    const result = SecurityScanResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid security scan result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }
}
