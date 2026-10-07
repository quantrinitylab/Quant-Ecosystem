import { describe, it, expect } from 'vitest';
import { PerceptualHasher } from './perceptual-hash';

describe('PerceptualHasher', () => {
  describe('computeImageHash', () => {
    it('should compute a hash from an image buffer', () => {
      const hasher = new PerceptualHasher();
      const buffer = Buffer.from('test image data for hashing purposes that is long enough');
      const hash = hasher.computeImageHash(buffer);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(16); // 64 bits / 4 = 16 hex chars
    });

    it('should return the same hash for the same buffer (re-uploaded image detection)', () => {
      const hasher = new PerceptualHasher();
      const buffer = Buffer.from(
        'identical image content that simulates a real image file with pixels',
      );
      const hash1 = hasher.computeImageHash(buffer);
      const hash2 = hasher.computeImageHash(buffer);

      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for different buffers', () => {
      const hasher = new PerceptualHasher();
      const buffer1 = Buffer.from('first image content with unique pixel data that is different');
      const buffer2 = Buffer.from('completely different second image with other pixel values here');
      const hash1 = hasher.computeImageHash(buffer1);
      const hash2 = hasher.computeImageHash(buffer2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('compareImageHashes', () => {
    it('should return 0 distance for identical hashes', () => {
      const hasher = new PerceptualHasher();
      const buffer = Buffer.from(
        'test buffer data for hash comparison that is long enough to process',
      );
      const hash = hasher.computeImageHash(buffer);
      const distance = hasher.compareImageHashes(hash, hash);

      expect(distance).toBe(0);
    });

    it('should return non-zero distance for different hashes', () => {
      const hasher = new PerceptualHasher();
      const hash1 = hasher.computeImageHash(Buffer.from('image A with unique content aaaa'));
      const hash2 = hasher.computeImageHash(Buffer.from('image B with different content b'));
      const distance = hasher.compareImageHashes(hash1, hash2);

      expect(distance).toBeGreaterThan(0);
    });
  });

  describe('isNearDuplicate', () => {
    it('should detect re-uploaded image (same buffer = same hash, distance 0)', () => {
      const hasher = new PerceptualHasher();
      const buffer = Buffer.from(
        'the exact same image re-uploaded by a different user longer data',
      );
      const hash1 = hasher.computeImageHash(buffer);
      const hash2 = hasher.computeImageHash(buffer);

      expect(hasher.isNearDuplicate(hash1, hash2)).toBe(true);
    });

    it('should not flag completely different images as duplicates', () => {
      const hasher = new PerceptualHasher();
      const hash1 = hasher.computeImageHash(Buffer.from('abcdefghijklmnopqrstuvwxyz1234567890abc'));
      const hash2 = hasher.computeImageHash(Buffer.from('zyxwvutsrqponmlkjihgfedcba0987654321xyz'));

      // Different content should have high hamming distance
      const distance = hasher.compareImageHashes(hash1, hash2);
      expect(distance).toBeGreaterThan(10);
    });

    it('should respect custom threshold', () => {
      const hasher = new PerceptualHasher();
      const hash1 = hasher.computeImageHash(
        Buffer.from('test content that is similar abcdef123456'),
      );
      const hash2 = hasher.computeImageHash(
        Buffer.from('test content that is similar abcdef654321'),
      );

      // With threshold 0, only exact matches
      const distance = hasher.compareImageHashes(hash1, hash2);
      if (distance > 0) {
        expect(hasher.isNearDuplicate(hash1, hash2, 0)).toBe(false);
      }
    });
  });

  describe('computeSimHash', () => {
    it('should compute a simhash from text', () => {
      const hasher = new PerceptualHasher();
      const hash = hasher.computeSimHash('Hello world this is a test of text hashing');

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(16); // 64 bits / 4 = 16 hex chars
    });

    it('should detect near-duplicate text (same text produces same hash)', () => {
      const hasher = new PerceptualHasher();
      const text = 'This is a sample article about technology and innovation';
      const hash1 = hasher.computeSimHash(text);
      const hash2 = hasher.computeSimHash(text);
      const distance = hasher.compareTextHashes(hash1, hash2);

      expect(distance).toBe(0);
    });

    it('should produce similar hashes for similar texts', () => {
      const hasher = new PerceptualHasher();
      const text1 = 'The quick brown fox jumps over the lazy dog every morning';
      const text2 = 'The quick brown fox jumps over the lazy cat every morning';
      const hash1 = hasher.computeSimHash(text1);
      const hash2 = hasher.computeSimHash(text2);
      const distance = hasher.compareTextHashes(hash1, hash2);

      // Similar texts should have small hamming distance
      expect(distance).toBeLessThan(20);
    });

    it('should produce different hashes for completely different texts', () => {
      const hasher = new PerceptualHasher();
      const hash1 = hasher.computeSimHash(
        'Machine learning artificial intelligence neural networks deep learning',
      );
      const hash2 = hasher.computeSimHash('Cooking recipes ingredients kitchen preparation baking');
      const distance = hasher.compareTextHashes(hash1, hash2);

      expect(distance).toBeGreaterThan(0);
    });
  });

  describe('compareTextHashes', () => {
    it('should return 0 for identical text hashes', () => {
      const hasher = new PerceptualHasher();
      const hash = hasher.computeSimHash('identical text content for comparison');
      const distance = hasher.compareTextHashes(hash, hash);

      expect(distance).toBe(0);
    });
  });
});
