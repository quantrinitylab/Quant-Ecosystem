// GitHub-style suggested changes for QuantGit inline review comments.
//
// A reviewer writes a fenced block inside an otherwise plain comment:
//
//   Please use the constant here.
//   ```suggestion
//   const y = MAX_RETRIES;
//   ```
//
// The block's lines are the replacement for the diff line the comment is
// anchored on (single-line anchor: one anchored line in, N suggested lines
// out — the same semantics GitHub applies to a single-line suggestion).
// The PR author then applies it with one click; the backend commits the
// replacement onto the PR head branch (POST .../comments/:id/apply-suggestion).
//
// Pure functions only: no network, no DOM, fully unit-testable. Anything
// that is not a well-formed fenced block is treated as plain comment text —
// never rendered or applied as a suggestion.

export const SUGGESTION_FENCE_OPEN = '```suggestion';
export const SUGGESTION_FENCE_CLOSE = '```';

/** Split body into lines, normalizing CRLF so Windows-authored comments parse. */
function splitLines(body: string): string[] {
  return body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

function isOpenFence(line: string): boolean {
  return line.trim() === SUGGESTION_FENCE_OPEN;
}

function isCloseFence(line: string): boolean {
  return line.trim() === SUGGESTION_FENCE_CLOSE;
}

export type SuggestionBlock = {
  /** Index of the opening fence line within the split body. */
  openLine: number;
  /** Index of the closing fence line within the split body. */
  closeLine: number;
  /** The suggested replacement lines, exactly as written (no trimming). */
  lines: string[];
};

/**
 * Find the FIRST well-formed suggestion block in a comment body. Returns
 * null when there is no block, or when a block is opened but never closed
 * (an unclosed fence is plain text, never a half-applied suggestion).
 * An empty block is valid: it means "delete the anchored line".
 */
export function findSuggestionBlock(body: string): SuggestionBlock | null {
  if (!body || typeof body !== 'string') return null;
  const lines = splitLines(body);
  for (let i = 0; i < lines.length; i++) {
    if (!isOpenFence(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      if (isCloseFence(lines[j])) {
        return { openLine: i, closeLine: j, lines: lines.slice(i + 1, j) };
      }
    }
    // Opened but never closed — not a suggestion.
    return null;
  }
  return null;
}

/** True when the body carries at least one well-formed suggestion block. */
export function hasSuggestionBlock(body: string): boolean {
  return findSuggestionBlock(body) !== null;
}

/**
 * The suggested replacement lines of the first well-formed block, or null
 * when the body carries no applicable suggestion.
 */
export function parseSuggestionBlock(body: string): string[] | null {
  const block = findSuggestionBlock(body);
  return block ? block.lines : null;
}

export type CommentBodySegment =
  | { type: 'text'; text: string }
  | { type: 'suggestion'; lines: string[] };

/**
 * Split a comment body into renderable segments: plain text around each
 * well-formed suggestion block, and one suggestion segment per block.
 * Malformed (unclosed) fences stay inside a text segment — they are never
 * rendered as suggestions. Empty text segments are dropped.
 */
export function splitCommentBody(body: string): CommentBodySegment[] {
  if (!body) return [];
  const lines = splitLines(body);
  const segments: CommentBodySegment[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const block = findSuggestionBlock(lines.slice(cursor).join('\n'));
    if (!block) {
      const text = lines.slice(cursor).join('\n');
      if (text.trim().length > 0) segments.push({ type: 'text', text });
      break;
    }
    const openLine = cursor + block.openLine;
    const closeLine = cursor + block.closeLine;
    const before = lines.slice(cursor, openLine).join('\n');
    if (before.trim().length > 0) segments.push({ type: 'text', text: before });
    segments.push({ type: 'suggestion', lines: block.lines });
    cursor = closeLine + 1;
  }
  return segments;
}

/**
 * Toggle a suggestion block in a comment draft (the "Add suggestion" button
 * / Cmd+G in the comment box). When the draft already has a block, remove
 * the first one; otherwise append a block prefilled with the anchored diff
 * line's current content, so the reviewer edits the replacement instead of
 * typing a fence from scratch. Plain note text is preserved either way.
 */
export function toggleSuggestionBlock(draft: string, prefillLines: string[]): string {
  const block = findSuggestionBlock(draft);
  if (block) {
    const lines = splitLines(draft);
    const remaining = [...lines.slice(0, block.openLine), ...lines.slice(block.closeLine + 1)];
    // Collapse the blank-line gap the removed block leaves behind, but keep
    // the note's own trailing content intact.
    return remaining.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  }
  const fence = [SUGGESTION_FENCE_OPEN, ...prefillLines, SUGGESTION_FENCE_CLOSE].join('\n');
  const trimmed = draft.trimEnd();
  return trimmed.length > 0 ? `${trimmed}\n${fence}` : fence;
}
