import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReviewService } from '../services/review.service';

function createMockPrisma() {
  return {
    review: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    reviewComment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
}

describe('ReviewService', () => {
  let service: ReviewService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new ReviewService(prisma as never);
  });

  describe('submitReview', () => {
    it('creates an approved review', async () => {
      const mockReview = {
        id: 'review-1',
        prId: 'pr-1',
        reviewerId: 'user-2',
        status: 'APPROVED',
        body: 'Looks good!',
        createdAt: new Date(),
      };
      prisma.review.create.mockResolvedValue(mockReview);

      const result = await service.submitReview({
        prId: 'pr-1',
        reviewerId: 'user-2',
        status: 'APPROVED',
        body: 'Looks good!',
      });

      expect(result.status).toBe('APPROVED');
      expect(result.prId).toBe('pr-1');
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          prId: 'pr-1',
          reviewerId: 'user-2',
          status: 'APPROVED',
          body: 'Looks good!',
        },
      });
    });

    it('creates a review with COMMENTED status', async () => {
      prisma.review.create.mockResolvedValue({
        id: 'review-2',
        prId: 'pr-1',
        reviewerId: 'user-3',
        status: 'COMMENTED',
        body: null,
      });

      const result = await service.submitReview({
        prId: 'pr-1',
        reviewerId: 'user-3',
        status: 'COMMENTED',
      });

      expect(result.status).toBe('COMMENTED');
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          prId: 'pr-1',
          reviewerId: 'user-3',
          status: 'COMMENTED',
          body: null,
        },
      });
    });
  });

  describe('addComment', () => {
    it('creates a review comment on a specific file and line', async () => {
      const mockComment = {
        id: 'comment-1',
        prId: 'pr-1',
        authorId: 'user-2',
        filePath: 'src/index.ts',
        line: 42,
        body: 'Consider using a constant here',
        createdAt: new Date(),
      };
      prisma.reviewComment.create.mockResolvedValue(mockComment);

      const result = await service.addComment({
        prId: 'pr-1',
        authorId: 'user-2',
        filePath: 'src/index.ts',
        line: 42,
        body: 'Consider using a constant here',
      });

      expect(result.filePath).toBe('src/index.ts');
      expect(result.line).toBe(42);
      expect(result.body).toBe('Consider using a constant here');
      expect(prisma.reviewComment.create).toHaveBeenCalledWith({
        data: {
          prId: 'pr-1',
          authorId: 'user-2',
          filePath: 'src/index.ts',
          line: 42,
          body: 'Consider using a constant here',
        },
      });
    });
  });

  describe('requestChanges', () => {
    it('creates a review with CHANGES_REQUESTED status', async () => {
      prisma.review.create.mockResolvedValue({
        id: 'review-3',
        prId: 'pr-1',
        reviewerId: 'user-2',
        status: 'CHANGES_REQUESTED',
        body: 'Please fix the formatting',
      });

      const result = await service.requestChanges('pr-1', 'user-2', 'Please fix the formatting');

      expect(result.status).toBe('CHANGES_REQUESTED');
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          prId: 'pr-1',
          reviewerId: 'user-2',
          status: 'CHANGES_REQUESTED',
          body: 'Please fix the formatting',
        },
      });
    });

    it('creates changes requested review without body', async () => {
      prisma.review.create.mockResolvedValue({
        id: 'review-4',
        prId: 'pr-2',
        reviewerId: 'user-3',
        status: 'CHANGES_REQUESTED',
        body: null,
      });

      const result = await service.requestChanges('pr-2', 'user-3');

      expect(result.status).toBe('CHANGES_REQUESTED');
      expect(prisma.review.create).toHaveBeenCalledWith({
        data: {
          prId: 'pr-2',
          reviewerId: 'user-3',
          status: 'CHANGES_REQUESTED',
          body: null,
        },
      });
    });
  });

  describe('listReviews', () => {
    it('returns all reviews for a PR', async () => {
      const mockReviews = [
        { id: 'review-1', prId: 'pr-1', status: 'APPROVED' },
        { id: 'review-2', prId: 'pr-1', status: 'CHANGES_REQUESTED' },
      ];
      prisma.review.findMany.mockResolvedValue(mockReviews);

      const result = await service.listReviews('pr-1');

      expect(result).toHaveLength(2);
      expect(prisma.review.findMany).toHaveBeenCalledWith({
        where: { prId: 'pr-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns empty array when no reviews exist', async () => {
      prisma.review.findMany.mockResolvedValue([]);

      const result = await service.listReviews('pr-99');

      expect(result).toHaveLength(0);
    });
  });
});
