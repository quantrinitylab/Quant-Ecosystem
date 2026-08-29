'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button, Skeleton } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import { AppSidebar } from '../../components/AppSidebar';
import { showToast } from '../../components/InboxToast';
import { IconTrash, IconUndo } from '../../components/icons';
import { PageTransition } from '../../components/PageTransition';
import { useConfirm } from '../../hooks/useConfirm';
import { useInbox } from '../../hooks/useInbox';
import { apiClient } from '../../services/api-client';
import { listContainerVariants, listItemVariants } from '../../lib/motion-variants';

export default function TrashPage() {
  const router = useRouter();
  const { data: emails, isLoading, error, refetch } = useInbox({ folderType: 'TRASH' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { confirm, dialog } = useConfirm();

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
      const ok = await confirm({
        title: 'Delete this email permanently?',
        message:
          'It leaves trash and is gone for good — there is no undo and no copy left on the server.',
        confirmLabel: 'Delete permanently',
        variant: 'destructive',
      });
      if (!ok) return;
      const response = await apiClient.deleteEmail(id);
      if (!response.success) {
        showToast({
          text: response.error?.message || 'Email could not be permanently deleted',
          type: 'error',
        });
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast({ text: 'Email permanently deleted', type: 'success' });
      await refetch();
    },
    [confirm, refetch],
  );

  const handleRestore = useCallback(
    async (id: string) => {
      const response = await apiClient.restoreEmail(id);
      if (!response.success) {
        showToast({
          text: response.error?.message || 'Email could not be restored',
          type: 'error',
        });
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      showToast({ text: 'Email restored to inbox', type: 'success' });
      await refetch();
    },
    [refetch],
  );

  const handleBatchDelete = useCallback(async () => {
    const count = selectedIds.size;
    const ok = await confirm({
      title: `Delete ${count} email${count === 1 ? '' : 's'} permanently?`,
      message:
        'They leave trash and are gone for good — there is no undo and no copy left on the server.',
      confirmLabel: 'Delete permanently',
      variant: 'destructive',
    });
    if (!ok) return;
    const ids = Array.from(selectedIds);
    const responses = await Promise.all(ids.map((id) => apiClient.deleteEmail(id)));
    const failed = responses.find((response) => !response.success);
    if (failed) {
      showToast({
        text: failed.error?.message || 'Some emails could not be permanently deleted',
        type: 'error',
      });
      return;
    }
    setSelectedIds(new Set());
    showToast({ text: `${ids.length} email(s) permanently deleted`, type: 'success' });
    await refetch();
  }, [selectedIds, confirm, refetch]);

  const handleBatchRestore = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const responses = await Promise.all(ids.map((id) => apiClient.restoreEmail(id)));
    const failed = responses.find((response) => !response.success);
    if (failed) {
      showToast({
        text: failed.error?.message || 'Some emails could not be restored',
        type: 'error',
      });
      return;
    }
    setSelectedIds(new Set());
    showToast({ text: `${ids.length} email(s) restored`, type: 'success' });
    await refetch();
  }, [selectedIds, refetch]);

  const handleEmptyTrash = useCallback(async () => {
    const count = emails?.length ?? 0;
    if (count === 0) return;
    const ok = await confirm({
      title: `Empty trash — all ${count} item${count === 1 ? '' : 's'}?`,
      message:
        'Everything in trash is deleted for good, including messages still inside their 30-day recovery window.',
      confirmLabel: 'Empty trash',
      variant: 'destructive',
    });
    if (!ok) return;
    // This used to swallow its result: a failed delete left the row on screen with
    // no explanation, and the refetch made it look like a no-op rather than an
    // error.
    const responses = await Promise.all(
      (emails ?? []).map((email) => apiClient.deleteEmail(email.id)),
    );
    const failed = responses.find((response) => !response.success);
    setSelectedIds(new Set());
    await refetch();
    if (failed) {
      showToast({
        text: failed.error?.message || 'Some emails could not be permanently deleted',
        type: 'error',
      });
      return;
    }
    showToast({ text: 'Trash is empty', type: 'success' });
  }, [emails, confirm, refetch]);

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page trash-workspace flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b border-[var(--quant-border)]">
          <div>
            <h1 className="text-lg font-semibold">Trash</h1>
            <p className="text-xs text-[var(--quant-muted-foreground)]">
              Messages here will be permanently deleted after 30 days
            </p>
          </div>
          <div className="flex items-center gap-2">
            {emails && emails.length > 0 && (
              <Button variant="secondary" onClick={() => void handleEmptyTrash()}>
                Empty Trash
              </Button>
            )}
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
              <Button variant="secondary" onClick={handleBatchRestore}>
                Restore
              </Button>
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
              title="Trash is clear"
              description="Deleted emails pause here for 30 days before permanent removal, giving you a recovery window if something was removed by mistake."
              actionLabel="Go to inbox"
              onAction={() => router.push('/')}
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
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--quant-foreground)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] rounded-lg"
                          onClick={() => handleRestore(email.id)}
                          title="Restore to inbox"
                          aria-label="Restore to inbox"
                        >
                          <IconUndo size={15} />
                        </button>
                        <button
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-[var(--quant-destructive)] hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] rounded-lg"
                          onClick={() => handlePermanentDelete(email.id)}
                          title="Delete permanently"
                          aria-label="Delete permanently"
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
        {dialog}
      </PageTransition>
    </AppShell>
  );
}
