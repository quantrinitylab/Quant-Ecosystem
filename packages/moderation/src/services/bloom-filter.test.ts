import { describe, it, expect } from 'vitest';
import { BloomFilter } from './bloom-filter';

describe('BloomFilter', () => {
  describe('add and has', () => {
    it('should return true for added items (zero false negatives)', () => {
      const filter = new BloomFilter(10000, 7);
      filter.add('hash_abc123');
      filter.add('hash_def456');
      filter.add('hash_ghi789');

      expect(filter.has('hash_abc123')).toBe(true);
      expect(filter.has('hash_def456')).toBe(true);
      expect(filter.has('hash_ghi789')).toBe(true);
    });

    it('should return false for items never added (with high probability)', () => {
      const filter = new BloomFilter(10000, 7);
      filter.add('known_hash_1');
      filter.add('known_hash_2');

      // Items never added should generally return false
      expect(filter.has('unknown_hash_999')).toBe(false);
      expect(filter.has('completely_different')).toBe(false);
    });

    it('should handle empty filter correctly', () => {
      const filter = new BloomFilter(10000, 7);
      expect(filter.has('anything')).toBe(false);
    });

    it('should guarantee zero false negatives with 1000 items', () => {
      const filter = new BloomFilter(10000, 7);
      const items: string[] = [];

      for (let i = 0; i < 1000; i++) {
        const item = `hash_${i.toString(16).padStart(8, '0')}`;
        items.push(item);
        filter.add(item);
      }

      // Every added item must be found (zero false negatives)
      for (const item of items) {
        expect(filter.has(item)).toBe(true);
      }
    });
  });

  describe('estimateFalsePositiveRate', () => {
    it('should return 0 for empty filter', () => {
      const filter = new BloomFilter(10000, 7);
      expect(filter.estimateFalsePositiveRate()).toBe(0);
    });

    it('should return reasonable rate for 1000 items in 10000-bit filter', () => {
      const filter = new BloomFilter(10000, 7);
      for (let i = 0; i < 1000; i++) {
        filter.add(`item_${i}`);
      }

      const rate = filter.estimateFalsePositiveRate();
      // With k=7, n=1000, m=10000, theoretical rate is ~0.82%
      // Allow some tolerance
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThan(0.05); // Should be well under 5%
    });

    it('should increase as more items are added', () => {
      const filter = new BloomFilter(10000, 7);

      filter.add('item_1');
      const rate1 = filter.estimateFalsePositiveRate();

      for (let i = 2; i <= 500; i++) {
        filter.add(`item_${i}`);
      }
      const rate2 = filter.estimateFalsePositiveRate();

      expect(rate2).toBeGreaterThan(rate1);
    });
  });

  describe('serialization', () => {
    it('should roundtrip serialize/deserialize correctly', () => {
      const filter = new BloomFilter(10000, 7);
      filter.add('hash_a');
      filter.add('hash_b');
      filter.add('hash_c');

      const serialized = filter.serialize();
      const restored = BloomFilter.deserialize(serialized);

      expect(restored.has('hash_a')).toBe(true);
      expect(restored.has('hash_b')).toBe(true);
      expect(restored.has('hash_c')).toBe(true);
      expect(restored.has('hash_d')).toBe(false);
    });

    it('should preserve item count through serialization', () => {
      const filter = new BloomFilter(5000, 5);
      filter.add('one');
      filter.add('two');
      filter.add('three');

      const serialized = filter.serialize();
      const restored = BloomFilter.deserialize(serialized);

      expect(restored.getItemCount()).toBe(3);
      expect(restored.getSize()).toBe(5000);
      expect(restored.getHashCount()).toBe(5);
    });

    it('should produce a Buffer from serialize', () => {
      const filter = new BloomFilter(1000, 3);
      filter.add('test');
      const buf = filter.serialize();

      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(12); // At least header size
    });
  });

  describe('getters', () => {
    it('should report correct item count', () => {
      const filter = new BloomFilter(10000, 7);
      expect(filter.getItemCount()).toBe(0);

      filter.add('a');
      filter.add('b');
      expect(filter.getItemCount()).toBe(2);
    });

    it('should report configured size and hash count', () => {
      const filter = new BloomFilter(8000, 5);
      expect(filter.getSize()).toBe(8000);
      expect(filter.getHashCount()).toBe(5);
    });
  });
});
