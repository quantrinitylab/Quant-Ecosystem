// GitHub-style suggested changes, server side.
//
// Mirrors the client-side fence syntax in
// src/app/quantgit/components/suggestionBlocks.ts (the backend cannot import
// from the Next.js app tree, so the small parser lives here too): a review
// comment carries a suggestion when its body contains a well-formed fenced
// block:
//
//   ```suggestion
//   <replacement lines>
//   ```
//
// The block replaces the single diff line the comment is anchored on. Pure
// functions only — the git plumbing in routes/repos.ts stays thin and the
// line-replacement rules are unit-testable without a repository.

export const SUGGESTION_FENCE_OPEN = '```suggestion';
export const SUGGESTION_FENCE_CLOSE = '```';

function splitLines(body: string): string[] {
  return body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/**
 * The suggested replacement lines of the first well-formed suggestion block
 * in a comment body, or null when there is none. An opened-but-never-closed
 * fence is plain text, never a half-applied suggestion. An empty block is
 * valid: it means "delete the anchored line".
 */
export function parseSuggestionBlock(body: string): string[] | null {
  if (!body || typeof body !== 'string') return null;
  const lines = splitLines(body);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== SUGGESTION_FENCE_OPEN) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === SUGGESTION_FENCE_CLOSE) {
        return lines.slice(i + 1, j);
      }
    }
    return null;
  }
  return null;
}

export type SuggestionApplyErrorCode =
  | 'SUGGESTION_LINE_OUT_OF_RANGE'
  | 'SUGGESTION_EMPTY_FILE';

/**
 * Replace one 1-based line of file content with the suggested lines.
 * Line numbers count real lines: a trailing newline does not create an
 * extra phantom line, so replacing the last line of "a\nb\n" works and the
 * trailing newline is preserved. Throws an Error carrying a
 * SuggestionApplyErrorCode in `code` when the anchor no longer exists (the
 * head branch moved on — the reviewer must re-anchor, never a guessed edit).
 */
export function applySuggestionToContent(
  content: string,
  lineNumber: number,
  suggestedLines: string[],
): string {
  const hasTrailingNewline = content.endsWith('\n');
  const lines = content.split('\n');
  // "a\nb\n" splits to ['a', 'b', ''] — the final '' is the trailing
  // newline, not a line. An empty file has zero lines.
  const realLineCount =
    content === '' ? 0 : hasTrailingNewline ? lines.length - 1 : lines.length;
  if (
    !Number.isInteger(lineNumber) ||
    lineNumber < 1 ||
    lineNumber > realLineCount
  ) {
    const code: SuggestionApplyErrorCode =
      realLineCount === 0 ? 'SUGGESTION_EMPTY_FILE' : 'SUGGESTION_LINE_OUT_OF_RANGE';
    const error = new Error(
      `Suggested change anchor line ${lineNumber} is outside the file (${realLineCount} lines).`,
    ) as Error & { code: SuggestionApplyErrorCode };
    error.code = code;
    throw error;
  }
  const body = hasTrailingNewline ? lines.slice(0, -1) : lines;
  body.splice(lineNumber - 1, 1, ...suggestedLines);
  if (body.length === 0) return '';
  const next = body.join('\n');
  return hasTrailingNewline ? `${next}\n` : next;
}
