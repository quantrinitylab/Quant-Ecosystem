'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { useInbox } from '../../../hooks/useInbox';
import { useAuth } from '../../../providers/auth-provider';
import { groupEmailsByPerson } from '../../../lib/peopleGrouping';
import { PersonThread } from '../../../components/PersonThread';
import { ThreadComposer } from '../../../components/ThreadComposer';

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
  const { user } = useAuth();
  const currentUserEmail = user?.email ?? '';

  const rawPersonId = typeof params?.personId === 'string' ? params.personId : '';
  const personKey = useMemo(() => {
    try {
      return decodeURIComponent(rawPersonId);
    } catch {
      return rawPersonId;
    }
  }, [rawPersonId]);

  const { data: emails, isLoading, refetch } = useInbox();

  const conversation = useMemo(() => {
    if (!personKey) return undefined;
    return groupEmailsByPerson(emails ?? [], currentUserEmail).find(
      (candidate) => candidate.personKey === personKey,
    );
  }, [emails, currentUserEmail, personKey]);

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
              conversation={conversation}
              currentUserEmail={currentUserEmail}
              renderComposer={
                conversation.world === 'updates' ? undefined : (
                  <ThreadComposer
                    conversation={conversation}
                    currentUserEmail={currentUserEmail}
                    onSent={() => void refetch()}
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
