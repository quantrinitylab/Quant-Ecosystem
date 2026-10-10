'use client';

/**
 * PeopleList — the conversation list for the unified People view.
 *
 * One row per person (`PersonConversation` from `lib/peopleGrouping`):
 * IdentityAvatar seeded by the person's email, name, a one-line snippet via
 * `personSnippet()`, relative time, and an unread pill that shows the REAL
 * unread count — rendered only when it is above zero, never faked.
 *
 * Visual language: dark pure-black, no divider lines (hierarchy through
 * typography and spacing only, per the user-locked QuantMail rule), Mail orange
 * (`APP_THEMES.mail.accent`) for the unread/active accent. Desktop-first but
 * responsive down to a 390px phone viewport (flex + truncate, no fixed widths).
 */

import { useMemo, type CSSProperties } from 'react';
import { IdentityAvatar } from './IdentityAvatar';
import { Skeleton } from '@quant/shared-ui';
import { APP_THEMES } from '../lib/app-theme';
import { personSnippet, type PersonConversation } from '../lib/peopleGrouping';

export interface PeopleListProps {
  conversations: PersonConversation[];
  onSelect: (c: PersonConversation) => void;
  searchQuery: string;
  onSearchQuery: (q: string) => void;
  loading?: boolean;
}

const MAIL_ACCENT = APP_THEMES.mail.accent;

/**
 * Relative time for a row: "now" / "5m" / "2h" / "Yesterday" / "3 Oct".
 *
 * Calendar-day based, so "Yesterday" means yesterday rather than "24h ago".
 * Future timestamps (clock skew) read as "now" — the list never claims a
 * message arrived tomorrow.
 */
export function formatRelativeTime(at: Date): string {
  const time = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const diffMs = Date.now() - time;
  if (diffMs < 60_000) return 'now';
  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy.getTime();
  };
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(new Date(time))) / 86_400_000);
  if (dayDiff <= 0) {
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  }
  if (dayDiff === 1) return 'Yesterday';
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Case-insensitive filter over name, email, and every message's subject and
 * snippet. Tokens are ANDed — each word narrows the list — matching the
 * behaviour of `threadMatchesQuery` in `lib/threading`.
 */
function conversationMatchesQuery(c: PersonConversation, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [c.name, c.email, ...c.messages.flatMap((m) => [m.subject || '', m.snippet || ''])]
    .join(' ')
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function LoadingRows() {
  return (
    <div className="bg-black px-4 py-2" role="status" aria-label="Loading conversations">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3" aria-hidden="true">
          <Skeleton variant="circle" width="40px" height="40px" animate={false} />
          <div className="min-w-0 flex-1">
            <Skeleton variant="text" width="38%" className="mb-2" animate={false} />
            <Skeleton variant="text" width="78%" animate={false} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PeopleList({
  conversations,
  onSelect,
  searchQuery,
  onSearchQuery,
  loading = false,
}: PeopleListProps) {
  const visible = useMemo(
    () => conversations.filter((c) => conversationMatchesQuery(c, searchQuery)),
    [conversations, searchQuery],
  );

  if (loading) return <LoadingRows />;

  const trimmedQuery = searchQuery.trim();

  return (
    <div className="min-h-full bg-black">
      <div className="px-4 pb-1 pt-3">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchQuery(e.target.value)}
          placeholder="Search people and messages"
          aria-label="Search people and messages"
          className="w-full rounded-full bg-[#141518] px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:ring-1"
          style={{ '--tw-ring-color': `${MAIL_ACCENT}99` } as CSSProperties}
        />
      </div>

      {visible.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-sm text-zinc-400">
            {trimmedQuery ? `No matches for \u201C${trimmedQuery}\u201D` : 'No conversations yet'}
          </p>
        </div>
      ) : (
        <ul className="pb-4">
          {visible.map((c) => {
            const unread = c.unreadCount > 0;
            return (
              <li key={c.personKey}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  aria-label={unread ? `${c.name}, ${c.unreadCount} unread` : c.name}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]"
                >
                  <IdentityAvatar name={c.email} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={`truncate text-[15px] ${
                          unread ? 'font-semibold text-white' : 'font-normal text-zinc-300'
                        }`}
                      >
                        {c.name}
                      </span>
                      <span className="flex-none text-xs text-zinc-500">
                        {formatRelativeTime(c.lastActivityAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-sm text-zinc-400">{personSnippet(c)}</span>
                      {unread && (
                        <span
                          data-testid="unread-count"
                          className="flex-none rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 text-white"
                          style={{ backgroundColor: MAIL_ACCENT }}
                          aria-hidden="true"
                        >
                          {c.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
