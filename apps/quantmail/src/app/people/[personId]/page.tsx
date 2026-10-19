'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { useInbox } from '../../../hooks/useInbox';
import { useMailMutations } from '../../../hooks/useMailMutations';
import { useAuth } from '../../../providers/auth-provider';
import { groupEmailsByPerson, type PersonConversation } from '../../../lib/peopleGrouping';
import { inboxSelectTarget } from '../../../lib/inbox-nav';
import { PersonThread } from '../../../components/PersonThread';
import { encodeEmailDraft, type EmailEventDraft } from '../../../lib/emailToEvent';
import { ThreadComposer, mintSendClientId } from '../../../components/ThreadComposer';
import { SmartReplySuggestions } from '../../../components/SmartReplySuggestions';
import type { Email } from '../../../types';
import { useThreadViewKeyboard } from '../../../hooks/useThreadViewKeyboard';

/**
 * One person's full conversation: every message in both directions,
 * chronological. The composer is hidden for the `updates` world (newsletters
 * and receipts carry no reply expectation); everything else gets the thread
 * composer pinned at the bottom.
 *
 * An unknown `personId` is an honest "Conversation not found", never a
 * redirect to a guess.
 */
export default function PersonPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const currentUserEmail = user?.email ?? '';
  // P0 qm-draft-privacy-isolation (CODEX-REVIEW 6157628718): the
  // ThreadComposer draft namespace is keyed by the backend-verified
  // IMMUTABLE user id, never the mutable email.
  const currentUserId = user?.id ?? '';
  const mutations = useMailMutations();

  const rawPersonId = typeof params?.personId === 'string' ? params.personId : '';
  const personKey = useMemo(() => {
    try {
      return decodeURIComponent(rawPersonId);
    } catch {
      return rawPersonId;
    }
  }, [rawPersonId]);

  // Honor the lens carried through from the people list (?lens=spam): it
  // decides which folder dataset the detail page queries, and where "back"
  // returns to — dropping it strands the user on the wrong view.
  const searchParams = useSearchParams();
  const isSpamLens = searchParams?.get('lens') === 'spam';
  const backHref = isSpamLens ? '/?lens=spam' : '/people';

  const {
    data: emails,
    isLoading,
    isError,
    refetch,
    loadMore,
    hasMore,
    isLoadingMore,
  } = useInbox(
    // The spam lens lists people built from the SPAM folder query; a
    // spam-only person is absent from the default INBOX dataset, so honor
    // ?lens=spam here or their detail page lands on "Conversation not found".
    isSpamLens ? { folderType: 'SPAM' } : undefined,
  );

  /**
   * P1-C: optimistic sends. Each entry becomes a "Sending…" bubble appended
   * to the thread the moment the user hits send; it is replaced by the real
   * message once the refetch after a successful send confirms it.
   */
  const [pendingSends, setPendingSends] = useState<
    Array<{ clientId: string; bodyText: string; subject: string; sentAt: Date }>
  >([]);

  /**
   * QM fix qm-personthread-smart-replies: the smart-reply chip the user
   * tapped above the composer. `{ text, nonce }` — a fresh nonce per tap so
   * re-tapping the same chip still refills the box (ThreadComposer keys its
   * fill effect on the object's identity). Handed to ThreadComposer as
   * `suggestedReply`; cleared on person switch with the optimistic bubbles.
   */
  const [suggestedReply, setSuggestedReply] = useState<{ text: string; nonce: number } | null>(
    null,
  );

  // A different person is a different thread: drop stale optimistic bubbles
  // and any tapped smart-reply draft (a suggestion belongs to one
  // conversation).
  useEffect(() => {
    setPendingSends([]);
    setSuggestedReply(null);
  }, [personKey]);

  /**
   * Withdraw one optimistic bubble, identified by the send's clientId —
   * qm-optimistic-bubble-miscorrelation: identical rapid sends share
   * (text, subject), so match-by-(text, subject) could withdraw the WRONG
   * bubble (the flush-previous contract delivers an earlier queued send
   * while a later identical one is still queued, and the newest match was
   * the pending one). The clientId path is authoritative; the legacy
   * last-(text, subject) match only fires when the caller passes no clientId
   * (defensive — the composer always mints one).
   */
  const withdrawPendingSend = useCallback(
    (clientId: string | undefined, text?: string, subject?: string) => {
      setPendingSends((prev) => {
        if (clientId) {
          const idx = prev.findIndex((p) => p.clientId === clientId);
          if (idx >= 0) {
            return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
          }
          // Unknown id: nothing to withdraw — never fall through to a
          // fuzzy match, which could remove an unrelated bubble.
          return prev;
        }
        for (let i = prev.length - 1; i >= 0; i -= 1) {
          if (prev[i].bodyText === text && prev[i].subject === subject) {
            return [...prev.slice(0, i), ...prev.slice(i + 1)];
          }
        }
        return prev;
      });
    },
    [],
  );

  const conversation = useMemo(() => {
    if (!personKey) return undefined;
    return groupEmailsByPerson(emails ?? [], currentUserEmail).find(
      (candidate) => candidate.personKey === personKey,
    );
  }, [emails, currentUserEmail, personKey]);

  /**
   * QM fix qm-person-thread-page-load: the detail page used to see only the
   * newest-50 first-page window, so a person whose mail is all older than
   * that rendered "Conversation not found" even though they exist — and now
   * that PeopleHome pages, tapping an older person's row lands here with the
   * person beyond the loaded window. Hunt the corpus while they are absent:
   * one keyset slice at a time, only while the pager says more pages remain
   * (loadMore no-ops once the cursor is null, so the hunt always ends), and
   * never concurrently — the hook's own guard serializes it. When the hunt
   * exhausts the corpus, "not found" below is honest because they genuinely
   * are not there.
   *
   * Anti-loop guard: loadMore swallows page failures internally (toast +
   * cursor untouched), so a persistently failing page would otherwise keep
   * the hunt firing forever — a toast-spam + request loop. If a loadMore
   * cycle completes without the loaded corpus growing at all, the tail is
   * stuck: stop the hunt and say so honestly instead of looping.
   */
  const [olderSearchStuck, setOlderSearchStuck] = useState(false);
  const huntLoadedLenRef = useRef<number | null>(null);
  const huntWasLoadingMoreRef = useRef(false);

  // A different person is a fresh hunt: clear the stuck flag and the
  // progress watermark before the hunt effect below runs (declaration order
  // is load-bearing: this effect must run first on a personKey change).
  useEffect(() => {
    huntLoadedLenRef.current = null;
    setOlderSearchStuck(false);
  }, [personKey]);

  useEffect(() => {
    const huntCycleCompleted = huntWasLoadingMoreRef.current;
    huntWasLoadingMoreRef.current = isLoadingMore;
    if (isLoading || isError || isLoadingMore || !personKey) return;
    if (conversation) return;
    if (!hasMore || olderSearchStuck) return;
    const loadedLen = emails?.length ?? 0;
    if (huntCycleCompleted) {
      // A hunt-issued loadMore cycle just finished. loadMore swallows page
      // failures internally (toast + cursor untouched), so compare progress
      // only here — comparing on any other re-render would false-positive on
      // same-length realtime patches. If the corpus did not grow, the pager
      // is stuck: stop the hunt and say so honestly instead of loop-spinning
      // a toast + request cycle forever.
      if (huntLoadedLenRef.current !== null && huntLoadedLenRef.current === loadedLen) {
        setOlderSearchStuck(true);
        return;
      }
    }
    huntLoadedLenRef.current = loadedLen;
    void loadMore();
  }, [
    isLoading,
    isError,
    isLoadingMore,
    personKey,
    conversation,
    hasMore,
    olderSearchStuck,
    emails,
    loadMore,
  ]);

  // While the hunt is running (or about to start) the person is merely "not
  // in the loaded window yet" — never say "not found" until the corpus is
  // genuinely exhausted.
  const isSearchingOlderMail =
    !conversation &&
    !isLoading &&
    !isError &&
    !olderSearchStuck &&
    personKey !== '' &&
    (hasMore || isLoadingMore);

  const conversationWithPending: PersonConversation | undefined = useMemo(() => {
    if (!conversation || pendingSends.length === 0) return conversation;
    const pendingEmails = pendingSends.map(
      (p) =>
        ({
          id: `pending-${p.clientId}`,
          createdAt: p.sentAt,
          updatedAt: p.sentAt,
          threadId: conversation.lastMessage.threadId,
          userId: '',
          from: { email: currentUserEmail, name: '' },
          to: [{ email: conversation.email }],
          cc: [],
          bcc: [],
          subject: p.subject,
          bodyText: p.bodyText,
          bodyHtml: '',
          snippet: p.bodyText.slice(0, 80),
          priority: 'normal',
          category: 'primary',
          status: 'sending',
          isRead: true,
          isStarred: false,
          isArchived: false,
          isDraft: false,
          labels: [],
          attachments: [],
          receivedAt: p.sentAt,
          isSent: true,
          references: [],
          headers: {},
          // Marker for the "Sending…" state; not part of the Email contract.
          pendingSend: true,
        }) as Email,
    );
    const messages = [...conversation.messages, ...pendingEmails];
    return {
      ...conversation,
      messages,
      lastMessage: pendingEmails[pendingEmails.length - 1],
      lastActivityAt: new Date(),
    };
  }, [conversation, pendingSends, currentUserEmail]);

  const messageIds = useMemo(
    () => (conversation ? conversation.messages.map((message) => message.id) : []),
    [conversation],
  );

  /*
   * CUST-P1-4: thread-view keyboard shortcuts for the people conversation
   * view. Same contract as /thread/[id]: the keys act on the open person
   * conversation instead of being silent no-ops.
   */
  useThreadViewKeyboard({
    onArchive: useCallback(() => {
      if (messageIds.length === 0) return;
      void mutations.archive(messageIds);
      router.push(backHref);
    }, [messageIds, mutations, router, backHref]),
    onMarkUnread: useCallback(() => {
      if (messageIds.length === 0) return;
      void mutations.markUnread(messageIds);
    }, [messageIds, mutations]),
    onToggleStar: useCallback(() => {
      if (messageIds.length === 0) return;
      void mutations.toggleStar(messageIds);
    }, [messageIds, mutations]),
    onForward: useCallback(() => {
      const lastId = messageIds[messageIds.length - 1];
      if (!lastId) return;
      router.push(`/compose?forward=${encodeURIComponent(lastId)}`);
    }, [messageIds, router]),
    onFocusReply: useCallback(() => {
      // The updates world renders no composer; focusing is a no-op there.
      document.getElementById('people-reply-input')?.focus();
    }, []),
    onSelect: useCallback(() => {
      // Select by thread id so the inbox pre-selects the right row; fall back
      // to the last message id if the thread id is absent. view=inbox is
      // load-bearing: RootPage renders PeopleHome without it, and ?selected=
      // is only consumed inside InboxPageContent. The spam lens is carried
      // along: the inbox pre-selects only rows in the current lens corpus, so
      // without it `x` from a ?lens=spam thread lands in the inbox with nothing
      // selected and the thread context silently dropped (same lens-loss class
      // as the fixed spam-lens dead-end #917).
      const lastMessage = conversation?.messages[conversation.messages.length - 1];
      const selectId = lastMessage?.threadId || lastMessage?.id;
      if (!selectId) return;
      router.push(inboxSelectTarget(selectId, isSpamLens ? 'spam' : undefined));
    }, [conversation, router, isSpamLens]),
    onClose: useCallback(() => {
      router.push(backHref);
    }, [router, backHref]),
  });

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell" aria-label="Conversation">
      <div className="flex h-full flex-col bg-black">
        <header className="flex items-center gap-3 px-4 pt-4 sm:px-6">
          <Link
            href={backHref}
            aria-label="Back to people"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-[#9BA0AA] transition-colors hover:bg-[var(--quant-surface-elevated)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="min-w-0 truncate text-lg font-bold text-white">
            {conversation ? conversation.name : 'Conversation'}
          </h1>
        </header>

        <div className="mt-2 flex flex-1 flex-col overflow-hidden">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center" role="status" aria-label="Loading conversation">
              <div className="size-8 animate-spin rounded-full border-2 border-[#2A2D35] border-t-[#F97316]" />
            </div>
          ) : isError || olderSearchStuck ? (
            /* P1-B: a failed fetch is not "not found" — say so honestly and
               offer a retry, mirroring PeopleHome. The stuck-hunt case (the
               older-mail pager stopped making progress) shares this branch:
               the conversation may genuinely exist further back, but the
               pages would not load — retry re-runs the hunt from the top. */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-semibold text-white">
                {olderSearchStuck
                  ? "Couldn't load older messages"
                  : "Couldn't load this conversation"}
              </p>
              <p className="text-xs text-[#9BA0AA]">
                {olderSearchStuck
                  ? 'This conversation may be further back, but loading more mail keeps failing. Check your connection and try again — nothing was lost.'
                  : 'Check your connection and try again — nothing was lost.'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setOlderSearchStuck(false);
                  void refetch();
                }}
                className="mt-1 inline-flex min-h-[44px] items-center rounded-xl bg-[#F97316] px-5 text-sm font-bold text-black transition-colors hover:bg-[#FB8A3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
              >
                Retry
              </button>
            </div>
          ) : isSearchingOlderMail ? (
            /* QM fix qm-person-thread-page-load: the person is not in the
               loaded window yet, but pages remain — the hunt effect above is
               paging the corpus for them. An honest "looking further back",
               never a premature "not found". */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center" role="status" aria-label="Searching older messages">
              <div className="size-8 animate-spin rounded-full border-2 border-[#2A2D35] border-t-[#F97316]" />
              <p className="text-sm font-semibold text-white">
                Looking through your older messages…
              </p>
              <p className="text-xs text-[#9BA0AA]">
                This conversation isn&apos;t in the newest mail yet — checking further back.
              </p>
            </div>
          ) : !conversation ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-semibold text-white">Conversation not found</p>
              <p className="text-xs text-[#9BA0AA]">
                {isSpamLens
                  ? "This person isn't in your spam conversations — their messages may have been deleted or moved out of spam."
                  : "This person isn't in your conversations — they may have been archived or deleted."}
              </p>
              <Link
                href={backHref}
                className="mt-1 inline-flex min-h-[44px] items-center rounded-xl bg-[#F97316] px-5 text-sm font-bold text-black transition-colors hover:bg-[#FB8A3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
              >
                Back to people
              </Link>
            </div>
          ) : (
            <PersonThread
              conversation={conversationWithPending ?? conversation}
              currentUserEmail={currentUserEmail}
              renderComposer={
                conversation.world === 'updates' ? undefined : (
                  <>
                    {/*
                      QM fix qm-personthread-smart-replies: Gmail shows Smart
                      Reply chips on the mobile thread; the sibling
                      ConversationalThreadView already had them, but the People
                      person thread — the default mobile surface — rendered
                      none. Same real backend (GET /emails/:id/reply-
                      suggestions via apiClient.aiSuggestReplies) for the
                      thread's latest message; a chip tap prefills the
                      composer below. No canned fallbacks: when the backend
                      cannot generate, SmartReplySuggestions renders nothing.
                    */}
                    <SmartReplySuggestions
                      emailId={conversation.lastMessage.id}
                      onSelectReply={(text) =>
                        setSuggestedReply({ text, nonce: Date.now() })
                      }
                    />
                    <ThreadComposer
                      conversation={conversation}
                      currentUserId={currentUserId}
                      suggestedReply={suggestedReply}
                    onSendStart={(text, subject, clientId) => {
                      // qm-optimistic-bubble-miscorrelation: the composer
                      // mints the correlation id — key the bubble by IT, so
                      // the four send callbacks withdraw exactly this send's
                      // bubble even when rapid sends share text+subject.
                      const bubbleId = clientId || mintSendClientId();
                      setPendingSends((prev) => [
                        ...prev,
                        { clientId: bubbleId, bodyText: text, subject, sentAt: new Date() },
                      ]);
                    }}
                    onSent={(text, subject, clientId) => {
                      // The send is CONFIRMED (real send resolved after the
                      // undo window): refetch, then swap only this send's
                      // optimistic bubble for the confirmed message — a
                      // second send may still be inside its own recall window
                      // and its bubble must stay.
                      void refetch().finally(() => withdrawPendingSend(clientId, text, subject));
                    }}
                    onSendError={(text, subject, clientId) =>
                      withdrawPendingSend(clientId, text, subject)
                    }
                    onSendUndo={(text, subject, clientId) =>
                      withdrawPendingSend(clientId, text, subject)
                    }
                    />
                  </>
                )
              }
              // fix/qm-calendar-nlp-quickadd: one-key event-from-email — the
              // thread's draft deep-links to /calendar, which opens its event
              // sheet prefilled (attendees from the thread, time parsed or
              // honestly marked suggested).
              onEventDraft={(draft: EmailEventDraft) => {
                router.push(`/calendar?emailDraft=${encodeEmailDraft(draft)}`);
              }}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
