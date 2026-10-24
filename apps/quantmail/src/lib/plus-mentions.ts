import type { ContactSuggestion } from '../types';

/**
 * Inline "+" contact mentions in composer bodies (Gmail parity — finding
 * qm-compose-plus-mention, 2026-10-11): typing "+" followed by a contact
 * name inside the message body opens a contact picker, and picking one
 * inserts "@Name" into the body AND adds the contact to the To field, so
 * the user never has to navigate up to the recipient rows. Previously all
 * three composers (EmailComposer, DockedComposer, ThreadComposer) offered
 * contact autocomplete only in the recipient fields; the body had zero
 * mention handling.
 *
 * This module is pure (no DOM, no React) so the trigger/apply contract is
 * unit-testable without a browser. The React wiring lives in
 * `hooks/usePlusMention.ts`; the dropdown rendering in
 * `components/PlusMentionDropdown.tsx`.
 */

/** A live "+" trigger: the "+" offset, the caret offset, and the typed query. */
export interface PlusMentionTrigger {
  /** Index of the "+" character in the body text. */
  start: number;
  /** Caret offset — the end of the typed query. */
  end: number;
  /** Text after "+" up to the caret (may contain spaces for multi-word names). */
  query: string;
}

/**
 * Characters a mention query may contain: letters, digits, spaces and the
 * name punctuation Gmail names carry (dot, hyphen, apostrophe). Anything
 * else (newline, "@", ",", "!", ...) ends the query — and a "+" that is not
 * the first query character is never a trigger start.
 */
const QUERY_CHAR = /[A-Za-z0-9 .'\-]/;

/** A query must contain at least one letter: bare "+" or "+123" is not a name. */
const HAS_LETTER = /[A-Za-z]/;

/**
 * Find the "+" mention trigger ending at `caret`, or null.
 *
 * Rules (each exists to stop a false trigger from hijacking typing):
 * - The "+" must sit at the start of the body or right after whitespace, so
 *   `a+b@x.com`, `C++` and `2+2` never trigger (the "++" writing-assistant
 *   trigger in DockedComposer is stripped before this ever runs, and even
 *   if it survived, the second "+" is preceded by "+" and fails this rule).
 * - The query after "+" must be non-empty and contain a letter.
 * - The scan stops at the first non-query character, so "+John!" with the
 *   caret after "!" is not a trigger (the "!" ended it).
 */
export function findPlusMentionTrigger(body: string, caret: number): PlusMentionTrigger | null {
  const before = body.slice(0, Math.max(0, Math.min(caret, body.length)));
  let i = before.length;
  while (i > 0 && QUERY_CHAR.test(before[i - 1])) i--;
  if (i === 0 || before[i - 1] !== '+') return null;
  const start = i - 1;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (!query.trim() || !HAS_LETTER.test(query)) return null;
  if (query.length > 60) return null;
  return { start, end: before.length, query };
}

/** Display form of a contact inside a mention: the name, else the address. */
export function mentionDisplayName(contact: ContactSuggestion): string {
  return contact.name?.trim() || contact.email;
}

export interface AppliedPlusMention {
  /** Body with the trigger range replaced by "@Name ". */
  text: string;
  /** Caret offset right after the inserted mention (after the trailing space). */
  caret: number;
}

/**
 * Replace the trigger range with "@Name " — the "@" prefix keeps the mention
 * readable as a mention in a plain <textarea> (which cannot paint chips),
 * and the trailing space lets typing continue naturally. The recipient add
 * itself is the host composer's job (its To state); this only rewrites text.
 */
export function applyPlusMention(
  body: string,
  trigger: PlusMentionTrigger,
  contact: ContactSuggestion,
): AppliedPlusMention {
  const inserted = `@${mentionDisplayName(contact)} `;
  return {
    text: body.slice(0, trigger.start) + inserted + body.slice(trigger.end),
    caret: trigger.start + inserted.length,
  };
}
