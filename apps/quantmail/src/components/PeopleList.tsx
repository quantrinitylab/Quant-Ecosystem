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
import { Button, Skeleton } from '@quant/shared-ui';
import { APP_THEMES } from '../lib/app-theme';
import { personSnippet, type PersonConversation } from '../lib/peopleGrouping';

export interface PeopleListProps {
  conversations: PersonConversation[];
  onSelect: (c: PersonConversation) => void;
  searchQuery: string;
  onSearchQuery: (q: string) => void;
  loading?: boolean;
  /**
   * Pagination tail (P1 inbox-people): the home pages the inbox corpus
   * through useInbox's keyset-cursor pager, so every person gets a row —
   * not just the ones in the newest 50 messages. When `hasMore` is true the
   * list renders a "Load more people" tail that appends the next server
   * slice; with a search query active and no local match, the empty state
   * honestly says the older mail isn't loaded yet instead of claiming
   * "No matches". Omit `onLoadMore`/`hasMore` and the list is a plain
   * single-window render.
   */
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
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
  const date = at instanceof Date ? at : new Date(at);
  // Guard the same defect family as formatMessageTime (PersonThread) and
  // dayKey/formatDayDivider (ConversationalThreadView): an unparseable
  // lastActivityAt must degrade to an empty fallback — never the literal
  // "Invalid Date" in the People-list row time slot.
  if (Number.isNaN(date.getTime())) return '';
  const time = date.getTime();
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
  onLoadMore,
  hasMore = false,
  loadingMore = false,
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
        trimmedQuery ? (
          // The search box filters the LOADED window only. Claiming
          // "No matches" while older pages are still on the server is a
          // lie — say the corpus isn't fully loaded and offer to page it.
          hasMore && onLoadMore ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-zinc-400">No matches in the loaded messages</p>
              <p className="mt-1 text-xs text-zinc-500">
                Older mail isn&apos;t loaded yet — it might contain a match.
              </p>
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load older messages to keep searching'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-zinc-400">
                {`No matches for \u201C${trimmedQuery}\u201D`}
              </p>
            </div>
          )
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-zinc-400">No conversations yet</p>
          </div>
        )
      ) : (
        <>
          <ul className="pb-4">
          {visible.map((c) => {
            const unread = c.unreadCount > 0;
            return (
              <li key={c.personKey}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  aria-label={unread ? `${c.name}, ${c.unreadCount} unread` : c.name}
                  className="people-row flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]"
                >
                  <IdentityAvatar name={c.email} size="md" className="people-row-avatar" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={`flex min-w-0 items-center gap-1.5 truncate text-[15px] ${
                          unread ? 'font-semibold text-white' : 'font-normal text-zinc-300'
                        }`}
                      >
                        <span dir="auto" className="truncate">
                          {c.name}
                        </span>
                        {/* P1-E: this row also contains group messages. */}
                        {c.hasGroupMessages && (
                          <svg
                            className="size-3.5 flex-none text-zinc-500"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-label="Includes group messages"
                            role="img"
                          >
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-none text-xs text-zinc-500">
                        {formatRelativeTime(c.lastActivityAt)}
                      </span>
                    </span>
                    <span className="people-row-snippet mt-0.5 flex items-center justify-between gap-2">
                      <span dir="auto" className="people-row-snippet-text truncate text-sm text-zinc-400">
                        {personSnippet(c)}
                      </span>
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
          {hasMore && onLoadMore && (
            <div className="flex justify-center px-4 pb-6">
              <Button variant="secondary" onClick={onLoadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more people'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
