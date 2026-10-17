import { Avatar } from '@quant/shared-ui';

import type { ContactActivitySuggestion } from '../../../types';

/**
 * "Suggested from your mail" — the Gmail Merge & Fix analogue on the contacts
 * page. Lists frequent correspondents who are NOT saved contacts yet, each
 * with a one-click Add.
 *
 * Presentational on purpose: the page owns the data (useContactActivitySuggestions)
 * and the add mutation, so this renders from props and stays testable with
 * renderToStaticMarkup. Renders nothing when there are no suggestions.
 */
export function formatSuggestionActivity(suggestion: ContactActivitySuggestion): string {
  const n = suggestion.messageCount;
  const times = n === 1 ? '1 message' : `${n} messages`;
  const directionText =
    suggestion.direction === 'inbound'
      ? `emailed you ${times}`
      : suggestion.direction === 'outbound'
        ? `you emailed ${times}`
        : `${times} back and forth`;
  const recency = formatSuggestionRecency(suggestion.lastMessageAt);
  return recency ? `${directionText} · ${recency}` : directionText;
}

/** Honest relative time ("3 days ago"), never a fake precision like "just now" for old mail. */
export function formatSuggestionRecency(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? 'last week' : `${weeks} weeks ago`;
  }
  const months = Math.floor(days / 30);
  return months === 1 ? 'last month' : `${months} months ago`;
}

export function SuggestedContacts({
  suggestions,
  addingEmail,
  onAdd,
}: {
  suggestions: ContactActivitySuggestion[];
  /** Lowercased email of the suggestion whose add is in flight, or null. */
  addingEmail: string | null;
  onAdd: (suggestion: ContactActivitySuggestion) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <section aria-label="Suggested contacts from your mail" className="rounded-2xl border border-[#2A2416] bg-[#0D0B06] p-3">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-lg bg-[var(--app-accent)]/15 text-[var(--app-accent)]"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </span>
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-white">Suggested from your mail</h3>
          <p className="truncate text-[11px] text-[var(--quant-muted-foreground)]">
            People you email with often who aren&apos;t in your contacts yet
          </p>
        </div>
      </div>

      <ul className="space-y-1">
        {suggestions.map((suggestion) => {
          const displayName = suggestion.name?.trim() || suggestion.email;
          const isAdding = addingEmail !== null && suggestion.email.toLowerCase() === addingEmail;
          return (
            <li
              key={suggestion.email.toLowerCase()}
              className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-2.5 py-2"
            >
              <Avatar name={displayName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[#EDEDED]">{displayName}</p>
                {suggestion.name?.trim() ? (
                  <p className="truncate text-[11px] text-[var(--quant-muted-foreground)]">{suggestion.email}</p>
                ) : null}
                <p className="truncate text-[11px] text-[var(--app-accent)]/90">
                  {formatSuggestionActivity(suggestion)}
                </p>
              </div>
              <button
                type="button"
                disabled={isAdding}
                onClick={() => onAdd(suggestion)}
                aria-label={`Add ${displayName} to contacts`}
                className="shrink-0 rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-xs font-bold text-black transition-all hover:bg-[var(--app-accent-hover)] disabled:opacity-50"
              >
                {isAdding ? 'Adding…' : 'Add'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
