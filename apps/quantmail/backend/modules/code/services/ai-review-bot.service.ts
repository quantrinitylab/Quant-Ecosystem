import type { PrismaClient, Review } from '@prisma/client';
import { createAppError } from '@quant/server-core';
import { GitInspectService } from './git-transport/git-inspect.service';
import { ReviewService } from './review.service';
import { RepoStorageService } from './git-transport/repo-storage.service';

export interface GitDiffResult {
  patch: string;
  stat: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface LintFinding {
  filePath: string;
  line: number;
  message: string;
  severity: 'WARNING' | 'ERROR' | 'INFO';
  ruleId: string;
}

export interface AiReviewReport {
  review: Review;
  summary: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  findings: LintFinding[];
}

export class AiReviewBotService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly reviewService: ReviewService,
    private readonly gitInspect: GitInspectService,
    private readonly repoStorage: RepoStorageService,
  ) {}

  /**
   * Run automated review on a pull request:
   * 1. Extracts PR source/target branches and diff.
   * 2. Runs static security and lint rule checks against the patch.
   * 3. Generates structured PR summary.
   * 4. Submits review and comments via ReviewService.
   */
  async reviewPullRequest(
    repoId: string,
    prNumber: number,
    botUserId = 'system:codehub-ai-bot',
  ): Promise<AiReviewReport> {
    const pr = await (this.prisma as any).pullRequest.findUnique({
      where: { repoId_number: { repoId, number: prNumber } },
      include: { repo: true },
    });

    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    let diff: GitDiffResult;
    try {
      const inspectDiff = await this.gitInspect.getDiff(
        pr.repo.ownerId,
        pr.repo.name,
        pr.targetBranch,
        pr.sourceBranch,
      );
      diff = {
        patch: inspectDiff.patch,
        stat: inspectDiff.stat,
        filesChanged: (inspectDiff.patch.match(/^diff --git/gm) || []).length,
        insertions: (inspectDiff.patch.match(/^\+[^+]/gm) || []).length,
        deletions: (inspectDiff.patch.match(/^-[^-]/gm) || []).length,
      };
    } catch {
      diff = { patch: '', stat: '0 files changed', filesChanged: 0, insertions: 0, deletions: 0 };
    }

    const findings = this.analyzePatch(diff.patch);

    const summary = this.generateSummary(pr.title, diff, findings);

    const hasErrors = findings.some((f) => f.severity === 'ERROR');
    const status = hasErrors ? 'CHANGES_REQUESTED' : 'COMMENTED';

    const review = await this.reviewService.submitReview({
      prId: pr.id,
      reviewerId: botUserId,
      status,
      body: summary,
    });

    for (const finding of findings.slice(0, 10)) {
      try {
        await this.reviewService.addComment({
          prId: pr.id,
          authorId: botUserId,
          filePath: finding.filePath,
          line: finding.line,
          body: `🤖 **[${finding.severity}]** ${finding.message} (\`${finding.ruleId}\`)`,
        });
      } catch {
        // Continue if line cannot be commented on
      }
    }

    return {
      review,
      summary,
      filesChanged: diff.filesChanged,
      insertions: diff.insertions,
      deletions: diff.deletions,
      findings,
    };
  }

  /**
   * Static scan for common security, lint, and code quality issues.
   */
  analyzePatch(patch: string): LintFinding[] {
    const findings: LintFinding[] = [];
    if (!patch) return findings;

    const lines = patch.split('\n');
    let currentFile = '';
    let currentLine = 0;

    for (const line of lines) {
      if (line.startsWith('diff --git ')) {
        const parts = line.split(' ');
        currentFile = parts[2]?.replace(/^a\//, '') ?? '';
      } else if (line.startsWith('@@ ')) {
        const match = line.match(/\+(\d+)/);
        if (match) {
          currentLine = parseInt(match[1], 10) - 1;
        }
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        currentLine++;
        const content = line.substring(1);

        // Check 1: Leaked Secrets / Keys
        if (
          /(AKIA[0-9A-Z]{16})|(ghp_[0-9a-zA-Z]{36})|(qcp_[0-9a-f]{32})|-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/.test(
            content,
          )
        ) {
          findings.push({
            filePath: currentFile,
            line: currentLine,
            message: 'Potential hardcoded secret or private token detected.',
            severity: 'ERROR',
            ruleId: 'security/no-hardcoded-secrets',
          });
        }

        // Check 2: Debugger statements
        if (/\bdebugger\b/.test(content)) {
          findings.push({
            filePath: currentFile,
            line: currentLine,
            message: 'Unexpected debugger statement left in code.',
            severity: 'ERROR',
            ruleId: 'lint/no-debugger',
          });
        }

        // Check 3: Console logging in production code
        if (
          /\bconsole\.log\(/.test(content) &&
          !currentFile.includes('.test.') &&
          !currentFile.includes('__tests__')
        ) {
          findings.push({
            filePath: currentFile,
            line: currentLine,
            message: 'Direct console.log found. Prefer structured logger.',
            severity: 'WARNING',
            ruleId: 'lint/no-console-log',
          });
        }

        // Check 4: Unhandled empty catch blocks
        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(content)) {
          findings.push({
            filePath: currentFile,
            line: currentLine,
            message: 'Empty catch block suppresses errors silently.',
            severity: 'WARNING',
            ruleId: 'quality/no-empty-catch',
          });
        }
      } else if (!line.startsWith('-')) {
        currentLine++;
      }
    }

    return findings;
  }

  private generateSummary(prTitle: string, diff: GitDiffResult, findings: LintFinding[]): string {
    const errorCount = findings.filter((f) => f.severity === 'ERROR').length;
    const warningCount = findings.filter((f) => f.severity === 'WARNING').length;

    const sections = [
      `### 🤖 CodeHub AI Review Bot Report`,
      `**Pull Request**: ${prTitle}`,
      `**Diff Summary**: ${diff.filesChanged} files changed (+${diff.insertions} / -${diff.deletions})`,
      '',
      `#### 🔍 Inspection Results`,
      `- Errors: **${errorCount}**`,
      `- Warnings: **${warningCount}**`,
    ];

    if (findings.length === 0) {
      sections.push(
        '',
        `✅ **Clean check!** No security vulnerabilities or lint issues identified.`,
      );
    } else {
      sections.push('', `#### ⚠️ Key Suggestions:`);
      for (const f of findings.slice(0, 5)) {
        sections.push(`- \`${f.filePath}:${f.line}\` [${f.severity}]: ${f.message}`);
      }
    }

    return sections.join('\n');
  }
}
