// ============================================================================
// Snippet Highlighter - Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { SnippetHighlighter } from './snippet-highlighter';

describe('SnippetHighlighter', () => {
  let highlighter: SnippetHighlighter;

  beforeEach(() => {
    highlighter = new SnippetHighlighter();
  });

  describe('basic term highlighting', () => {
    it('should highlight a single term with <mark> tags', () => {
      const result = highlighter.highlight('The quick brown fox', ['quick']);
      expect(result.text).toContain('<mark>quick</mark>');
      expect(result.matchCount).toBe(1);
    });

    it('should highlight terms case-insensitively', () => {
      const result = highlighter.highlight('The Quick Brown Fox', ['quick']);
      expect(result.text).toContain('<mark>Quick</mark>');
      expect(result.matchCount).toBe(1);
    });

    it('should highlight multiple occurrences of the same term', () => {
      const result = highlighter.highlight('test this test and another test', ['test']);
      expect(result.matchCount).toBe(3);
      expect(result.text).toContain('<mark>test</mark>');
    });
  });

  describe('multi-term highlighting', () => {
    it('should highlight multiple different terms', () => {
      const result = highlighter.highlight('The quick brown fox jumps over the lazy dog', [
        'quick',
        'fox',
      ]);
      expect(result.text).toContain('<mark>quick</mark>');
      expect(result.text).toContain('<mark>fox</mark>');
      expect(result.matchCount).toBe(2);
    });

    it('should highlight overlapping terms correctly', () => {
      const result = highlighter.highlight('searching for search results', ['search']);
      expect(result.matchCount).toBe(2);
    });
  });

  describe('snippet window selection', () => {
    it('should select the window with the most matches', () => {
      const longText =
        'Introduction to programming. ' +
        'A'.repeat(200) +
        ' The main topic is about search. Search is important. Search works well.';
      const result = highlighter.highlight(longText, ['search']);
      // Should pick the window around the cluster of "search" terms
      expect(result.matchCount).toBeGreaterThan(0);
      expect(result.text).toContain('<mark>');
    });

    it('should add ellipsis when snippet is not at start', () => {
      const longText = 'A'.repeat(200) + ' keyword here';
      const result = highlighter.highlight(longText, ['keyword']);
      expect(result.text).toMatch(/^\.\.\./);
    });

    it('should add ellipsis when snippet is not at end', () => {
      const longText = 'keyword here ' + 'A'.repeat(400);
      const result = highlighter.highlight(longText, ['keyword']);
      expect(result.text).toMatch(/\.\.\.$/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const result = highlighter.highlight('', ['test']);
      expect(result.text).toBe('');
      expect(result.matchCount).toBe(0);
    });

    it('should handle empty query terms', () => {
      const result = highlighter.highlight('some text', []);
      expect(result.matchCount).toBe(0);
    });

    it('should handle no matches found', () => {
      const result = highlighter.highlight('The quick brown fox', ['zebra']);
      expect(result.matchCount).toBe(0);
      expect(result.text).not.toContain('<mark>');
    });

    it('should handle terms with special regex characters', () => {
      const result = highlighter.highlight('price is $100.00 today', ['$100.00']);
      expect(result.text).toContain('<mark>$100.00</mark>');
      expect(result.matchCount).toBe(1);
    });

    it('should handle whitespace-only terms', () => {
      const result = highlighter.highlight('some text', ['  ', '']);
      expect(result.matchCount).toBe(0);
    });

    it('should HTML-escape source text to prevent XSS', () => {
      const result = highlighter.highlight('<script>alert("xss")</script> is dangerous keyword', [
        'keyword',
      ]);
      expect(result.text).not.toContain('<script>');
      expect(result.text).toContain('&lt;script&gt;');
      expect(result.text).toContain('&quot;');
      expect(result.text).toContain('<mark>keyword</mark>');
      expect(result.matchCount).toBe(1);
    });
  });

  describe('custom options', () => {
    it('should respect custom highlight tag', () => {
      const custom = new SnippetHighlighter({ highlightTag: 'em' });
      const result = custom.highlight('hello world', ['world']);
      expect(result.text).toContain('<em>world</em>');
    });

    it('should respect custom max snippet length', () => {
      const custom = new SnippetHighlighter({ maxSnippetLength: 50 });
      const longText = 'keyword ' + 'A'.repeat(200);
      const result = custom.highlight(longText, ['keyword']);
      // The raw snippet (without tags and ellipsis) should be bounded
      const stripped = result.text.replace(/<\/?mark>/g, '').replace(/\.\.\./g, '');
      expect(stripped.length).toBeLessThanOrEqual(50);
    });
  });
});
