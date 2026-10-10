'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from './AppShell';
import { AppSidebar } from './AppSidebar';
import { useInbox } from '../hooks/useInbox';
import { useAuth } from '../providers/auth-provider';
import {
  groupEmailsByPerson,
  type ConversationWorld,
  type PersonConversation,
} from '../lib/peopleGrouping';
import { PeopleWorldTabs } from './PeopleWorldTabs';
import { PeopleList } from './PeopleList';

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
 * Lives in components/ (not in an app/ route file) because Next.js App
 * Router route files may only export the default page component plus the
 * documented route-segment config exports — a shared named export like
 * this one breaks `next build` type validation.
 */
export function PeopleHome() {
  const router = useRouter();
  const { user } = useAuth();
  const currentUserEmail = user?.email ?? '';
  const [world, setWorld] = useState<ConversationWorld>('log');

  const { data: emails, isLoading, isError, refetch } = useInbox();
  const [searchQuery, setSearchQuery] = useState('');

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
    router.push(`/people/${encodeURIComponent(conversation.personKey)}`);
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell" aria-label="QuantMail people">
      <div className="flex h-full flex-col bg-black">
        <header className="px-4 pb-2 pt-4 sm:px-6">
          <h1 className="text-xl font-bold text-white">People</h1>
          <p className="mt-0.5 text-xs text-[#9BA0AA]">
            Every person you talk to, in one place — your whole conversation with each of them.
          </p>
        </header>

        <div className="px-4 sm:px-6">
          <PeopleWorldTabs world={world} onChange={setWorld} counts={counts} />
        </div>

        <div className="mt-2 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
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
            <PeopleList
              conversations={visible}
              onSelect={handleSelect}
              searchQuery={searchQuery}
              onSearchQuery={setSearchQuery}
              loading={isLoading}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
