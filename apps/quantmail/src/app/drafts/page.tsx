'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, Badge, Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useInbox } from '../../hooks/useInbox';
import { apiClient } from '../../services/api-client';
import { listContainerVariants, listItemVariants } from '../../lib/motion-variants';
import type { Email } from '../../types';

export default function DraftsPage() {
  const router = useRouter();
  const { data: emails, isLoading, error, refetch } = useInbox({ folderType: 'DRAFTS' });

  const handleDraftClick = useCallback(
    (email: Email) => {
      router.push(`/compose?draftId=${email.id}`);
    },
    [router],
  );

  const handleDeleteDraft = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await apiClient.deleteEmail(id);
      refetch();
    },
    [refetch],
  );

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page drafts-workspace flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <h1 className="text-lg font-semibold">Drafts</h1>
          <Button variant="secondary" onClick={() => void refetch()}>
            Refresh
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="80px" />
              ))}
            </div>
          )}

          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

          {!isLoading && !error && (!emails || emails.length === 0) && (
            <EmptyState
              title="Start a draft when a message needs shaping"
              description="Drafts hold unfinished emails so you can return with the subject, recipients, and final details still in place."
              actionLabel="Compose draft"
              onAction={() => router.push('/compose')}
            />
          )}

          {!isLoading && !error && emails && emails.length > 0 && (
            <motion.div
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
              className="p-4"
            >
              {emails.map((email) => (
                <motion.div key={email.id} variants={listItemVariants}>
                  <Card
                    padding="none"
                    className="my-2 p-4 cursor-pointer hover:bg-[var(--quant-muted)] transition-colors border-l-4 border-l-yellow-500"
                    onClick={() => handleDraftClick(email)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="warning">Draft</Badge>
                          <span className="text-sm text-[var(--quant-muted-foreground)]">
                            To:{' '}
                            {email.to?.map((t) => t.name || t.email).join(', ') || '(no recipient)'}
                          </span>
                        </div>
                        <h3 className="text-sm mt-1 font-medium">
                          {email.subject || '(no subject)'}
                        </h3>
                        <p className="text-xs text-[var(--quant-muted-foreground)] mt-1 truncate">
                          {email.snippet || email.bodyText?.slice(0, 100) || ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap">
                          {email.receivedAt ? new Date(email.receivedAt).toLocaleDateString() : ''}
                        </span>
                        <button
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-xs text-[var(--quant-muted-foreground)] hover:text-[var(--quant-destructive)]"
                          onClick={(e) => handleDeleteDraft(e, email.id)}
                          title="Delete draft"
                        >
                          &#128465;
                        </button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
