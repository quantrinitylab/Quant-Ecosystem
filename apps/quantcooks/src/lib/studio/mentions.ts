// ============================================================================
// QuantCooks Studio — composer prompt parsing (@-mentions and / references)
//
// The universal attach grammar from the Phase 2 spec §0.1: @-mentions attach
// dishes, presenters/personas, locations and people; / references attach
// collections, brand kits and pipelines. Parsing is pure and structured —
// the Composer never treats a mention as decoration; consumers receive the
// mention objects so the same prompt can be handed to a QuantAI tool call
// with identical parameters (tool-twin rule).
// ============================================================================

export type MentionKind = 'mention' | 'reference';

export interface PromptMention {
  kind: MentionKind;
  /** The token exactly as typed, including the @ or / sigil. */
  raw: string;
  /** The name without the sigil, e.g. "paneer-tikka" or "diwali-menu". */
  name: string;
  /** Character offsets in the source text (start inclusive, end exclusive). */
  start: number;
  end: number;
}

const MENTION_TOKEN = /@([A-Za-z0-9][A-Za-z0-9_-]*)/g;
const REFERENCE_TOKEN = /(^|\s)\/([A-Za-z0-9][A-Za-z0-9_-]*)/g;

/**
 * Extract structured mentions/references from a composer prompt.
 * A "/" only counts as a reference at the start of a word (beginning of the
 * text or after whitespace) so ordinary text like "sweet/sour" or a ratio
 * like "16/9" never becomes a reference.
 */
export function parsePromptMentions(text: string): PromptMention[] {
  const found: PromptMention[] = [];

  for (const match of text.matchAll(MENTION_TOKEN)) {
    const start = match.index ?? 0;
    found.push({ kind: 'mention', raw: match[0], name: match[1]!, start, end: start + match[0].length });
  }
  for (const match of text.matchAll(REFERENCE_TOKEN)) {
    const prefix = match[1] ?? '';
    const start = (match.index ?? 0) + prefix.length;
    const raw = `/${match[2]}`;
    found.push({ kind: 'reference', raw, name: match[2]!, start, end: start + raw.length });
  }

  return found.sort((a, b) => a.start - b.start);
}

/** Remove one mention token (and one following space) from the prompt. */
export function removeMention(text: string, mention: PromptMention): string {
  const before = text.slice(0, mention.start);
  let after = text.slice(mention.end);
  if (after.startsWith(' ')) after = after.slice(1);
  return (before + after).replace(/[ \t]{2,}/g, ' ');
}

/** True when the prompt carries any real content (text or a mention). */
export function promptHasInput(text: string): boolean {
  return text.trim().length > 0;
}
