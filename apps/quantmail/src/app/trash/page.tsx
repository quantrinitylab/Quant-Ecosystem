'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell, Card, Button, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useInbox } from '../../hooks/useInbox';
import { apiClient } from '../../services/api-client';
import { listContainerVariants, listItemVariants } from '../../lib/motion-variants';
import type { Email } from '../../types';

export default function TrashPage() {
  const router = useRouter();
  const { data: emails, isLoading, error, refetch } = useInbox({ folderType: 'TRASH' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!emails) return;
    if (selectedIds.size === emails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emails.map((e) => e.id)));
    }
  }, [emails, selectedIds]);

  const handlePermanentDelete = useCallback(
    async (id: string) => {
      await apiClient.deleteEmail(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refetch();
    },
    [refetch],
  );

  const handleBatchDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map((id) => apiClient.deleteEmail(id)));
    setSelectedIds(new Set());
    refetch();
  }, [selectedIds, refetch]);

  return (
    <AppShell sidebar={<AppSidebar />} className="quantmail-shell">
      <PageTransition className="workspace-page trash-workspace flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <h1 className="text-lg font-semibold">Trash</h1>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleSelectAll}>
              {selectedIds.size === emails?.length ? 'Deselect All' : 'Select All'}
            </Button>
            <Button variant="secondary" onClick={() => void refetch()}>
              Refresh
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              className="flex items-center gap-2 px-4 py-2 bg-[var(--quant-muted)] border-b border-[var(--quant-border)]"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', ...spring.snappy }}
            >
              <span className="text-sm font-medium">{selectedIds.size} selected</span>
              <Button variant="secondary" onClick={handleBatchDelete}>
                Delete Permanently
              </Button>
              <Button variant="secondary" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

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
              title="Trash is empty"
              description="Deleted emails will appear here and be permanently removed after 30 days"
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
                    className="my-2 p-4 hover:bg-[var(--quant-muted)] transition-colors opacity-75"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(email.id)}
                        onChange={() => handleToggleSelect(email.id)}
                        className="mt-1 w-4 h-4 rounded border-[var(--quant-border)]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-[var(--quant-muted-foreground)]">
                            {email.from?.name || email.from?.email || 'Unknown'}
                          </span>
                        </div>
                        <h3 className="text-sm mt-1 text-[var(--quant-muted-foreground)]">
                          {email.subject || '(no subject)'}
                        </h3>
                        <p className="text-xs text-[var(--quant-muted-foreground)] mt-1 truncate">
                          {email.snippet}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <span className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap">
                          {email.receivedAt ? new Date(email.receivedAt).toLocaleDateString() : ''}
                        </span>
                        <button
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-xs text-[var(--quant-destructive)] hover:opacity-80"
                          onClick={() => handlePermanentDelete(email.id)}
                          title="Delete permanently"
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
