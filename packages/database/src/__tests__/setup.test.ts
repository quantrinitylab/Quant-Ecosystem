import { describe, it, expect } from 'vitest';

describe('Database Package Setup', () => {
  it('should have working test infrastructure', () => {
    expect(1 + 1).toBe(2);
  });

  it('should support async tests', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });
});
