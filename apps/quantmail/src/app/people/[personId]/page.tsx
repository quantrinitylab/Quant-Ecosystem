'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { useInbox } from '../../../hooks/useInbox';
import { useMailMutations } from '../../../hooks/useMailMutations';
import { useAuth } from '../../../providers/auth-provider';
import { groupEmailsByPerson, type PersonConversation } from '../../../lib/peopleGrouping';
import { PersonThread } from '../../../components/PersonThread';
import { ThreadComposer } from '../../../components/ThreadComposer';
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
  const mutations = useMailMutations();

  const rawPersonId = typeof params?.personId === 'string' ? params.personId : '';
  const personKey = useMemo(() => {
    try {
      return decodeURIComponent(rawPersonId);
    } catch {
      return rawPersonId;
    }
  }, [rawPersonId]);

  const { data: emails, isLoading, isError, refetch } = useInbox();

  /**
   * P1-C: optimistic sends. Each entry becomes a "Sending…" bubble appended
   * to the thread the moment the user hits send; it is replaced by the real
   * message once the refetch after a successful send confirms it.
   */
  const [pendingSends, setPendingSends] = useState<
    Array<{ clientId: string; bodyText: string; subject: string; sentAt: Date }>
  >([]);

  // A different person is a different thread: drop stale optimistic bubbles.
  useEffect(() => {
    setPendingSends([]);
  }, [personKey]);

  const conversation = useMemo(() => {
    if (!personKey) return undefined;
    return groupEmailsByPerson(emails ?? [], currentUserEmail).find(
      (candidate) => candidate.personKey === personKey,
    );
  }, [emails, currentUserEmail, personKey]);

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
      router.push('/people');
    }, [messageIds, mutations, router]),
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
      // to the last message id if the thread id is absent.
      const lastMessage = conversation?.messages[conversation.messages.length - 1];
      const selectId = lastMessage?.threadId || lastMessage?.id;
      if (!selectId) return;
      router.push(`/?selected=${encodeURIComponent(selectId)}`);
    }, [conversation, router]),
    onClose: useCallback(() => {
      router.push('/people');
    }, [router]),
  });

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell" aria-label="Conversation">
      <div className="flex h-full flex-col bg-black">
        <header className="flex items-center gap-3 px-4 pt-4 sm:px-6">
          <Link
            href="/people"
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
          ) : isError ? (
            /* P1-B: a failed fetch is not "not found" — say so honestly and
               offer a retry, mirroring PeopleHome. */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-semibold text-white">
                Couldn&apos;t load this conversation
              </p>
              <p className="text-xs text-[#9BA0AA]">
                Check your connection and try again — nothing was lost.
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-1 inline-flex min-h-[44px] items-center rounded-xl bg-[#F97316] px-5 text-sm font-bold text-black transition-colors hover:bg-[#FB8A3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
              >
                Retry
              </button>
            </div>
          ) : !conversation ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-semibold text-white">Conversation not found</p>
              <p className="text-xs text-[#9BA0AA]">
                This person isn&apos;t in your conversations — they may have been archived or deleted.
              </p>
              <Link
                href="/people"
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
                  <ThreadComposer
                    conversation={conversation}
                    currentUserEmail={currentUserEmail}
                    onSendStart={(text, subject) => {
                      const clientId =
                        typeof crypto !== 'undefined' && 'randomUUID' in crypto
                          ? crypto.randomUUID()
                          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                      setPendingSends((prev) => [
                        ...prev,
                        { clientId, bodyText: text, subject, sentAt: new Date() },
                      ]);
                    }}
                    onSent={() => {
                      // The send succeeded: refetch, then swap the optimistic
                      // bubbles for the confirmed messages.
                      void refetch().finally(() => setPendingSends([]));
                    }}
                  />
                )
              }
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
