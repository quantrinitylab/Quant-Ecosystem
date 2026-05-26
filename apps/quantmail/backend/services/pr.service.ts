import type { PrismaClient, PullRequest } from '@prisma/client';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

export const CreatePRInputSchema = z.object({
  repoId: z.string(),
  title: z.string().min(1).max(256),
  body: z.string().optional(),
  authorId: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
});

export const MergePRInputSchema = z.object({
  strategy: z.enum(['MERGE', 'SQUASH', 'REBASE']),
  commitMessage: z.string().optional(),
});

export type CreatePRInput = z.infer<typeof CreatePRInputSchema>;
export type MergePRInput = z.infer<typeof MergePRInputSchema>;

export interface PRFilters {
  status?: 'OPEN' | 'MERGED' | 'CLOSED' | 'DRAFT';
}

export class PullRequestService {
  constructor(private readonly prisma: PrismaClient) {}

  async createPR(input: CreatePRInput): Promise<PullRequest> {
    const validated = CreatePRInputSchema.parse(input);

    const count = await this.prisma.pullRequest.count({
      where: { repoId: validated.repoId },
    });

    const pr = await this.prisma.pullRequest.create({
      data: {
        repoId: validated.repoId,
        number: count + 1,
        title: validated.title,
        body: validated.body ?? null,
        authorId: validated.authorId,
        status: 'OPEN',
        sourceBranch: validated.sourceBranch,
        targetBranch: validated.targetBranch,
      },
    });

    return pr;
  }

  async listPRs(repoId: string, filters?: PRFilters): Promise<PullRequest[]> {
    const where: Record<string, unknown> = { repoId };

    if (filters?.status) {
      where.status = filters.status;
    }

    return this.prisma.pullRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPR(repoId: string, number: number): Promise<PullRequest> {
    const pr = await this.prisma.pullRequest.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    return pr;
  }

  async mergePR(repoId: string, number: number, input: MergePRInput): Promise<PullRequest> {
    const validated = MergePRInputSchema.parse(input);

    const pr = await this.prisma.pullRequest.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    if (pr.status !== 'OPEN') {
      throw createAppError('Pull request is not open', 409, 'PR_NOT_OPEN');
    }

    return this.prisma.pullRequest.update({
      where: { id: pr.id },
      data: {
        status: 'MERGED',
        mergeStrategy: validated.strategy,
        mergedAt: new Date(),
      },
    });
  }

  async closePR(repoId: string, number: number): Promise<PullRequest> {
    const pr = await this.prisma.pullRequest.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    return this.prisma.pullRequest.update({
      where: { id: pr.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });
  }

  async getDiff(repoId: string, number: number): Promise<string> {
    const pr = await this.prisma.pullRequest.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!pr) {
      throw createAppError('Pull request not found', 404, 'PR_NOT_FOUND');
    }

    return `diff --git a/file.txt b/file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ -1,3 +1,3 @@\n-old line\n+new line`;
  }
}
