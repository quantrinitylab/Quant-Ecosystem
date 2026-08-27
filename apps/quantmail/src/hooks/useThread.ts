import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Email, EmailThread } from '../types';

export function useThread(threadId: string) {
  return useQuery({
    queryKey: ['thread', threadId],
    queryFn: async (): Promise<EmailThread> => {
      if (!threadId) throw new Error('No thread ID provided');

      // 1. Try fetching from /threads/:id first
      try {
        const response = await apiClient.getThread(threadId);
        if (response.success && response.data) {
          const data = response.data;
          const messages = ((data.messages || (data as any).emails || []) as Email[]).filter(
            Boolean,
          );
          if (messages.length > 0) {
            return {
              ...data,
              messages,
            };
          }
        }
      } catch {
        // fall through to email lookup fallback
      }

      // 2. Fallback: try fetching as an email ID directly via /emails/:id
      try {
        const emailRes = await apiClient.getEmail(threadId);
        if (emailRes.success && emailRes.data) {
          const email = emailRes.data;
          // If the email has a threadId different from its ID, try fetching that thread too
          if (email.threadId && email.threadId !== email.id) {
            try {
              const subThreadRes = await apiClient.getThread(email.threadId);
              if (subThreadRes.success && subThreadRes.data) {
                const subMsgs = (subThreadRes.data.messages ||
                  (subThreadRes.data as any).emails ||
                  []) as Email[];
                if (subMsgs.length > 0) {
                  return { ...subThreadRes.data, messages: subMsgs };
                }
              }
            } catch {
              // ignore
            }
          }

          const fromAddress = email.from?.email || (email as any).fromAddress || '';
          const fromName =
            email.from?.name || (email as any).fromName || fromAddress.split('@')[0] || 'Sender';
          const fromObj = { email: fromAddress, name: fromName };

          const formattedEmail = {
            ...email,
            from: fromObj,
            fromAddress,
            fromName,
          };

          return {
            id: email.threadId || email.id,
            userId: email.userId || '',
            subject: email.subject || '(No Subject)',
            participants: [fromObj, ...(email.to || [])].filter(Boolean),
            messageCount: 1,
            lastMessageAt: email.receivedAt || new Date(),
            isRead: email.isRead,
            isStarred: email.isStarred,
            labels: email.labels || [],
            snippet: email.snippet || '',
            messages: [formattedEmail],
            createdAt: email.createdAt || new Date(),
            updatedAt: email.updatedAt || new Date(),
          };
        }
      } catch {
        // fall through
      }

      throw new Error('Failed to load email conversation. Please refresh.');
    },
    enabled: !!threadId,
    retry: 2,
  });
}

export default useThread;
