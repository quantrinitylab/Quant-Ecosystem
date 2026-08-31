'use client';

import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { PageTransition } from '../../../components/PageTransition';
import { ConversationalThreadView } from '../../../components/ConversationalThreadView';
import { useMailMutations } from '../../../hooks/useMailMutations';

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const mutations = useMailMutations();
  const rawThreadId = (params?.id as string) || '';
  const threadId = rawThreadId === 'null' || rawThreadId === 'undefined' ? '' : rawThreadId;

  if (!threadId) {
    return (
      <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
        <PageTransition className="workspace-page thread-workspace flex flex-col h-full bg-[#0a0d14]">
          <div className="flex-1 flex items-center justify-center p-6 text-[#A1A4AC]">
            Redirecting to inbox…
          </div>
        </PageTransition>
      </AppShell>
    );
  }

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page thread-workspace flex flex-col h-full bg-[#090A0C]">
        <ConversationalThreadView
          threadId={threadId}
          onClose={() => router.push('/')}
          /*
           * These two used to only `router.push('/')`. On a phone every conversation
           * is opened on this route, so Archive was the button that looked like it
           * worked and did nothing at all: back to the inbox, mail still in it.
           *
           * The mutation is optimistic and queued through the outbox, so it survives
           * the navigation that follows it — no need to await before leaving.
           */
          onArchive={(ids) => {
            void mutations.archive(ids);
            router.push('/');
          }}
          onDelete={(ids) => {
            void mutations.trash(ids);
            router.push('/');
          }}
          variant="full"
          className="h-full flex-1"
        />
      </PageTransition>
    </AppShell>
  );
}
