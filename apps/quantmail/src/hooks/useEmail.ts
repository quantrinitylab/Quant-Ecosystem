// ============================================================================
// QuantMail - useEmail Hook
// Email state management: fetch, send, archive, label, snooze, undo send
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';

interface EmailAddress {
  name?: string;
  email: string;
}

interface Email {
  id: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  body: string;
  snippet: string;
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  isSnoozed: boolean;
  labels: string[];
  category: string;
  threadId: string;
  attachments: { id: string; filename: string; size: number }[];
  receivedAt: string;
}

interface SendEmailParams {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachmentIds?: string[];
  threadId?: string;
  scheduledAt?: string;
}

interface UseEmailOptions {
  category?: string;
  label?: string;
  pageSize?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

interface UseEmailReturn {
  emails: Email[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  totalCount: number;
  unreadCount: number;
  fetchEmails: () => Promise<void>;
  sendEmail: (params: SendEmailParams) => Promise<{ success: boolean; messageId?: string }>;
  archiveEmail: (emailId: string) => Promise<void>;
  archiveEmails: (emailIds: string[]) => Promise<void>;
  deleteEmail: (emailId: string) => Promise<void>;
  deleteEmails: (emailIds: string[]) => Promise<void>;
  starEmail: (emailId: string) => Promise<void>;
  unstarEmail: (emailId: string) => Promise<void>;
  markRead: (emailId: string) => Promise<void>;
  markUnread: (emailId: string) => Promise<void>;
  addLabel: (emailId: string, label: string) => Promise<void>;
  removeLabel: (emailId: string, label: string) => Promise<void>;
  snoozeEmail: (emailId: string, until: Date) => Promise<void>;
  undoSend: (messageId: string) => Promise<boolean>;
  moveToCategory: (emailId: string, category: string) => Promise<void>;
  setPage: (page: number) => void;
  refresh: () => Promise<void>;
}

export function useEmail(options: UseEmailOptions = {}): UseEmailReturn {
  const {
    category = 'primary',
    label,
    pageSize = 50,
    autoRefresh = true,
    refreshInterval = 30000,
  } = options;

  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const undoTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        category,
        page: String(page),
        limit: String(pageSize),
        ...(label && { label }),
      });
      const response = await apiRequest(`/api/emails?${params}`);
      if (!response.ok) throw new Error(`Failed to fetch emails: ${response.statusText}`);
      const data = await response.json();
      setEmails(data.emails || []);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.total || 0);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load emails');
    } finally {
      setLoading(false);
    }
  }, [category, page, pageSize, label]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    if (autoRefresh) {
      refreshTimerRef.current = setInterval(fetchEmails, refreshInterval);
      return () => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      };
    }
  }, [autoRefresh, refreshInterval, fetchEmails]);

  const sendEmail = useCallback(
    async (params: SendEmailParams): Promise<{ success: boolean; messageId?: string }> => {
      try {
        const response = await apiRequest('/api/emails/send', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        if (!response.ok) throw new Error('Failed to send email');
        const data = await response.json();
        return { success: true, messageId: data.messageId };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Send failed');
        return { success: false };
      }
    },
    [],
  );

  const archiveEmail = useCallback(
    async (emailId: string) => {
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
      try {
        const response = await apiRequest(`/api/emails/${emailId}/archive`, { method: 'POST' });
        if (!response.ok) throw new Error('Archive failed');
      } catch (err) {
        fetchEmails();
        setError(err instanceof Error ? err.message : 'Archive failed');
      }
    },
    [fetchEmails],
  );

  const archiveEmails = useCallback(
    async (emailIds: string[]) => {
      setEmails((prev) => prev.filter((e) => !emailIds.includes(e.id)));
      try {
        const response = await apiRequest('/api/emails/batch/archive', {
          method: 'POST',
          body: JSON.stringify({ emailIds }),
        });
        if (!response.ok) throw new Error('Batch archive failed');
      } catch (err) {
        fetchEmails();
      }
    },
    [fetchEmails],
  );

  const deleteEmail = useCallback(
    async (emailId: string) => {
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
      try {
        await apiRequest(`/api/emails/${emailId}`, { method: 'DELETE' });
      } catch (err) {
        fetchEmails();
      }
    },
    [fetchEmails],
  );

  const deleteEmails = useCallback(
    async (emailIds: string[]) => {
      setEmails((prev) => prev.filter((e) => !emailIds.includes(e.id)));
      try {
        await apiRequest('/api/emails/batch/delete', {
          method: 'POST',
          body: JSON.stringify({ emailIds }),
        });
      } catch (err) {
        fetchEmails();
      }
    },
    [fetchEmails],
  );

  const starEmail = useCallback(async (emailId: string) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: true } : e)));
    try {
      await apiRequest(`/api/emails/${emailId}/star`, {
        method: 'PUT',
        body: JSON.stringify({ starred: true }),
      });
    } catch (err) {
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: false } : e)));
    }
  }, []);

  const unstarEmail = useCallback(async (emailId: string) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: false } : e)));
    try {
      await apiRequest(`/api/emails/${emailId}/star`, {
        method: 'PUT',
        body: JSON.stringify({ starred: false }),
      });
    } catch (err) {
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isStarred: true } : e)));
    }
  }, []);

  const markRead = useCallback(async (emailId: string) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isRead: true } : e)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await apiRequest(`/api/emails/${emailId}/read`, {
        method: 'PUT',
        body: JSON.stringify({ read: true }),
      });
    } catch (err) {
      /* optimistic update stays */
    }
  }, []);

  const markUnread = useCallback(async (emailId: string) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isRead: false } : e)));
    setUnreadCount((prev) => prev + 1);
    try {
      await apiRequest(`/api/emails/${emailId}/read`, {
        method: 'PUT',
        body: JSON.stringify({ read: false }),
      });
    } catch (err) {
      /* optimistic update stays */
    }
  }, []);

  const addLabel = useCallback(async (emailId: string, labelName: string) => {
    setEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, labels: [...e.labels, labelName] } : e)),
    );
    try {
      await apiRequest(`/api/emails/${emailId}/labels`, {
        method: 'POST',
        body: JSON.stringify({ label: labelName }),
      });
    } catch (err) {
      setEmails((prev) =>
        prev.map((e) =>
          e.id === emailId ? { ...e, labels: e.labels.filter((l) => l !== labelName) } : e,
        ),
      );
    }
  }, []);

  const removeLabel = useCallback(async (emailId: string, labelName: string) => {
    setEmails((prev) =>
      prev.map((e) =>
        e.id === emailId ? { ...e, labels: e.labels.filter((l) => l !== labelName) } : e,
      ),
    );
    try {
      await apiRequest(`/api/emails/${emailId}/labels/${encodeURIComponent(labelName)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      setEmails((prev) =>
        prev.map((e) => (e.id === emailId ? { ...e, labels: [...e.labels, labelName] } : e)),
      );
    }
  }, []);

  const snoozeEmail = useCallback(async (emailId: string, until: Date) => {
    setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isSnoozed: true } : e)));
    try {
      await apiRequest(`/api/emails/${emailId}/snooze`, {
        method: 'POST',
        body: JSON.stringify({ snoozeUntil: until.toISOString() }),
      });
    } catch (err) {
      setEmails((prev) => prev.map((e) => (e.id === emailId ? { ...e, isSnoozed: false } : e)));
    }
  }, []);

  const undoSend = useCallback(async (messageId: string): Promise<boolean> => {
    try {
      const response = await apiRequest(`/api/emails/${messageId}/undo-send`, { method: 'POST' });
      return response.ok;
    } catch {
      return false;
    }
  }, []);

  const moveToCategory = useCallback(
    async (emailId: string, newCategory: string) => {
      setEmails((prev) => prev.filter((e) => e.id !== emailId));
      try {
        await apiRequest(`/api/emails/${emailId}/category`, {
          method: 'PUT',
          body: JSON.stringify({ category: newCategory }),
        });
      } catch (err) {
        fetchEmails();
      }
    },
    [fetchEmails],
  );

  const refresh = useCallback(async () => {
    await fetchEmails();
  }, [fetchEmails]);

  return {
    emails,
    loading,
    error,
    page,
    totalPages,
    totalCount,
    unreadCount,
    fetchEmails,
    sendEmail,
    archiveEmail,
    archiveEmails,
    deleteEmail,
    deleteEmails,
    starEmail,
    unstarEmail,
    markRead,
    markUnread,
    addLabel,
    removeLabel,
    snoozeEmail,
    undoSend,
    moveToCategory,
    setPage,
    refresh,
  };
}

export default useEmail;
