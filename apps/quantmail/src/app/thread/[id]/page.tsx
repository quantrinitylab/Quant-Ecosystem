'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { ConversationalThreadView } from '../../../components/ConversationalThreadView';
import { useMailMutations } from '../../../hooks/useMailMutations';

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

  const leaveThread = useCallback(
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

  /*
   * If threadId is missing, redirect to returnTo or inbox root.
   */
  useEffect(() => {
    if (!threadId) router.replace(returnTo || '/');
  }, [returnTo, router, threadId]);

  if (!threadId) {
    return (
      <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
        <div className="workspace-page thread-workspace flex flex-col h-full bg-[#0a0d14]">
          <div className="flex-1 flex items-center justify-center p-6 text-[#A1A4AC]" role="status">
            Returning to inbox…
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="workspace-page thread-workspace flex flex-col h-full bg-[#090A0C]">
        <ConversationalThreadView
          threadId={threadId}
          onClose={() => leaveThread(false)}
          /*
           * These mutations are optimistic and queued through the outbox, so they
           * survive navigation. Navigating to returnTo preserves the user's lens
           * (?lens=groups, ?lens=contacts, etc.) instead of dumping them to All.
           */
          onArchive={(ids) => {
            void mutations.archive(ids);
            leaveThread(true);
          }}
          onDelete={(ids) => {
            void mutations.trash(ids);
            leaveThread(true);
          }}
          variant="full"
          className="h-full flex-1"
        />
      </div>
    </AppShell>
  );
}
