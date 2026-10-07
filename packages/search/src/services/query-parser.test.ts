// ============================================================================
// Query Parser - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { QueryParser } from './query-parser';

describe('QueryParser', () => {
  let parser: QueryParser;

  beforeEach(() => {
    parser = new QueryParser();
  });

  describe('type detection', () => {
    it('should detect email type', () => {
      const result = parser.parse('emails from John');
      expect(result.type).toBe('email');
    });

    it('should detect message type', () => {
      const result = parser.parse('messages about project');
      expect(result.type).toBe('message');
    });

    it('should detect file type', () => {
      const result = parser.parse('files shared yesterday');
      expect(result.type).toBe('file');
    });

    it('should detect video type', () => {
      const result = parser.parse('videos about TypeScript');
      expect(result.type).toBe('video');
    });

    it('should detect post type', () => {
      const result = parser.parse('posts about search');
      expect(result.type).toBe('post');
    });

    it('should detect user type', () => {
      const result = parser.parse('users named Alice');
      expect(result.type).toBe('user');
    });

    it('should return undefined type for plain keywords', () => {
      const result = parser.parse('quarterly report');
      expect(result.type).toBeUndefined();
    });
  });

  describe('person references', () => {
    it('should extract from filter', () => {
      const result = parser.parse('emails from John');
      expect(result.filters).toContainEqual({ field: 'from', value: 'John' });
    });

    it('should extract to filter', () => {
      const result = parser.parse('messages to Alice');
      expect(result.filters).toContainEqual({ field: 'to', value: 'Alice' });
    });

    it('should extract by filter', () => {
      const result = parser.parse('posts by Bob');
      expect(result.filters).toContainEqual({ field: 'by', value: 'Bob' });
    });

    it('should handle multi-word names', () => {
      const result = parser.parse('emails from John Smith');
      expect(result.filters).toContainEqual({ field: 'from', value: 'John Smith' });
    });
  });

  describe('date ranges', () => {
    it('should parse "last month"', () => {
      const result = parser.parse('emails from John last month');
      expect(result.dateRange).toBeDefined();
      expect(result.dateRange!.from).toBeInstanceOf(Date);
      expect(result.dateRange!.to).toBeInstanceOf(Date);
      expect(result.dateRange!.from.getTime()).toBeLessThan(result.dateRange!.to.getTime());
    });

    it('should parse "yesterday"', () => {
      const result = parser.parse('files yesterday');
      expect(result.dateRange).toBeDefined();
      const now = new Date();
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      expect(result.dateRange!.from.getTime()).toBe(expectedStart.getTime());
    });

    it('should parse "this week"', () => {
      const result = parser.parse('messages this week');
      expect(result.dateRange).toBeDefined();
      expect(result.dateRange!.from.getTime()).toBeLessThan(result.dateRange!.to.getTime());
    });

    it('should parse "last week"', () => {
      const result = parser.parse('posts last week');
      expect(result.dateRange).toBeDefined();
      expect(result.dateRange!.from.getTime()).toBeLessThan(result.dateRange!.to.getTime());
    });

    it('should parse "last N days"', () => {
      const result = parser.parse('emails last 7 days');
      expect(result.dateRange).toBeDefined();
      const now = new Date();
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      expect(result.dateRange!.from.getTime()).toBe(expectedStart.getTime());
    });

    it('should parse "today"', () => {
      const result = parser.parse('messages today');
      expect(result.dateRange).toBeDefined();
      const now = new Date();
      const expectedStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      expect(result.dateRange!.from.getTime()).toBe(expectedStart.getTime());
    });
  });

  describe('full query parsing', () => {
    it('should parse "emails from John last month" correctly', () => {
      const result = parser.parse('emails from John last month');
      expect(result.type).toBe('email');
      expect(result.filters).toContainEqual({ field: 'from', value: 'John' });
      expect(result.dateRange).toBeDefined();
      expect(result.keywords).toHaveLength(0);
    });

    it('should extract keywords from remaining text', () => {
      const result = parser.parse('quarterly report budget');
      expect(result.type).toBeUndefined();
      expect(result.keywords).toContain('quarterly');
      expect(result.keywords).toContain('report');
      expect(result.keywords).toContain('budget');
    });

    it('should filter out stop words from keywords', () => {
      const result = parser.parse('the report and budget');
      expect(result.keywords).not.toContain('the');
      expect(result.keywords).not.toContain('and');
      expect(result.keywords).toContain('report');
      expect(result.keywords).toContain('budget');
    });

    it('should handle empty query', () => {
      const result = parser.parse('');
      expect(result.type).toBeUndefined();
      expect(result.filters).toHaveLength(0);
      expect(result.keywords).toHaveLength(0);
      expect(result.dateRange).toBeUndefined();
    });
  });
});
