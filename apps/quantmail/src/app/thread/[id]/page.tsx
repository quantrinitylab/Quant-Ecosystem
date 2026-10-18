'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { ConversationalThreadView, type ThreadLeaveGuard } from '../../../components/ConversationalThreadView';
import { useMailMutations } from '../../../hooks/useMailMutations';
import { useEdgeSwipeBack } from '../../../hooks/useEdgeSwipeBack';
import { useThreadViewKeyboard } from '../../../hooks/useThreadViewKeyboard';
import { inboxSelectTarget, lensFromReturnTo } from '../../../lib/inbox-nav';

function validInternalReturnTo(value: string | null): string | null {
  if (!value) return null;
  const candidate = value.trim();
  if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.includes('\\'))
    return null;
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quantmail.in';
    const parsed = new URL(candidate, origin);
    if (parsed.origin !== origin) return null;
    if (parsed.pathname.startsWith('/thread/')) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mutations = useMailMutations();
  const rawThreadId = (params?.id as string) || '';
  const threadId = rawThreadId === 'null' || rawThreadId === 'undefined' ? '' : rawThreadId;
  const returnTo = useMemo(
    () => validInternalReturnTo(searchParams.get('returnTo')),
    [searchParams],
  );

  /*
   * Thread-lens-select P1: the source lens for the `x` (select) shortcut.
   * returnTo encodes the source path — including ?lens= when the thread was
   * opened from a lens view — but inboxSelectTarget(threadId) with no lens
   * dropped it, landing `x` from /thread/<id>?returnTo=...&lens=spam in the
   * default all-lens inbox where the spam-only threadId has no row and the
   * pre-select silently no-ops. Parsing the lens back out of returnTo keeps
   * the row pre-selected in the right corpus, the same way backHref/archive
   * honor returnTo. Absent/other lenses fall back to the bare default target
   * (unchanged behavior).
   */
  const sourceLens = useMemo(() => lensFromReturnTo(returnTo), [returnTo]);

  /*
   * BB-P2-6: the header back button names the real destination. The archived
   * view is URL-addressable now (`archived=1`), so a thread opened from it
   * says "Back to archived" instead of always claiming the inbox.
   */
  const backLabel = useMemo(() => {
    if (!returnTo) return 'Back to inbox';
    try {
      const params = new URL(returnTo, 'https://quantmail.in').searchParams;
      return params.get('archived') === '1' ? 'Back to archived' : 'Back to inbox';
    } catch {
      return 'Back to inbox';
    }
  }, [returnTo]);

  /*
   * The view's unsaved-changes guard: typed-but-unsent quick-reply text must
   * never be silently vaporised by a leave. Mirrors /compose's discard guard
   * (L773/qm-compose-edge-swipe-discard) — the branded confirm asks before
   * any navigation away from the thread proceeds.
   */
  const leaveGuardRef = useRef<ThreadLeaveGuard | null>(null);

  const doLeaveThread = useCallback(
    (replace = false) => {
      if (returnTo) {
        if (replace) router.replace(returnTo);
        else router.push(returnTo);
        return;
      }
      if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
        return;
      }
      router.replace('/');
    },
    [returnTo, router],
  );

  const guardedNavigate = useCallback((navigate: () => void) => {
    const guard = leaveGuardRef.current;
    if (!guard) {
      navigate();
      return;
    }
    void guard.confirmLeaveIfNeeded().then((ok) => {
      if (ok) navigate();
    });
  }, []);

  const leaveThread = useCallback(
    (replace = false) => {
      guardedNavigate(() => doLeaveThread(replace));
    },
    [doLeaveThread, guardedNavigate],
  );

  /*
   * If threadId is missing, redirect to returnTo or inbox root.
   */
  useEffect(() => {
    if (!threadId) router.replace(returnTo || '/');
  }, [returnTo, router, threadId]);

  // Left-edge swipe → same as the back affordance: leave the thread.
  useEdgeSwipeBack(() => leaveThread(false), { disabled: !threadId });

  /*
   * CUST-P1-4: thread-view keyboard shortcuts. The inbox binds `x u s e f`
   * in the `inbox` scope only; without these thread-scoped counterparts the
   * keys were silent no-ops here. `r` focuses the reply box with an explicit
   * preventDefault so the typed `r` never leaks into the body; Esc closes
   * the thread (it does not fire while typing — the engine skips bindings
   * when focus is in an input, so the inline quoted-message Escape keeps
   * working).
   */
  useThreadViewKeyboard({
    onArchive: useCallback(() => {
      if (!threadId) return;
      void mutations.archive([threadId]);
      leaveThread(true);
    }, [threadId, mutations, leaveThread]),
    onMarkUnread: useCallback(() => {
      if (!threadId) return;
      void mutations.markUnread([threadId]);
    }, [threadId, mutations]),
    onToggleStar: useCallback(() => {
      if (!threadId) return;
      void mutations.toggleStar([threadId]);
    }, [threadId, mutations]),
    onForward: useCallback(() => {
      if (!threadId) return;
      /*
       * Guarded like every other thread exit: `f` with typed-but-unsent
       * quick-reply text shows the discard confirm instead of silently
       * vaporising the draft (same silent-loss class as the edge-swipe /
       * back-button defect fixed by the leave guard).
       */
      guardedNavigate(() => router.push(`/compose?forward=${encodeURIComponent(threadId)}`));
    }, [threadId, router, guardedNavigate]),
    onFocusReply: useCallback(() => {
      document.getElementById('chatbot-reply-input')?.focus();
    }, []),
    onSelect: useCallback(() => {
      if (!threadId) return;
      // view=inbox is load-bearing: RootPage renders PeopleHome without it,
      // and ?selected= is only consumed inside InboxPageContent.
      // Guarded like every other thread exit: `x` with typed-but-unsent
      // quick-reply text shows the discard confirm instead of silently
      // vaporising the draft.
      // The source lens is threaded back in: without it `x` from a
      // ?lens=spam thread landed in the all-lens inbox with nothing selected
      // (thread-lens-select P1 — same class as spam-lens dead-end #917).
      guardedNavigate(() => router.push(inboxSelectTarget(threadId, sourceLens)));
    }, [threadId, router, guardedNavigate, sourceLens]),
    onClose: useCallback(() => {
      leaveThread(false);
    }, [leaveThread]),
  });

  if (!threadId) {
    return (
      <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
        <div className="workspace-page thread-workspace flex flex-col h-full bg-black">
          <div className="flex-1 flex items-center justify-center p-6 text-[var(--quant-muted-foreground)]" role="status">
            Returning to inbox…
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page thread-workspace flex flex-col h-full bg-black">
        <ConversationalThreadView
          threadId={threadId}
          onClose={() => leaveThread(false)}
          backLabel={backLabel}
          /*
           * These mutations are optimistic and queued through the outbox, so they
           * survive navigation. Navigating to returnTo preserves the user's lens
           * (?lens=groups, ?lens=contacts, etc.) instead of dumping them to All.
           */
          onArchive={(ids) => {
            void mutations.archive(ids);
            leaveThread(true);
          }}
          onUnarchive={(ids) => {
            void mutations.unarchive(ids);
            leaveThread(true);
          }}
          onDelete={(ids) => {
            void mutations.trash(ids);
            leaveThread(true);
          }}
          variant="full"
          className="h-full flex-1"
          /*
           * Horizontal swipe on the stream moves between conversations. Keep
           * the returnTo chain so swiping through threads still lands back in
           * the same inbox lens instead of the default view. Guarded like
           * every other thread exit: moving to the next conversation with
           * typed-but-unsent reply text used to vaporise it silently.
           */
          onNavigateToThread={(targetId) => {
            guardedNavigate(() => {
              const suffix = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
              router.push(`/thread/${encodeURIComponent(targetId)}${suffix}`);
            });
          }}
          leaveGuardRef={leaveGuardRef}
        />
      </div>
    </AppShell>
  );
}
