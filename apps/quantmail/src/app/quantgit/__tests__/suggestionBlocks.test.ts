import { describe, it, expect } from 'vitest';
import {
  parseSuggestionBlock,
  hasSuggestionBlock,
  toggleSuggestionBlock,
  splitCommentBody,
} from '../components/suggestionBlocks';

// GitHub-style suggestion blocks in QuantGit inline review comments: the
// fence syntax, the authoring toggle, and the render split must agree, or a
// reviewer suggestion silently becomes plain text (or worse, applies wrong).

describe('suggestionBlocks', () => {
  it('parses a single-line suggestion block', () => {
    const body = 'nit: use the constant\n```suggestion\nconst y = MAX_RETRIES;\n```';
    expect(parseSuggestionBlock(body)).toEqual(['const y = MAX_RETRIES;']);
    expect(hasSuggestionBlock(body)).toBe(true);
  });

  it('parses a multi-line suggestion block exactly, without trimming lines', () => {
    const body = [
      '```suggestion',
      'if (ok) {',
      '  return true;',
      '}',
      '```',
    ].join('\n');
    expect(parseSuggestionBlock(body)).toEqual(['if (ok) {', '  return true;', '}']);
  });

  it('returns null for plain comments and for unclosed fences', () => {
    expect(parseSuggestionBlock('just a note')).toBeNull();
    expect(parseSuggestionBlock('```suggestion\nnever closed')).toBeNull();
    expect(hasSuggestionBlock('```suggestion\nnever closed')).toBe(false);
  });

  it('treats an empty block as a valid delete-the-line suggestion', () => {
    expect(parseSuggestionBlock('```suggestion\n```')).toEqual([]);
    expect(hasSuggestionBlock('```suggestion\n```')).toBe(true);
  });

  it('handles CRLF-authored comments', () => {
    const body = 'note\r\n```suggestion\r\nconst y = 3;\r\n```';
    expect(parseSuggestionBlock(body)).toEqual(['const y = 3;']);
  });

  it('applies only the first block when several are present', () => {
    const body = [
      '```suggestion',
      'first',
      '```',
      '```suggestion',
      'second',
      '```',
    ].join('\n');
    expect(parseSuggestionBlock(body)).toEqual(['first']);
  });

  it('toggle inserts a prefilled block and removes it again', () => {
    const withBlock = toggleSuggestionBlock('please fix this', ['const y = 3;']);
    expect(withBlock).toContain('please fix this');
    expect(withBlock).toContain('```suggestion\nconst y = 3;\n```');
    expect(toggleSuggestionBlock(withBlock, ['const y = 3;'])).toBe('please fix this');
  });

  it('toggle on an empty draft yields just the fence block', () => {
    expect(toggleSuggestionBlock('', ['const y = 3;'])).toBe(
      '```suggestion\nconst y = 3;\n```',
    );
  });

  it('splitCommentBody separates note text from suggestion segments', () => {
    const body = 'before\n```suggestion\nnew line\n```\nafter';
    const segments = splitCommentBody(body);
    expect(segments).toEqual([
      { type: 'text', text: 'before' },
      { type: 'suggestion', lines: ['new line'] },
      { type: 'text', text: 'after' },
    ]);
  });

  it('splitCommentBody keeps unclosed fences inside plain text', () => {
    const segments = splitCommentBody('note\n```suggestion\ndangling');
    expect(segments).toEqual([{ type: 'text', text: 'note\n```suggestion\ndangling' }]);
  });
});
