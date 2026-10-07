import type { PrismaClient, Issue } from '@prisma/client';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

export const CreateIssueInputSchema = z.object({
  repoId: z.string(),
  title: z.string().min(1).max(256),
  body: z.string().optional(),
  authorId: z.string(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

export type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;

export interface IssueFilters {
  status?: 'OPEN' | 'CLOSED';
  labels?: string[];
}

export class IssueService {
  constructor(private readonly prisma: PrismaClient) {}

  async createIssue(input: CreateIssueInput): Promise<Issue> {
    const validated = CreateIssueInputSchema.parse(input);

    const count = await this.prisma.issue.count({
      where: { repoId: validated.repoId },
    });

    return this.prisma.issue.create({
      data: {
        repoId: validated.repoId,
        number: count + 1,
        title: validated.title,
        body: validated.body ?? null,
        authorId: validated.authorId,
        status: 'OPEN',
        labels: validated.labels ?? [],
        assignees: validated.assignees ?? [],
      },
    });
  }

  async listIssues(repoId: string, filters?: IssueFilters): Promise<Issue[]> {
    const where: Record<string, unknown> = { repoId };

    if (filters?.status) {
      where.status = filters.status;
    }

    return this.prisma.issue.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getIssue(repoId: string, number: number): Promise<Issue> {
    const issue = await this.prisma.issue.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!issue) {
      throw createAppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
    }

    return issue;
  }

  async labelIssue(repoId: string, number: number, labels: string[]): Promise<Issue> {
    const issue = await this.prisma.issue.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!issue) {
      throw createAppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
    }

    return this.prisma.issue.update({
      where: { id: issue.id },
      data: { labels },
    });
  }

  async assignIssue(repoId: string, number: number, assignees: string[]): Promise<Issue> {
    const issue = await this.prisma.issue.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!issue) {
      throw createAppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
    }

    return this.prisma.issue.update({
      where: { id: issue.id },
      data: { assignees },
    });
  }

  async closeIssue(repoId: string, number: number): Promise<Issue> {
    const issue = await this.prisma.issue.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!issue) {
      throw createAppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
    }

    return this.prisma.issue.update({
      where: { id: issue.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });
  }

  async reopenIssue(repoId: string, number: number): Promise<Issue> {
    const issue = await this.prisma.issue.findUnique({
      where: { repoId_number: { repoId, number } },
    });

    if (!issue) {
      throw createAppError('Issue not found', 404, 'ISSUE_NOT_FOUND');
    }

    return this.prisma.issue.update({
      where: { id: issue.id },
      data: {
        status: 'OPEN',
        closedAt: null,
      },
    });
  }
}
