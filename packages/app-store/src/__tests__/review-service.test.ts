import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewService } from '../reviews/review-service.js';

describe('ReviewService', () => {
  let service: ReviewService;

  beforeEach(() => {
    service = new ReviewService();
  });

  describe('submit', () => {
    it('should create a review with given parameters', () => {
      const review = service.submit('app-1', 'user-1', 4, 'Great app!');

      expect(review.appId).toBe('app-1');
      expect(review.userId).toBe('user-1');
      expect(review.rating).toBe(4);
      expect(review.text).toBe('Great app!');
      expect(review.helpful).toBe(0);
    });

    it('should clamp rating to 1-5 range', () => {
      const low = service.submit('app-1', 'user-1', 0, 'text');
      const high = service.submit('app-1', 'user-2', 10, 'text');

      expect(low.rating).toBe(1);
      expect(high.rating).toBe(5);
    });

    it('should generate unique IDs for each review', () => {
      const r1 = service.submit('app-1', 'user-1', 4, 'text');
      const r2 = service.submit('app-1', 'user-2', 3, 'text');

      expect(r1.id).not.toBe(r2.id);
    });
  });

  describe('verifiedPurchase', () => {
    it('should mark as verified when user has purchased', () => {
      service.recordPurchase('user-1', 'app-1');
      const review = service.submit('app-1', 'user-1', 5, 'Love it!');

      expect(review.verifiedPurchase).toBe(true);
    });

    it('should not mark as verified when user has not purchased', () => {
      const review = service.submit('app-1', 'user-2', 3, 'Okay');

      expect(review.verifiedPurchase).toBe(false);
    });

    it('should correctly verify purchase status', () => {
      service.recordPurchase('user-1', 'app-1');

      expect(service.verifyPurchase('user-1', 'app-1')).toBe(true);
      expect(service.verifyPurchase('user-1', 'app-2')).toBe(false);
      expect(service.verifyPurchase('user-2', 'app-1')).toBe(false);
    });
  });

  describe('markHelpful', () => {
    it('should increment helpful count', () => {
      const review = service.submit('app-1', 'user-1', 4, 'Helpful review');
      const updated = service.markHelpful(review.id, 'user-2');

      expect(updated!.helpful).toBe(1);
    });

    it('should allow multiple users to mark helpful', () => {
      const review = service.submit('app-1', 'user-1', 4, 'Good');
      service.markHelpful(review.id, 'user-2');
      const result = service.markHelpful(review.id, 'user-3');

      expect(result!.helpful).toBe(2);
    });

    it('should return null for non-existent review', () => {
      expect(service.markHelpful('fake-id', 'user-1')).toBeNull();
    });
  });

  describe('rating aggregation', () => {
    it('should calculate average rating for an app', () => {
      service.submit('app-1', 'user-1', 5, 'Great');
      service.submit('app-1', 'user-2', 3, 'Okay');
      service.submit('app-1', 'user-3', 4, 'Good');

      const avg = service.getAverageRating('app-1');
      expect(avg).toBe(4);
    });

    it('should return 0 for app with no reviews', () => {
      expect(service.getAverageRating('no-reviews')).toBe(0);
    });

    it('should not include reviews from other apps', () => {
      service.submit('app-1', 'user-1', 5, 'Five');
      service.submit('app-2', 'user-1', 1, 'One');

      expect(service.getAverageRating('app-1')).toBe(5);
      expect(service.getAverageRating('app-2')).toBe(1);
    });
  });

  describe('getForApp', () => {
    it('should return all reviews for an app', () => {
      service.submit('app-1', 'user-1', 4, 'Review 1');
      service.submit('app-1', 'user-2', 5, 'Review 2');
      service.submit('app-2', 'user-3', 3, 'Other app');

      const reviews = service.getForApp('app-1');
      expect(reviews.length).toBe(2);
      expect(reviews.every((r) => r.appId === 'app-1')).toBe(true);
    });
  });

  describe('getByUser', () => {
    it('should return all reviews by a user', () => {
      service.submit('app-1', 'user-1', 4, 'R1');
      service.submit('app-2', 'user-1', 3, 'R2');
      service.submit('app-3', 'user-2', 5, 'R3');

      const reviews = service.getByUser('user-1');
      expect(reviews.length).toBe(2);
    });
  });

  describe('update', () => {
    it('should update review text', () => {
      const review = service.submit('app-1', 'user-1', 4, 'Original');
      const updated = service.update(review.id, { text: 'Updated' });

      expect(updated!.text).toBe('Updated');
      expect(updated!.rating).toBe(4);
    });

    it('should return null for non-existent review', () => {
      expect(service.update('fake', { text: 'x' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('should remove a review', () => {
      const review = service.submit('app-1', 'user-1', 4, 'text');
      expect(service.delete(review.id)).toBe(true);
      expect(service.getForApp('app-1').length).toBe(0);
    });
  });
});
