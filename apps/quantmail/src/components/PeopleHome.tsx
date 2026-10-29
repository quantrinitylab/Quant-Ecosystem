'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from './AppShell';
import { AppSidebar } from './AppSidebar';
import { useInbox } from '../hooks/useInbox';
import { useMailMutations } from '../hooks/useMailMutations';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { usePeopleKeyboard } from '../hooks/usePeopleKeyboard';
import { useAuth } from '../providers/auth-provider';
import {
  groupEmailsByPerson,
  type ConversationWorld,
  type PersonConversation,
} from '../lib/peopleGrouping';
import { PeopleWorldTabs } from './PeopleWorldTabs';
import { PeopleList, conversationMatchesQuery } from './PeopleList';
import { PeopleDueReminders } from './PeopleDueReminders';
import { MailboxViewToggle } from './MailboxViewToggle';

/**
 * The People home: every conversation grouped by person instead of by
 * folder. Shared between the `/people` route and the `/` root page, which
 * renders it as the default view.
 *
 * Data comes from the real inbox (`useInbox`) and is folded through
 * `groupEmailsByPerson` — the contract owned by the grouping agent. No
 * mock or seeded conversations here: an empty mailbox is an honest empty
 * state, not a demo row.
 *
 * The home pages the inbox corpus through useInbox's keyset-cursor pager
 * (`loadMore` / `hasMore`): grouping must see the whole corpus, not just
 * the newest-50 first-page window, or people whose mail is all older than
 * 50 messages would never get a row.
 *
 * Lives in components/ (not in an app/ route file) because Next.js App
 * Router route files may only export the default page component plus the
 * documented route-segment config exports — a shared named export like
 * this one breaks `next build` type validation.
 */
export function PeopleHome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const currentUserEmail = user?.email ?? '';
  const [world, setWorld] = useState<ConversationWorld>('log');

  /**
   * fix/qm-peopleworldtabs-aria: the world tabs' single panel. One panel
   * serves all three tabs — they swap one list in place — so it is the
   * scroll container, the element that always exists (loading, error and
   * empty states all come and go inside it). Its label follows the active
   * tab, mirroring the inbox lens tablist in app/page.tsx. Previously the
   * tabs carried aria-controls="world-panel-<key>" with no such element
   * anywhere, so assistive tech announced controls pointing at nothing.
   */
  const worldPanelId = 'people-world-panel';

  // A `?lens=spam` URL without `?view=inbox` (e.g. the /spam shim) renders
  // this People view (not the classic inbox). Honor the lens here: spam shows the people
  // with spam threads, backed by the real SPAM folder query. Any other lens
  // (or none) shows the regular inbox people.
  const isSpamLens = searchParams?.get('lens') === 'spam';
  const {
    data: emails,
    isLoading,
    isError,
    refetch,
    loadMore,
    hasMore,
    isLoadingMore,
  } = useInbox(isSpamLens ? { folderType: 'SPAM' } : undefined);
  const mutations = useMailMutations();
  const [searchQuery, setSearchQuery] = useState('');

  /**
   * fix/qm-people-pull-to-refresh-r5 — the People home is the default mobile
   * home but had no pull gesture: the shared hook was wired only into the
   * classic inbox and classic thread view. This wires the SAME real refetch
   * the Retry button uses, so a pull refreshes the real inbox corpus. The
   * indicator renders above every branch inside the scroll container, so
   * the error state keeps its Retry button AND gains the gesture — pull
   * works even when the list failed to load.
   */
  const {
    listProps: ptrListProps,
    pullDistance: ptrPullDistance,
    isRefreshing: ptrIsRefreshing,
  } = usePullToRefresh({ onRefresh: () => refetch() });

  const conversations = useMemo<PersonConversation[]>(
    () => groupEmailsByPerson(emails ?? [], currentUserEmail),
    [emails, currentUserEmail],
  );

  const counts = useMemo<Record<ConversationWorld, number>>(() => {
    const next: Record<ConversationWorld, number> = { log: 0, groups: 0, updates: 0 };
    for (const conversation of conversations) {
      next[conversation.world] += 1;
    }
    return next;
  }, [conversations]);

  const visible = useMemo(
    () => conversations.filter((conversation) => conversation.world === world),
    [conversations, world],
  );

  const handleSelect = (conversation: PersonConversation) => {
    const path = `/people/${encodeURIComponent(conversation.personKey)}`;
    // Carry the lens through the route: a spam-lens person only exists in
    // the SPAM folder query, so the detail page must know to use it — a
    // bare /people/<id> would render "Conversation not found" for them.
    router.push(isSpamLens ? `${path}?lens=spam` : path);
  };

  /**
   * The rows the keyboard acts on: world-filtered AND search-filtered, in the
   * order rendered. Handing the hook the same array the list renders (rather
   * than the unfiltered `visible`) is what keeps `j` and `e` addressing the
   * same row — the mismatch the old inbox hook was rebuilt to kill.
   */
  const keyboardRows = useMemo(
    () => visible.filter((conversation) => conversationMatchesQuery(conversation, searchQuery)),
    [visible, searchQuery],
  );

  // Scroll the list container so the `j`/`k` cursor never leaves the
  // viewport. Rows carry `data-person-key`; the personKey is escaped for the
  // attribute selector rather than trusting it to be selector-safe.
  const listScrollRef = useRef<HTMLDivElement>(null);
  const keyboardRowsRef = useRef(keyboardRows);
  useEffect(() => {
    keyboardRowsRef.current = keyboardRows;
  });
  const scrollToIndex = useCallback((index: number) => {
    const row = keyboardRowsRef.current[index];
    const container = listScrollRef.current;
    if (!row || !container) return;
    const escaped = row.personKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const el = container.querySelector(`[data-person-key="${escaped}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  /**
   * Superhuman-style keyboard triage on the People home (j/k move, Enter
   * open, e done, s star, u read/unread, # trash, r reply, f forward,
   * c compose, z undo, / search). Previously these keys were bound only on
   * the legacy `?view=inbox` surface; the default People home had nothing.
   */
  const { focusedId, focusRow } = usePeopleKeyboard({
    rows: keyboardRows,
    onOpen: handleSelect,
    mutations,
    scrollToIndex,
    onCompose: () => router.push('/compose'),
  });

  /**
   * The `j`/`k` cursor, said out loud. Rows are not tab stops (navigation
   * here is the keys, not Tab), so DOM focus never moves and a screen reader
   * would otherwise hear nothing when the cursor advances. `aria-current` on
   * the focused row (see PeopleList) makes it identifiable; this announces
   * the move. Keyed on personKey, silent on mount.
   */
  const [cursorAnnouncement, setCursorAnnouncement] = useState('');
  const announcedCursorRef = useRef<string | null>(null);
  useEffect(() => {
    if (focusedId === announcedCursorRef.current) return;
    announcedCursorRef.current = focusedId;
    if (focusedId === null) {
      setCursorAnnouncement('');
      return;
    }
    const index = keyboardRows.findIndex((c) => c.personKey === focusedId);
    if (index === -1) return;
    const conversation = keyboardRows[index];
    const tail = [`${index + 1} of ${keyboardRows.length}`];
    if (conversation.unreadCount > 0) tail.unshift(`${conversation.unreadCount} unread`);
    setCursorAnnouncement(`${conversation.name}. ${tail.join(', ')}`);
  }, [focusedId, keyboardRows]);

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell" aria-label="QuantMail people">
      <div className="flex h-full flex-col bg-black">
        {/*
          Mailbox view switcher (People | Inbox), in-flow at the top-right of
          the header — deliberately NOT a fixed overlay: the 2026-10-11 P1 was
          the toggle pill sitting on top of the inbox hero's "New chat" button
          and intercepting its clicks/taps.
        */}
        <header className="px-4 pb-2 pt-4 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-white">{isSpamLens ? 'Spam' : 'People'}</h1>
              <p className="mt-0.5 text-xs text-[#9BA0AA]">
                {isSpamLens
                  ? 'People with messages flagged as spam — review or rescue them.'
                  : 'Every person you talk to, in one place — your whole conversation with each of them.'}
              </p>
            </div>
            <MailboxViewToggle isInbox={false} />
          </div>
        </header>

        <div className="px-4 sm:px-6">
          <PeopleWorldTabs world={world} onChange={setWorld} counts={counts} panelId={worldPanelId} />
        </div>

        <div
          ref={listScrollRef}
          {...ptrListProps}
          data-testid="people-scroll"
          role="tabpanel"
          id={worldPanelId}
          aria-labelledby={`world-tab-${world}`}
          tabIndex={0}
          className="mt-2 flex-1 overflow-y-auto px-4 pb-6 sm:px-6"
        >
          <p className="sr-only" role="status" aria-live="polite">
            {cursorAnnouncement}
          </p>
          {/*
            Pull-to-refresh indicator (fix/qm-people-pull-to-refresh-r5):
            same spinner language as the classic thread view's pull indicator
            — Mail-orange ring on pure black, no divider lines. Travels with
            the finger (height = pull distance), locks at 44px while the real
            refetch settles.
          */}
          {(ptrPullDistance > 0 || ptrIsRefreshing) && (
            <div
              data-testid="people-ptr-indicator"
              className="flex items-center justify-center overflow-hidden"
              style={{ height: ptrIsRefreshing ? 44 : ptrPullDistance }}
              aria-hidden="true"
            >
              <span
                className={`size-5 rounded-full border-2 border-[#F97316]/30 border-t-[#F97316] ${
                  ptrIsRefreshing ? 'animate-spin' : ''
                }`}
              />
            </div>
          )}
          {isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <p className="text-sm font-semibold text-white">Couldn&apos;t load your conversations</p>
              <p className="text-xs text-[#9BA0AA]">
                Check your connection and try again — nothing was lost.
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="min-h-[44px] rounded-xl bg-[#F97316] px-5 text-sm font-bold text-black transition-colors hover:bg-[#FB8A3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
              >
                Retry
              </button>
            </div>
          ) : conversations.length === 0 && !isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
              <p className="text-sm font-semibold text-white">No conversations yet</p>
              <p className="mt-1 text-xs text-[#9BA0AA]">
                Send someone a message and they will appear here.
              </p>
            </div>
          ) : (
            <>
              {/*
                fix/qm-followup-resurface (P1 inbox-people): due-date
                DELIVERY. Due follow-up reminders resurface here, at the top
                of the scrollable home, Gmail-nudge/Superhuman style — the
                persistence half landed earlier, this is the half that
                actually nudges the user. Matching runs against ALL
                conversations (every world), not just the active tab's, so
                a due reminder in Groups still surfaces. Inside the scroll
                container so it scrolls with the list instead of pinning.
              */}
              {!isError && (
                <PeopleDueReminders conversations={conversations} onSelect={handleSelect} />
              )}
              <PeopleList
                conversations={keyboardRows}
                onSelect={handleSelect}
                searchQuery={searchQuery}
                onSearchQuery={setSearchQuery}
                loading={isLoading}
                onLoadMore={() => void loadMore()}
                hasMore={hasMore}
                loadingMore={isLoadingMore}
                focusedPersonKey={focusedId}
                onRowFocus={focusRow}
              />
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
