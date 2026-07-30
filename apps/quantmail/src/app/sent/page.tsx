'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Card, Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useInbox } from '../../hooks/useInbox';
import { listContainerVariants, listItemVariants } from '../../lib/motion-variants';
import type { Email } from '../../types';

export default function SentPage() {
  const router = useRouter();
  const { data: emails, isLoading, error, refetch } = useInbox({ folderType: 'SENT' });

  const handleEmailClick = useCallback(
    (email: Email) => {
      router.push(`/thread/${email.threadId}`);
    },
    [router],
  );

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page sent-workspace flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <h1 className="text-lg font-semibold">Sent</h1>
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
              title="Your sent conversations will show up here"
              description="After you send a message, QuantMail keeps the delivery trail here so you can revisit what left your workspace and who received it."
              actionLabel="Compose email"
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
                    className="my-2 p-4 cursor-pointer hover:bg-[var(--quant-muted)] transition-colors"
                    onClick={() => handleEmailClick(email)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-normal">
                            To: {email.to?.map((t) => t.name || t.email).join(', ') || 'Unknown'}
                          </span>
                        </div>
                        <h3 className="text-sm mt-1">{email.subject}</h3>
                        <p className="text-xs text-[var(--quant-muted-foreground)] mt-1 truncate">
                          {email.snippet}
                        </p>
                      </div>
                      <span className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap ml-4">
                        {email.receivedAt ? new Date(email.receivedAt).toLocaleDateString() : ''}
                      </span>
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
