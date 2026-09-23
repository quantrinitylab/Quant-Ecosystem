import { z } from 'zod';
import type { AIEngine } from '@quant/ai';
import { createAppError } from '@quant/server-core';

export const CIFixInputSchema = z.object({
  logs: z.string().max(100000),
  sourceCode: z.string().max(100000).optional(),
  jobName: z.string().optional(),
});

export type CIFixInput = z.infer<typeof CIFixInputSchema>;

export interface CIFixResult {
  diagnosis: string;
  rootCause: string;
  suggestedFix: string;
  confidence: number;
}

const CIFixResultSchema = z.object({
  diagnosis: z.string(),
  rootCause: z.string(),
  suggestedFix: z.string(),
  confidence: z.number().min(0).max(1),
});

export const AutoPrInputSchema = z.object({
  buildId: z.string().min(1),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  commitSha: z.string().min(1),
  logs: z.string().max(100000),
  sourceCode: z.string().max(100000).optional(),
  targetBranch: z.string().optional().default('main'),
});

export type AutoPrInput = z.infer<typeof AutoPrInputSchema>;

export interface AutoPrResult {
  branch: string;
  patchDiff: string;
  prTitle: string;
  prBody: string;
  diagnosis: string;
  rootCause: string;
  confidence: number;
}

const AutoPrAiResponseSchema = z.object({
  diagnosis: z.string(),
  rootCause: z.string(),
  patchDiff: z.string(),
  prTitle: z.string(),
  testPlan: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

function cleanJsonContent(content: string): string {
  const trimmed = content.trim();
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }
  return trimmed;
}

export class AICIFixService {
  constructor(private readonly ai: AIEngine) {}

  async suggestFix(input: CIFixInput, userId: string): Promise<CIFixResult> {
    const validated = CIFixInputSchema.parse(input);

    const response = await this.ai.infer({
      prompt: `Analyze the following CI failure logs and suggest a fix.

${validated.jobName ? `Job Name: ${validated.jobName}` : ''}

CI Logs:
${validated.logs}

${validated.sourceCode ? `Relevant Source Code:\n${validated.sourceCode}` : ''}

Respond ONLY with valid JSON matching this schema:
{
  "diagnosis": "what went wrong",
  "rootCause": "the root cause of the failure",
  "suggestedFix": "code or config fix to resolve the issue",
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are a CI/CD debugging expert. Analyze build failures, test failures, and deployment errors. Provide precise diagnoses and actionable fixes. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'ci-fix',
      temperature: 0.2,
      maxTokens: 1024,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanJsonContent(response.content));
    } catch {
      throw createAppError('Failed to parse AI CI fix response', 500, 'AI_PARSE_ERROR');
    }

    const result = CIFixResultSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid CI fix result', 500, 'AI_VALIDATION_ERROR');
    }

    return result.data;
  }

  async autoGenerateFixBranchAndPr(input: AutoPrInput, userId: string): Promise<AutoPrResult> {
    const validated = AutoPrInputSchema.parse(input);
    const branchName = `fix/ci-auto-${validated.buildId}`;

    const response = await this.ai.infer({
      prompt: `The CI build #${validated.buildId} failed for repository ${validated.repoOwner}/${validated.repoName} on commit ${validated.commitSha}.

Failure Logs:
${validated.logs}

${validated.sourceCode ? `Relevant Source Code:\n${validated.sourceCode}` : ''}

Generate an automated healing patch. Respond ONLY with valid JSON matching this schema:
{
  "diagnosis": "concise description of what broke",
  "rootCause": "detailed technical root cause",
  "patchDiff": "unified diff patch to fix the problem",
  "prTitle": "fix(ci): descriptive title of the fix",
  "testPlan": "how to verify this fix",
  "confidence": 0.0 to 1.0
}`,
      systemPrompt:
        'You are the Quant Autonomous CI Healing Agent. You diagnose build failures and generate precise, compiling unified git diffs to restore CI green status. Always respond with valid JSON only.',
      userId,
      app: 'quantmail',
      feature: 'ci-healing',
      temperature: 0.1,
      maxTokens: 2048,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanJsonContent(response.content));
    } catch {
      throw createAppError('Failed to parse AI CI healing response', 500, 'AI_PARSE_ERROR');
    }

    const result = AutoPrAiResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw createAppError('AI returned invalid CI healing result', 500, 'AI_VALIDATION_ERROR');
    }

    const data = result.data;

    const prBody = `## 🤖 Automated CI Healing PR

![CI Auto-Fix](https://img.shields.io/badge/CI-Auto--Fix-success)
**Triggered by failed CI build**: \`#${validated.buildId}\` on commit \`${validated.commitSha}\`
**Target Branch**: \`${validated.targetBranch}\`

### 🔍 Diagnosis
${data.diagnosis}

### 🔬 Root Cause
${data.rootCause}

### 🛠️ Proposed Solution
This automated patch resolves the failure observed in build #${validated.buildId}.

\`\`\`diff
${data.patchDiff}
\`\`\`

### 🧪 Verification Plan
${data.testPlan ?? 'Run CI workflow to verify build and test passage.'}

---
*Generated autonomously by Quant AI CI Healing Service.*`;

    return {
      branch: branchName,
      patchDiff: data.patchDiff,
      prTitle: data.prTitle,
      prBody,
      diagnosis: data.diagnosis,
      rootCause: data.rootCause,
      confidence: data.confidence,
    };
  }
}
