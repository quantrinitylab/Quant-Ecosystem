import type { PrismaClient, Review, ReviewComment } from '@prisma/client';
import { z } from 'zod';

export const SubmitReviewInputSchema = z.object({
  prId: z.string(),
  reviewerId: z.string(),
  status: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED']),
  body: z.string().optional(),
});

export const AddCommentInputSchema = z.object({
  prId: z.string(),
  authorId: z.string(),
  filePath: z.string(),
  line: z.number().int().positive(),
  body: z.string().min(1),
});

export type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;
export type AddCommentInput = z.infer<typeof AddCommentInputSchema>;

export class ReviewService {
  constructor(private readonly prisma: PrismaClient) {}

  async submitReview(input: SubmitReviewInput): Promise<Review> {
    const validated = SubmitReviewInputSchema.parse(input);

    // Record the head SHA of the PR's source branch at review time. This is
    // the commit the reviewer actually saw — the push path uses it to decide
    // whether the approval went stale ("dismiss stale approvals", GitHub
    // parity). Null when the branch row is unavailable: an honest unknown,
    // never an invented SHA.
    let reviewedCommitSha: string | null = null;
    try {
      const pr = await this.prisma.pullRequest.findUnique({
        where: { id: validated.prId },
        select: { repoId: true, sourceBranch: true },
      });
      if (pr) {
        const branch = this.prisma.branch?.findUnique
          ? await this.prisma.branch.findUnique({
              where: { repoId_name: { repoId: pr.repoId, name: pr.sourceBranch } },
              select: { commitSha: true },
            })
          : null;
        reviewedCommitSha = branch?.commitSha ?? null;
      }
    } catch {
      reviewedCommitSha = null;
    }

    return this.prisma.review.create({
      data: {
        prId: validated.prId,
        reviewerId: validated.reviewerId,
        status: validated.status,
        body: validated.body ?? null,
        reviewedCommitSha,
      },
    });
  }

  async addComment(input: AddCommentInput): Promise<ReviewComment> {
    const validated = AddCommentInputSchema.parse(input);

    return this.prisma.reviewComment.create({
      data: {
        prId: validated.prId,
        authorId: validated.authorId,
        filePath: validated.filePath,
        line: validated.line,
        body: validated.body,
      },
    });
  }

  async requestChanges(prId: string, reviewerId: string, body?: string): Promise<Review> {
    return this.submitReview({
      prId,
      reviewerId,
      status: 'CHANGES_REQUESTED',
      body,
    });
  }

  async listReviews(prId: string): Promise<Review[]> {
    return this.prisma.review.findMany({
      where: { prId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
