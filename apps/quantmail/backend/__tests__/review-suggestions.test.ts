// @vitest-environment node
// Server-side suggestion rules: the fence parser and the line-replacement
// must agree with the client, or an Apply click would commit the wrong edit
// onto the PR head branch.

import { describe, it, expect } from 'vitest';
import {
  parseSuggestionBlock,
  applySuggestionToContent,
} from '../lib/review-suggestions';

describe('review-suggestions', () => {
  it('parses a suggestion block and rejects plain text and unclosed fences', () => {
    expect(parseSuggestionBlock('note\n```suggestion\nnew\n```')).toEqual(['new']);
    expect(parseSuggestionBlock('plain note')).toBeNull();
    expect(parseSuggestionBlock('```suggestion\nnever closed')).toBeNull();
  });

  it('replaces the anchored line and preserves the trailing newline', () => {
    expect(applySuggestionToContent('a\nb\nc\n', 2, ['B!'])).toBe('a\nB!\nc\n');
  });

  it('expands one anchored line into several suggested lines', () => {
    expect(applySuggestionToContent('a\nb\n', 1, ['x', 'y'])).toBe('x\ny\nb\n');
  });

  it('deletes the anchored line for an empty suggestion block', () => {
    expect(applySuggestionToContent('a\nb\nc\n', 2, [])).toBe('a\nc\n');
    expect(applySuggestionToContent('only\n', 1, [])).toBe('');
  });

  it('preserves a missing trailing newline', () => {
    expect(applySuggestionToContent('a\nb', 2, ['B!'])).toBe('a\nB!');
  });

  it('rejects an anchor past the end of the file instead of guessing', () => {
    expect(() => applySuggestionToContent('a\nb\n', 3, ['x'])).toThrowError();
    try {
      applySuggestionToContent('a\nb\n', 3, ['x']);
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('SUGGESTION_LINE_OUT_OF_RANGE');
    }
  });

  it('rejects an anchor in an empty file', () => {
    try {
      applySuggestionToContent('', 1, ['x']);
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.code).toBe('SUGGESTION_EMPTY_FILE');
    }
  });
});
