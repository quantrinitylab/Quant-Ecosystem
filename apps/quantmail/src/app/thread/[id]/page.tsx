'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell, Card, Avatar, Badge, Button, Skeleton } from '@quant/shared-ui';
import { ErrorState, EmptyState } from '@quant/shared-ui';
import { AppSidebar } from '../../../components/AppSidebar';
import { PageTransition } from '../../../components/PageTransition';
import { useThread } from '../../../hooks/useThread';
import { apiClient } from '../../../services/api-client';
import type { Email } from '../../../types';

export default function ThreadPage() {
  const params = useParams();
  const router = useRouter();
  const threadId = (params?.id as string) || '';
  const { data: thread, isLoading, error, refetch } = useThread(threadId);
  const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());

  const toggleMessage = useCallback((index: number) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const handleArchive = useCallback(async () => {
    if (!thread?.messages?.[0]) return;
    await apiClient.archiveEmail(thread.messages[0].id);
    router.push('/');
  }, [thread, router]);

  const handleStar = useCallback(async () => {
    if (!thread?.messages?.[0]) return;
    await apiClient.toggleStar(thread.messages[0].id);
    refetch();
  }, [thread, refetch]);

  const handleDelete = useCallback(async () => {
    if (!thread?.messages?.[0]) return;
    await apiClient.deleteEmail(thread.messages[0].id);
    router.push('/');
  }, [thread, router]);

  const handleReply = useCallback(() => {
    router.push(`/compose?replyTo=${threadId}`);
  }, [router, threadId]);

  const handleForward = useCallback(
    (emailId: string) => {
      router.push(`/compose?forward=${emailId}`);
    },
    [router],
  );

  const isExpanded = (index: number, total: number) => {
    if (index === total - 1) return true;
    return expandedMessages.has(index);
  };

  return (
    <AppShell sidebar={<AppSidebar />}>
      <PageTransition className="flex flex-col h-full">
        {/* Top bar */}
        <div className="flex items-center gap-2 p-4 border-b border-[var(--quant-border)]">
          <Button variant="secondary" onClick={() => router.push('/')}>
            Back
          </Button>
          {thread && (
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="secondary" onClick={handleArchive}>
                Archive
              </Button>
              <Button variant="secondary" onClick={handleStar}>
                {thread.isStarred ? 'Unstar' : 'Star'}
              </Button>
              <Button variant="secondary" onClick={handleDelete}>
                Delete
              </Button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton variant="rect" width="60%" height="32px" />
              <Skeleton variant="rect" width="100%" height="200px" />
              <Skeleton variant="rect" width="100%" height="200px" />
            </div>
          )}
          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}
          {!isLoading && !error && !thread && (
            <EmptyState title="Thread not found" description="This thread may have been deleted" />
          )}
          {!isLoading && !error && thread && (
            <>
              <h1 className="text-xl md:text-2xl font-bold mb-4">{thread.subject}</h1>
              <div className="flex items-center gap-2 mb-6 text-sm text-[var(--quant-muted-foreground)]">
                <span>{thread.messageCount} messages</span>
                <span>-</span>
                <span>{thread.participants?.map((p) => p.name || p.email).join(', ')}</span>
              </div>

              <div className="space-y-4">
                {thread.messages?.map((message: Email, index: number) => {
                  const expanded = isExpanded(index, thread.messages.length);
                  return (
                    <Card key={message.id} padding="none" className="overflow-hidden">
                      <div
                        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-[var(--quant-muted)]"
                        onClick={() => toggleMessage(index)}
                      >
                        <Avatar
                          src={undefined}
                          name={message.from?.name || message.from?.email || '?'}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {message.from?.name || message.from?.email}
                            </span>
                            {!message.isRead && <Badge variant="info">New</Badge>}
                          </div>
                          {!expanded && (
                            <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                              {message.snippet}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-[var(--quant-muted-foreground)] whitespace-nowrap">
                          {message.receivedAt
                            ? new Date(message.receivedAt).toLocaleDateString()
                            : ''}
                        </span>
                      </div>
                      {expanded && (
                        <div className="px-4 pb-4 border-t border-[var(--quant-border)]">
                          <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap">
                            {message.bodyText || message.snippet}
                          </div>
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {message.attachments.map((att) => (
                                <div
                                  key={att.id}
                                  className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--quant-muted)] text-sm"
                                >
                                  <span>{att.filename}</span>
                                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                                    ({(att.size / 1024).toFixed(1)} KB)
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 mt-4">
                            <Button variant="secondary" onClick={handleReply}>
                              Reply
                            </Button>
                            <Button variant="secondary" onClick={() => handleForward(message.id)}>
                              Forward
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* Reply footer */}
              <div className="mt-6 pt-4 border-t border-[var(--quant-border)]">
                <Button variant="primary" onClick={handleReply}>
                  Reply to thread
                </Button>
              </div>
            </>
          )}
        </div>
      </PageTransition>
    </AppShell>
  );
}
