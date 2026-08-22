'use client';

import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { PageTransition } from '../../../components/PageTransition';
import { ConversationalThreadView } from '../../../components/ConversationalThreadView';

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const rawThreadId = (params?.id as string) || '';
  const threadId = rawThreadId === 'null' || rawThreadId === 'undefined' ? '' : rawThreadId;

  if (!threadId) {
    return (
      <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
        <PageTransition className="workspace-page thread-workspace flex flex-col h-full bg-[#0a0d14]">
          <div className="flex-1 flex items-center justify-center p-6 text-zinc-400">
            Redirecting to inbox…
          </div>
        </PageTransition>
      </AppShell>
    );
  }

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page thread-workspace flex flex-col h-full bg-[#0a0d14]">
        <ConversationalThreadView
          threadId={threadId}
          onClose={() => router.push('/')}
          onArchive={() => router.push('/')}
          onDelete={() => router.push('/')}
          variant="full"
          className="h-full flex-1"
        />
      </PageTransition>
    </AppShell>
  );
}
