// ============================================================================
// QuantChat - Calls Page
// Call history (real backend records) and entry into QuantMeet, the app's
// real calling surface. Previously this Pages-Router page rendered raw
// unstyled HTML (no _app.tsx, and its custom CSS classes were never defined)
// and the "new call" button had no handler at all.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '../services/api-client';

interface CallHistoryEntry {
  id: string;
  conversationId?: string;
  initiatorId?: string;
  type?: string;
  status?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  duration?: number | null;
  participants?: string[];
  roomId?: string | null;
  createdAt?: string;
}

type Filter = 'all' | 'missed' | 'incoming' | 'outgoing';

export const CallsPage: React.FC = () => {
  const router = useRouter();
  const [calls, setCalls] = useState<CallHistoryEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const loadCallHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // apiClient.getCallHistory() -> GET /api/calls/history -> backend
      // CallRecordService. The backend wraps records in
      // { calls, page, pageSize, total }; unwrap defensively.
      const response = await apiClient.getCallHistory();
      if (response.success && response.data) {
        const raw = response.data as unknown;
        const list = Array.isArray(raw)
          ? (raw as CallHistoryEntry[])
          : (raw as { calls?: CallHistoryEntry[] } | null)?.calls ?? [];
        setCalls(list);
      } else {
        setError(response.error?.message || 'Could not load call history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load call history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCallHistory();
    // Resolve the current user id once so incoming/outgoing filters are real.
    void apiClient
      .getMe()
      .then((res) => {
        if (res.success && res.data?.id) setMyUserId(res.data.id);
      })
      .catch(() => {
        /* filters fall back to all/missed only */
      });
  }, [loadCallHistory]);

  // QuantMeet is the app's real calling surface — "new call" opens it so the
  // button always does something real instead of sitting dead.
  const goToMeet = useCallback(() => {
    void router.push('/meet');
  }, [router]);

  const filteredCalls = calls.filter((call) => {
    switch (filter) {
      case 'missed':
        return call.status === 'missed';
      case 'incoming':
        return myUserId != null && call.initiatorId != null && call.initiatorId !== myUserId;
      case 'outgoing':
        return myUserId != null && call.initiatorId === myUserId;
      default:
        return true;
    }
  });

  const callIcon = (call: CallHistoryEntry): string => {
    if (call.status === 'missed') return '📵';
    if (call.type === 'video') return '📹';
    return '📞';
  };

  const callStatusText = (call: CallHistoryEntry): string => {
    if (call.status === 'missed') return 'Missed';
    if (call.status) return call.status.charAt(0).toUpperCase() + call.status.slice(1);
    return call.type === 'video' ? 'Video call' : 'Voice call';
  };

  const formatDuration = (call: CallHistoryEntry): string => {
    if (!call.duration) return '';
    const minutes = Math.floor(call.duration / 60);
    const seconds = call.duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatWhen = (call: CallHistoryEntry): string => {
    const raw = call.startedAt || call.createdAt;
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'missed', label: 'Missed' },
    { id: 'incoming', label: 'Incoming' },
    { id: 'outgoing', label: 'Outgoing' },
  ];

  return (
    <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 py-3">
        <button
          type="button"
          onClick={() => router.push('/')}
          aria-label="Back to chats"
          className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)]"
        >
          ←
        </button>
        <h1 className="flex-1 text-lg font-semibold">Calls</h1>
        <button
          type="button"
          onClick={goToMeet}
          aria-label="Start a new call in QuantMeet"
          title="New call (QuantMeet)"
          className="flex h-11 min-w-[44px] items-center justify-center gap-1 rounded-full bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
        >
          <span aria-hidden="true">📞</span>+
        </button>
      </header>

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`min-h-[44px] rounded-full px-4 text-sm font-medium transition-colors ${
              filter === f.id
                ? 'bg-emerald-500 text-white'
                : 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-border)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--quant-border)] border-t-emerald-500" />
          <span className="sr-only">Loading call history…</span>
        </div>
      ) : error ? (
        <div className="mx-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-sm font-medium text-red-500">{error}</p>
          <button
            type="button"
            onClick={() => void loadCallHistory()}
            className="mt-2 min-h-[44px] rounded-full bg-[var(--quant-muted)] px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      ) : filteredCalls.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
          <span className="text-4xl" aria-hidden="true">
            📞
          </span>
          <p className="font-semibold">No calls yet</p>
          <p className="text-sm text-[var(--quant-muted-foreground)]">
            Start a voice or video call with your friends in QuantMeet
          </p>
          <button
            type="button"
            onClick={goToMeet}
            className="mt-2 min-h-[44px] rounded-full bg-emerald-500 px-5 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Open QuantMeet
          </button>
        </div>
      ) : (
        <main className="space-y-1 px-3 pb-8">
          {filteredCalls.map((call) => (
            <div
              key={call.id}
              className="flex items-center gap-3 rounded-xl p-3 hover:bg-[var(--quant-muted)]"
            >
              <div
                className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-xl ${
                  call.status === 'missed' ? 'bg-red-500/10' : 'bg-[var(--quant-muted)]'
                }`}
                aria-hidden="true"
              >
                {callIcon(call)}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-sm font-medium ${
                    call.status === 'missed' ? 'text-red-500' : ''
                  }`}
                >
                  {callStatusText(call)}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
                  {call.duration ? <span>{formatDuration(call)}</span> : null}
                  <span>{formatWhen(call)}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={goToMeet}
                aria-label={`Call back via QuantMeet (${call.type === 'video' ? 'video' : 'voice'})`}
                title="Call via QuantMeet"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[var(--quant-muted)] text-lg hover:bg-[var(--quant-border)]"
              >
                {call.type === 'video' ? '📹' : '📞'}
              </button>
            </div>
          ))}
        </main>
      )}
    </div>
  );
};

export default CallsPage;
