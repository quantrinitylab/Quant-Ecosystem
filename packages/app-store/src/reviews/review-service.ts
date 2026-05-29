import { AppReview, Pagination, SortOptions } from '../types.js';

export class ReviewService {
  private reviews: Map<string, AppReview> = new Map();
  private purchases: Map<string, Set<string>> = new Map(); // userId -> appIds

  submit(appId: string, userId: string, rating: number, text: string): AppReview {
    const id = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const verifiedPurchase = this.verifyPurchase(userId, appId);

    const review: AppReview = {
      id,
      appId,
      userId,
      rating: Math.min(5, Math.max(1, Math.round(rating))),
      text,
      verifiedPurchase,
      helpful: 0,
      createdAt: new Date(),
    };

    this.reviews.set(id, review);
    return review;
  }

  update(reviewId: string, updates: Partial<Pick<AppReview, 'rating' | 'text'>>): AppReview | null {
    const review = this.reviews.get(reviewId);
    if (!review) return null;

    const updated: AppReview = {
      ...review,
      ...(updates.rating !== undefined && {
        rating: Math.min(5, Math.max(1, Math.round(updates.rating))),
      }),
      ...(updates.text !== undefined && { text: updates.text }),
    };

    this.reviews.set(reviewId, updated);
    return updated;
  }

  delete(reviewId: string): boolean {
    return this.reviews.delete(reviewId);
  }

  getForApp(appId: string, sort?: SortOptions, pagination?: Pagination): AppReview[] {
    let results = Array.from(this.reviews.values()).filter((r) => r.appId === appId);

    if (sort) {
      results.sort((a, b) => {
        const aVal = a[sort.field as keyof AppReview] as number | string | Date;
        const bVal = b[sort.field as keyof AppReview] as number | string | Date;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sort.direction === 'asc' ? cmp : -cmp;
      });
    }

    if (pagination) {
      results = results.slice(pagination.offset, pagination.offset + pagination.limit);
    }

    return results;
  }

  getByUser(userId: string): AppReview[] {
    return Array.from(this.reviews.values()).filter((r) => r.userId === userId);
  }

  markHelpful(reviewId: string, _userId: string): AppReview | null {
    const review = this.reviews.get(reviewId);
    if (!review) return null;

    const updated: AppReview = { ...review, helpful: review.helpful + 1 };
    this.reviews.set(reviewId, updated);
    return updated;
  }

  verifyPurchase(userId: string, appId: string): boolean {
    const userPurchases = this.purchases.get(userId);
    return userPurchases?.has(appId) ?? false;
  }

  recordPurchase(userId: string, appId: string): void {
    if (!this.purchases.has(userId)) {
      this.purchases.set(userId, new Set());
    }
    this.purchases.get(userId)!.add(appId);
  }

  getAverageRating(appId: string): number {
    const appReviews = Array.from(this.reviews.values()).filter((r) => r.appId === appId);
    if (appReviews.length === 0) return 0;
    const sum = appReviews.reduce((acc, r) => acc + r.rating, 0);
    return sum / appReviews.length;
  }
}
