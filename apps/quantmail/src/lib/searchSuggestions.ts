// ============================================================================
// Search typeahead suggestions — the main search box's as-you-type dropdown.
//
// The finding: AppShell's search inputs were bare inputs with zero dropdown,
// while the only instant-suggestion component in the tree (the composer's
// ContactAutocomplete) was never wired to search. This module is the pure
// suggestion builder behind the shell dropdown; the React wiring lives in
// components/SearchTypeahead.tsx.
//
// HONESTY BOUNDARY — what a suggestion may promise, and why:
// - Recent searches: the user's own account-scoped history (lib/searchHistory).
//   Re-running one is always meaningful, whatever view is open.
// - Contacts: the user's own frequent contacts (hooks/useContactSuggestions).
//   Picking one applies the contact's email address as a plain search token.
//   That token matches the inbox haystack (sender/recipient name + address,
//   see threadMatchesQuery/searchHaystack) and every other view's substring
//   filter, so it can never promise a match it cannot produce.
// - Operators: ONLY from:/to: are offered, and only when the user has already
//   typed an operator prefix (e.g. "fr" -> "from:"). Those are the two
//   operators the inbox's client-side filter actually honors (threadMatchesQuery
//   parses from:/to: against sender/recipient addresses). has:/subject:/in:
//   are deliberately NOT suggested here: no shell-view filter honors them,
//   so suggesting them in the shell box would promise results the view
//   cannot return. The /search page already owns those operators via its
//   filter chips, where a backend search backs them.
// - Labels: not suggested. No label list is available at shell level, and
//   inventing label names would be fake data. The "from:"/"to:" completions
//   plus contacts plus recents are everything the shell can truthfully offer.
// ============================================================================

import type { ContactSuggestion } from '../types';

export type SearchSuggestionKind = 'recent' | 'operator' | 'contact';

export interface SearchSuggestion {
  /** Stable row id: `<kind>:<applied query>`. */
  id: string;
  kind: SearchSuggestionKind;
  /** Main row label. */
  label: string;
  /** Secondary line: contact email, operator description, or nothing. */
  detail?: string;
  /** Full query string applied to the search box when the row is picked. */
  query: string;
}

/** Operators the shell views' filters actually honor (see header note). */
export const SEARCH_OPERATORS: ReadonlyArray<{
  name: 'from' | 'to';
  description: string;
}> = [
  { name: 'from', description: 'Messages from this sender' },
  { name: 'to', description: 'Messages to this recipient' },
];

export const MAX_SEARCH_SUGGESTIONS = 8;
const MAX_CONTACT_SUGGESTIONS = 5;
const MAX_RECENT_SUGGESTIONS = 5;

export interface SearchSuggestionSources {
  /** The user's own recent searches, most-recent first (lib/searchHistory). */
  recent?: string[];
  /** The user's own frequent contacts (hooks/useContactSuggestions). */
  contacts?: ContactSuggestion[];
}

function lower(value: string): string {
  return (value ?? '').toLowerCase();
}

/** Split a query into all tokens but the last, plus the last token itself. */
function splitLastToken(query: string): { head: string[]; last: string } {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { head: [], last: '' };
  return { head: tokens.slice(0, -1), last: tokens[tokens.length - 1] };
}

function joinQuery(head: string[], last: string): string {
  return [...head, last].filter(Boolean).join(' ');
}

/**
 * Rank contacts for a match fragment, Gmail-style: a name/address hit is a
 * stronger signal than a company hit, frequency breaks ties inside a tier,
 * and the caller's order survives inside a tier (stable sort). Mirrors
 * rankContactSuggestions in components/ContactAutocomplete.tsx, minus the
 * chip-dedupe concern (search has no chips).
 */
function rankContactsForFragment(
  contacts: ContactSuggestion[],
  fragment: string,
  limit: number,
): ContactSuggestion[] {
  const q = fragment.toLowerCase().trim();
  if (!q) return [];
  const isPrimaryHit = (c: ContactSuggestion) =>
    lower(c.email).includes(q) || lower(c.name ?? '').includes(q);
  return contacts
    .filter(
      (c) =>
        isPrimaryHit(c) ||
        lower(c.company ?? '').includes(q) ||
        (c.tags ?? []).some((t) => lower(t).includes(q)),
    )
    .sort(
      (a, b) =>
        Number(isPrimaryHit(b)) - Number(isPrimaryHit(a)) ||
        (b.frequency ?? 0) - (a.frequency ?? 0),
    )
    .slice(0, limit);
}

function contactSuggestion(
  head: string[],
  contact: ContactSuggestion,
  appliedLast: string,
): SearchSuggestion {
  const query = joinQuery(head, appliedLast);
  return {
    id: `contact:${query}`,
    kind: 'contact',
    label: contact.name || contact.email,
    detail: contact.name ? contact.email : undefined,
    query,
  };
}

/**
 * Build the typeahead rows for a query. Pure: no DOM, no network, no
 * storage — callers supply recent searches and contacts.
 *
 * - Empty query: the user's recent searches (Gmail shows recents on focus).
 * - Last token is `from:`/`to:` + fragment: contact completions for that
 *   operator (applied as `from:<email>` / `to:<email>`).
 * - Last token is a bare operator prefix ("fr", "to"): the operator itself
 *   (applied as `from:` / `to:` so the user can keep typing the value).
 *   Single characters are ignored — "f" is a word start, not an operator.
 * - Otherwise: contact matches for the last token (applied as the contact's
 *   email token) followed by recent searches containing the query.
 */
export function buildSearchSuggestions(
  query: string,
  sources: SearchSuggestionSources = {},
): SearchSuggestion[] {
  const recent = sources.recent ?? [];
  const contacts = sources.contacts ?? [];
  const trimmed = (query ?? '').trim();
  if (!trimmed) {
    return recent.slice(0, MAX_RECENT_SUGGESTIONS).map((past) => ({
      id: `recent:${past}`,
      kind: 'recent' as const,
      label: past,
      query: past,
    }));
  }

  const { head, last } = splitLastToken(trimmed);
  const out: SearchSuggestion[] = [];

  // Operator-value completion: the user already typed `from:` / `to:`.
  const operatorMatch = /^(from|to):(.*)$/.exec(last);
  if (operatorMatch) {
    const [, operator, fragment] = operatorMatch;
    const ranked = fragment
      ? rankContactsForFragment(contacts, fragment, MAX_CONTACT_SUGGESTIONS)
      : [...contacts]
          .sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
          .slice(0, MAX_CONTACT_SUGGESTIONS);
    for (const contact of ranked) {
      out.push(contactSuggestion(head, contact, `${operator}:${contact.email}`));
    }
    return out.slice(0, MAX_SEARCH_SUGGESTIONS);
  }

  // Operator-name completion: a bare prefix of an honored operator.
  if (!last.includes(':') && last.length >= 2) {
    const operatorHits = SEARCH_OPERATORS.filter((op) => op.name.startsWith(lower(last)));
    for (const op of operatorHits) {
      const applied = joinQuery(head, `${op.name}:`);
      out.push({
        id: `operator:${applied}`,
        kind: 'operator',
        label: `${op.name}:`,
        detail: op.description,
        query: applied,
      });
    }
    if (out.length > 0) return out.slice(0, MAX_SEARCH_SUGGESTIONS);
  }

  // Plain-token completion: contact matches, then matching recent searches.
  for (const contact of rankContactsForFragment(contacts, last, MAX_CONTACT_SUGGESTIONS)) {
    out.push(contactSuggestion(head, contact, contact.email));
  }
  const queryLower = lower(trimmed);
  for (const past of recent) {
    if (out.length >= MAX_SEARCH_SUGGESTIONS) break;
    if (lower(past).includes(queryLower) && lower(past) !== queryLower) {
      out.push({ id: `recent:${past}`, kind: 'recent', label: past, query: past });
    }
  }
  return out.slice(0, MAX_SEARCH_SUGGESTIONS);
}
